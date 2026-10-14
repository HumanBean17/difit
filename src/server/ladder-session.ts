import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type {
  CommentImport,
  DiffCommentThread,
  DiffCommentThreadStatus,
  DiffResponse,
  DiffSelection,
} from '../types/diff.js';
import type {
  FinishSummary,
  LadderInfo,
  LadderRung,
  LadderRungStatus,
  LadderThreadView,
  LadderView,
  RungApproval,
  ThreadLadderTag,
} from '../types/ladder.js';
import { mergeCommentImports, mergeCommentThreads } from '../utils/commentImports.js';
import { createDiffSelection } from '../utils/diffSelection.js';
import { withThreadStatus } from '../utils/threadStatus.js';
import {
  buildDiffLineIndex,
  reanchorPosition,
  type DiffLineIndex,
} from '../utils/threadAnchors.js';

import { LadderGit } from './ladder-git.js';
import { ReviewEvents } from './review-events.js';

interface ApprovalRecord {
  patchId: string | null;
  subject: string;
  approvedAt: string;
}

interface LadderStateFile {
  version: 1;
  base: string;
  baseSha: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
  rungs: LadderRung[];
  threads: DiffCommentThread[];
  tags: Record<string, ThreadLadderTag>;
  approvals: Record<string, ApprovalRecord>;
  submittedMessageIds: string[];
  lastRewrite?: LadderInfo['lastRewrite'];
}

type DiffLoader = (selection: DiffSelection) => Promise<DiffResponse>;

interface OpenLadderOptions {
  repoPath: string;
  base: string;
  commitish?: string;
  loadDiff: DiffLoader;
}

function stateFileName(branch: string, baseSha: string): string {
  return `${branch.replace(/[/\\]/g, '__')}@${baseSha}.json`;
}

function shaMatches(fullSha: string, candidate: string | undefined): boolean {
  return candidate !== undefined && candidate.length >= 4 && fullSha.startsWith(candidate);
}

/**
 * A review-ladder session: the commits base..branch as rungs, followed by
 * branch ref, with one server-owned thread store that survives ladder rewrites
 * and restarts (`.git/difit/<branch>@<base-sha>.json`).
 */
export class LadderSession {
  version = 0;
  readonly events: ReviewEvents;
  private rungs: LadderRung[];
  private tipSha: string;
  private threads: DiffCommentThread[];
  private tags: Record<string, ThreadLadderTag>;
  private approvals: Record<string, ApprovalRecord>;
  private lastRewrite: LadderInfo['lastRewrite'];
  private readonly createdAt: string;
  private readonly patchIds = new Map<string, string | null>();
  private finished = false;

  private constructor(
    private readonly git: LadderGit,
    private readonly loadDiff: DiffLoader,
    readonly base: string,
    readonly baseSha: string,
    readonly branch: string,
    readonly statePath: string,
    state: LadderStateFile | null,
    tipSha: string,
  ) {
    this.rungs = state?.rungs ?? [];
    this.tipSha = state?.rungs.at(-1)?.sha ?? tipSha;
    this.threads = state?.threads ?? [];
    this.tags = state?.tags ?? {};
    this.approvals = state?.approvals ?? {};
    this.lastRewrite = state?.lastRewrite;
    this.createdAt = state?.createdAt ?? new Date().toISOString();
    this.events = new ReviewEvents(state?.submittedMessageIds ?? [], () => this.persist());
  }

  static async open({ repoPath, base, commitish, loadDiff }: OpenLadderOptions) {
    const git = new LadderGit(repoPath);
    const branch = await git.resolveBranch(commitish);
    const baseSha = await git.mergeBase(base, branch);
    const tipSha = await git.branchTip(branch);
    const statePath = join(await git.gitDir(), 'difit', stateFileName(branch, baseSha));

    let state: LadderStateFile | null = null;
    if (existsSync(statePath)) {
      state = JSON.parse(readFileSync(statePath, 'utf8')) as LadderStateFile;
    }

    const session = new LadderSession(
      git,
      loadDiff,
      base,
      baseSha,
      branch,
      statePath,
      state,
      tipSha,
    );
    // Picks up rewrites made while difit was down; a fresh session just lists its rungs.
    await session.refresh();
    session.persist();
    return session;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get rungCount(): number {
    return this.rungs.length;
  }

  rung(index: number): LadderRung | undefined {
    return this.rungs[index - 1];
  }

  /** Re-reads the branch. Returns true when the ladder changed; threads keep their rung. */
  async refresh(): Promise<boolean> {
    const nextTip = await this.git.branchTip(this.branch);
    const nextRungs = await this.git.listRungs(this.baseSha, this.branch);
    const sameShape =
      nextRungs.length === this.rungs.length &&
      nextRungs.every((rung, i) => rung.sha === this.rungs[i]?.sha);
    if (sameShape && nextTip === this.tipSha) {
      return false;
    }

    const previous = this.rungs;
    // Rung identity is its position, confirmed by its subject; anything else is unplaced.
    for (const tag of Object.values(this.tags)) {
      if (tag.rung === null || tag.unplaced) continue;
      const before = previous[tag.rung - 1];
      const after = nextRungs[tag.rung - 1];
      if (previous.length > 0 && (!before || !after || before.subject !== after.subject)) {
        tag.unplaced = true;
      }
    }

    const changed = previous
      .map((rung, i) => ({ index: i + 1, from: rung.sha, to: nextRungs[i]?.sha }))
      .filter(
        (entry): entry is { index: number; from: string; to: string } =>
          entry.to !== undefined && entry.from !== entry.to,
      );
    if (previous.length > 0) {
      this.lastRewrite = { at: new Date().toISOString(), changed };
    }

    this.rungs = nextRungs;
    this.tipSha = nextTip;
    this.version += 1;
    this.persist();
    return true;
  }

  resolveView(base?: string, target?: string): LadderView | null {
    if (!target) return null;
    const rung = this.rungs.find(
      (candidate) => shaMatches(candidate.sha, target) && shaMatches(candidate.parentSha, base),
    );
    if (rung) return { kind: 'rung', index: rung.index };
    if (shaMatches(this.tipSha, target) && shaMatches(this.baseSha, base)) {
      return { kind: 'all' };
    }
    return null;
  }

  selectionFor(view: LadderView): DiffSelection {
    if (view.kind === 'rung') {
      const rung = this.rung(view.index);
      if (rung) return createDiffSelection(rung.parentSha, rung.sha);
    }
    return createDiffSelection(this.baseSha, this.tipSha);
  }

  initialSelection(): DiffSelection {
    return this.selectionFor(this.rungs.length > 0 ? { kind: 'rung', index: 1 } : { kind: 'all' });
  }

  private targetSha(view: LadderView): string {
    return view.kind === 'rung' ? (this.rung(view.index)?.sha ?? this.tipSha) : this.tipSha;
  }

  private tagOf(thread: DiffCommentThread): ThreadLadderTag {
    let tag = this.tags[thread.id];
    if (!tag) {
      tag = { rung: null, subject: null, view: 'all', anchoredSha: this.tipSha };
      this.tags[thread.id] = tag;
    }
    return tag;
  }

  private isVisible(thread: DiffCommentThread, view: LadderView): boolean {
    const tag = this.tagOf(thread);
    if (tag.unplaced) return false;
    return view.kind === 'all' || tag.rung === view.index;
  }

  private isHome(tag: ThreadLadderTag, view: LadderView): boolean {
    return view.kind === 'all'
      ? tag.view === 'all'
      : tag.view === 'rung' && tag.rung === view.index;
  }

  /** The view's threads, positioned on its lines. */
  async threadsFor(view: LadderView): Promise<DiffCommentThread[]> {
    const visible = this.threads.filter((thread) => this.isVisible(thread, view));
    const targetSha = this.targetSha(view);
    const needsDiff = visible.some((thread) => {
      const tag = this.tagOf(thread);
      return (
        thread.position !== undefined && !(this.isHome(tag, view) && tag.anchoredSha === targetSha)
      );
    });

    let indexes: Map<string, DiffLineIndex> | null = null;
    if (needsDiff) {
      try {
        const diff = await this.loadDiff(this.selectionFor(view));
        indexes = new Map(diff.files.map((file) => [file.path, buildDiffLineIndex(file)]));
      } catch {
        indexes = null;
      }
    }

    let dirty = false;
    const result = visible.map((thread) => {
      const tag = this.tagOf(thread);
      if (thread.position === undefined || thread.filePath === null) return thread;
      const home = this.isHome(tag, view);
      if (home && tag.anchoredSha === targetSha) return thread;
      if (!indexes) return thread;

      const moved = reanchorPosition(thread, indexes.get(thread.filePath));
      if (home) {
        // The home rung was rewritten: store the new anchor.
        if (moved) thread.position = moved;
        tag.anchoredSha = targetSha;
        dirty = true;
        return thread;
      }
      return moved ? { ...thread, position: moved } : thread;
    });

    if (dirty) this.persist();
    return result;
  }

  private async tagForNewThread(
    thread: DiffCommentThread,
    view: LadderView,
  ): Promise<ThreadLadderTag> {
    if (view.kind === 'rung') {
      const rung = this.rung(view.index);
      return {
        rung: view.index,
        subject: rung?.subject ?? null,
        view: 'rung',
        anchoredSha: rung?.sha ?? this.tipSha,
      };
    }

    const index = await this.rungForAllViewLine(thread);
    return {
      rung: index,
      subject: index === null ? null : (this.rung(index)?.subject ?? null),
      view: 'all',
      anchoredSha: this.tipSha,
    };
  }

  /** Blame maps a line of the net diff to its rung: added lines to the rung that added them, removed lines to the rung that removed them. */
  async rungForAllViewLine(thread: DiffCommentThread): Promise<number | null> {
    if (!thread.position || thread.filePath === null) return null;
    const line =
      typeof thread.position.line === 'number' ? thread.position.line : thread.position.line.start;
    const indexBySha = new Map(this.rungs.map((rung) => [rung.sha, rung.index]));

    if (thread.position.side === 'new') {
      const sha = await this.git.blameAddedLine(this.baseSha, this.tipSha, thread.filePath, line);
      return sha ? (indexBySha.get(sha) ?? null) : null;
    }

    const lastSeen = await this.git.blameRemovedLine(
      this.baseSha,
      this.tipSha,
      thread.filePath,
      line,
    );
    if (!lastSeen || lastSeen === this.tipSha) return null;
    if (lastSeen === this.baseSha) return this.rungs.length > 0 ? 1 : null;
    const index = indexBySha.get(lastSeen);
    return index !== undefined && index < this.rungs.length ? index + 1 : null;
  }

  /** Applies a browser's copy of one view. A stale copy merges and never deletes. */
  async updateView(
    view: LadderView,
    incoming: DiffCommentThread[],
    baseVersion: number | undefined,
  ): Promise<{ changed: boolean; merged: boolean }> {
    const before = JSON.stringify([this.threads, this.tags]);
    const isStale = typeof baseVersion === 'number' && baseVersion !== this.version;
    const visible = this.threads.filter((thread) => this.isVisible(thread, view));
    const nextThreads = isStale ? mergeCommentThreads(visible, incoming).threads : incoming;

    if (!isStale) {
      const keep = new Set(nextThreads.map((thread) => thread.id));
      const removed = new Set(visible.filter((thread) => !keep.has(thread.id)).map((t) => t.id));
      this.threads = this.threads.filter((thread) => !removed.has(thread.id));
      removed.forEach((id) => delete this.tags[id]);
    }

    for (const thread of nextThreads) {
      const existingIndex = this.threads.findIndex((candidate) => candidate.id === thread.id);
      if (existingIndex < 0) {
        this.tags[thread.id] = await this.tagForNewThread(thread, view);
        this.threads.push(thread);
        continue;
      }

      const existing = this.threads[existingIndex];
      if (!existing) continue;
      const home = this.isHome(this.tagOf(existing), view);
      // Positions from a foreign view are display-only; keep the stored anchor.
      this.threads[existingIndex] = {
        ...thread,
        position: home ? thread.position : existing.position,
      };
      if (home) this.tagOf(existing).anchoredSha = this.targetSha(view);
    }

    const changed = JSON.stringify([this.threads, this.tags]) !== before;
    if (changed) {
      this.version += 1;
      this.persist();
    }
    return { changed, merged: isStale };
  }

  /** Agent writes (`difit comment add`) address the whole ladder. */
  applyImports(imports: CommentImport[]): { changed: boolean; warnings: string[] } {
    const before = JSON.stringify(this.threads);
    const merged = mergeCommentImports(this.threads, imports);
    this.threads = merged.threads;
    this.threads.forEach((thread) => this.tagOf(thread));
    const changed = JSON.stringify(this.threads) !== before;
    if (changed) {
      this.version += 1;
      this.persist();
    }
    return { changed, warnings: merged.warnings };
  }

  setStatus(threadId: string, status: DiffCommentThreadStatus): boolean {
    const index = this.threads.findIndex((candidate) => candidate.id === threadId);
    const thread = this.threads[index];
    if (!thread) return false;
    this.threads[index] = withThreadStatus(thread, status);
    this.version += 1;
    this.persist();
    return true;
  }

  deleteThread(threadId: string): boolean {
    const next = this.threads.filter((thread) => thread.id !== threadId);
    if (next.length === this.threads.length) return false;
    this.threads = next;
    delete this.tags[threadId];
    this.version += 1;
    this.persist();
    return true;
  }

  /** Moves an unplaced thread onto a rung; its old position is kept and may show as outdated. */
  attach(threadId: string, index: number): boolean {
    const thread = this.threads.find((candidate) => candidate.id === threadId);
    const rung = this.rung(index);
    if (!thread || !rung) return false;
    this.tags[threadId] = {
      rung: index,
      subject: rung.subject,
      view: 'rung',
      anchoredSha: rung.sha,
    };
    this.version += 1;
    this.persist();
    return true;
  }

  allThreads(): DiffCommentThread[] {
    return this.threads;
  }

  unplacedThreads(): LadderThreadView[] {
    return this.cliThreads(true).filter((thread) => thread.unplaced);
  }

  cliThreads(includeResolved: boolean): LadderThreadView[] {
    return this.threads
      .filter((thread) => includeResolved || thread.status !== 'resolved')
      .map((thread) => {
        const tag = this.tagOf(thread);
        const rung = tag.rung === null ? undefined : this.rung(tag.rung);
        return {
          ...thread,
          rung:
            tag.rung === null
              ? null
              : {
                  index: tag.rung,
                  subject: tag.unplaced ? (tag.subject ?? '') : (rung?.subject ?? ''),
                  sha: tag.unplaced ? '' : (rung?.sha ?? ''),
                },
          unplaced: tag.unplaced === true,
          pending: this.events.isPending(thread),
        };
      });
  }

  private async patchIdOf(sha: string): Promise<string | null> {
    if (!this.patchIds.has(sha)) {
      this.patchIds.set(sha, await this.git.patchId(sha).catch(() => null));
    }
    return this.patchIds.get(sha) ?? null;
  }

  private async approvalOf(rung: LadderRung): Promise<RungApproval> {
    const record = this.approvals[String(rung.index)];
    if (!record || record.subject !== rung.subject) return 'unreviewed';
    return record.patchId === (await this.patchIdOf(rung.sha)) ? 'approved' : 'changed';
  }

  async setApproval(index: number, approved: boolean): Promise<boolean> {
    const rung = this.rung(index);
    if (!rung) return false;
    if (approved) {
      this.approvals[String(index)] = {
        patchId: await this.patchIdOf(rung.sha),
        subject: rung.subject,
        approvedAt: new Date().toISOString(),
      };
    } else {
      delete this.approvals[String(index)];
    }
    this.persist();
    return true;
  }

  async info(): Promise<LadderInfo> {
    const rungs: LadderRungStatus[] = await Promise.all(
      this.rungs.map(async (rung) => ({
        ...rung,
        approval: await this.approvalOf(rung),
        openThreads: this.threads.filter((thread) => {
          const tag = this.tagOf(thread);
          return tag.rung === rung.index && !tag.unplaced && thread.status !== 'resolved';
        }).length,
      })),
    );

    return {
      base: this.base,
      baseSha: this.baseSha,
      branch: this.branch,
      tipSha: this.tipSha,
      rungs,
      unplacedCount: this.threads.filter((thread) => this.tagOf(thread).unplaced).length,
      ...(this.lastRewrite ? { lastRewrite: this.lastRewrite } : {}),
    };
  }

  async finishSummary(): Promise<FinishSummary> {
    const info = await this.info();
    return {
      unapprovedRungs: info.rungs
        .filter((rung) => rung.approval !== 'approved')
        .map(({ index, subject, approval }) => ({ index, subject, approval })),
      openThreads: this.threads
        .filter((thread) => thread.status !== 'resolved')
        .map((thread) => ({
          id: thread.id,
          rung: this.tagOf(thread).rung,
          filePath: thread.filePath,
          body: thread.messages[0]?.body ?? '',
        })),
    };
  }

  /** Ends the session: the state file is set aside so the next session starts fresh. */
  finish(): string | null {
    this.persist();
    this.finished = true;
    if (!existsSync(this.statePath)) return null;
    let target = `${this.statePath}.finished`;
    if (existsSync(target)) target = `${target}.${Date.now()}`;
    renameSync(this.statePath, target);
    return target;
  }

  private persist(): void {
    if (this.finished) return;
    const state: LadderStateFile = {
      version: 1,
      base: this.base,
      baseSha: this.baseSha,
      branch: this.branch,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      rungs: this.rungs,
      threads: this.threads,
      tags: this.tags,
      approvals: this.approvals,
      submittedMessageIds: this.events.submittedIds(),
      ...(this.lastRewrite ? { lastRewrite: this.lastRewrite } : {}),
    };
    mkdirSync(dirname(this.statePath), { recursive: true });
    const tmpPath = `${this.statePath}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
    renameSync(tmpPath, this.statePath);
  }
}
