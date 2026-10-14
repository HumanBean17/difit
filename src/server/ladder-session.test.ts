import { existsSync, readFileSync } from 'fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DiffCommentThread } from '../types/diff.js';

import { GitDiffParser } from './git-diff.js';
import { LadderSession } from './ladder-session.js';
import { createLadderTestRepo, type TestRepo } from './ladder-test-repo.js';

function thread(
  id: string,
  filePath: string,
  line: number,
  content: string,
  side: 'old' | 'new' = 'new',
): DiffCommentThread {
  const now = new Date().toISOString();
  return {
    id,
    filePath,
    createdAt: now,
    updatedAt: now,
    position: { side, line },
    codeSnapshot: { content },
    messages: [{ id, body: `comment ${id}`, author: 'User', createdAt: now, updatedAt: now }],
  };
}

describe('LadderSession', () => {
  let repo: TestRepo;

  const open = () => {
    const parser = new GitDiffParser(repo.path);
    return LadderSession.open({
      repoPath: repo.path,
      base: 'main',
      loadDiff: (selection) => parser.parseDiff(selection),
    });
  };

  // Fold a change into rung `subject` the way difit-receiving-review does.
  const fixup = (subject: string, file: string, content: string) => {
    repo.write(file, content);
    repo.commit(`fixup! ${subject}`);
    repo.git('rebase', '-q', '-i', '--autosquash', 'main');
  };

  beforeEach(() => {
    repo = createLadderTestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  it('lists base..branch as rungs, oldest first', async () => {
    const session = await open();
    const info = await session.info();

    expect(info.branch).toBe('feat');
    expect(info.baseSha).toBe(repo.git('rev-parse', 'main'));
    expect(info.rungs.map((rung) => rung.subject)).toEqual(['Change beta', 'Add b file']);
    expect(info.rungs[0]?.parentSha).toBe(info.baseSha);
    expect(info.rungs.every((rung) => rung.approval === 'unreviewed')).toBe(true);
  });

  it('resolves rung and All views from short or full shas', async () => {
    const session = await open();
    const rung2 = session.rung(2)!;
    const info = await session.info();

    expect(session.resolveView(rung2.parentSha.slice(0, 7), rung2.shortSha)).toEqual({
      kind: 'rung',
      index: 2,
    });
    expect(session.resolveView(info.baseSha, info.tipSha)).toEqual({ kind: 'all' });
    expect(session.resolveView('deadbeef', 'cafebabe')).toBeNull();
  });

  it('persists threads to .git/difit and restores them on reopen', async () => {
    const session = await open();
    await session.updateView({ kind: 'rung', index: 2 }, [thread('t1', 'b.txt', 2, 'two')], 0);

    expect(existsSync(session.statePath)).toBe(true);
    expect(session.statePath).toContain('/.git/difit/feat@');

    const reopened = await open();
    const threads = await reopened.threadsFor({ kind: 'rung', index: 2 });
    expect(threads.map((t) => t.id)).toEqual(['t1']);
    expect(await reopened.threadsFor({ kind: 'rung', index: 1 })).toEqual([]);
  });

  it('keeps threads on their rung across a fixup + autosquash rewrite', async () => {
    const session = await open();
    const before = session.rung(2)!.sha;
    await session.updateView({ kind: 'rung', index: 2 }, [thread('t1', 'b.txt', 2, 'two')], 0);

    fixup('Change beta', 'a.txt', 'alpha\nbeta changed again\ngamma\n');
    expect(await session.refresh()).toBe(true);

    const info = await session.info();
    expect(session.rung(2)!.sha).not.toBe(before);
    expect(info.lastRewrite?.changed.map((entry) => entry.index)).toEqual([1, 2]);
    expect((await session.threadsFor({ kind: 'rung', index: 2 })).map((t) => t.id)).toEqual(['t1']);
    expect(info.unplacedCount).toBe(0);
  });

  it('moves a thread whose rung changed subject to the unplaced list', async () => {
    const session = await open();
    await session.updateView({ kind: 'rung', index: 2 }, [thread('t1', 'b.txt', 2, 'two')], 0);

    repo.git('commit', '-q', '--amend', '-m', 'Add the b file');
    await session.refresh();

    expect(await session.threadsFor({ kind: 'rung', index: 2 })).toEqual([]);
    expect(session.unplacedThreads().map((t) => t.id)).toEqual(['t1']);
    expect(session.attach('t1', 2)).toBe(true);
    expect((await session.threadsFor({ kind: 'rung', index: 2 })).map((t) => t.id)).toEqual(['t1']);
  });

  it('re-anchors a thread when its rung is rewritten and lines shift', async () => {
    const session = await open();
    await session.updateView({ kind: 'rung', index: 2 }, [thread('t1', 'b.txt', 3, 'three')], 0);

    fixup('Add b file', 'b.txt', 'zero\none\ntwo\nthree\n');
    await session.refresh();

    const [moved] = await session.threadsFor({ kind: 'rung', index: 2 });
    expect(moved?.position).toEqual({ side: 'new', line: 4 });
  });

  it('resets approval when the rung diff changes, keeps it when only the sha moves', async () => {
    const session = await open();
    await session.setApproval(1, true);
    await session.setApproval(2, true);

    fixup('Change beta', 'a.txt', 'alpha\nbeta changed again\ngamma\n');
    await session.refresh();

    const info = await session.info();
    expect(info.rungs.map((rung) => rung.approval)).toEqual(['changed', 'approved']);
  });

  it('maps All-view comments to the rung that added or removed the line', async () => {
    const session = await open();
    const all = { kind: 'all' } as const;
    await session.updateView(
      all,
      [thread('added', 'b.txt', 2, 'two'), thread('removed', 'a.txt', 2, 'beta', 'old')],
      0,
    );

    const tagged = session.cliThreads(true);
    expect(tagged.find((t) => t.id === 'added')?.rung?.index).toBe(2);
    expect(tagged.find((t) => t.id === 'removed')?.rung?.index).toBe(1);
    expect((await session.threadsFor({ kind: 'rung', index: 2 })).map((t) => t.id)).toContain(
      'added',
    );
  });

  it('treats a stale browser copy as a merge that never deletes', async () => {
    const session = await open();
    const view = { kind: 'rung', index: 2 } as const;
    await session.updateView(view, [thread('t1', 'b.txt', 2, 'two')], 0);
    const staleVersion = 0;

    const result = await session.updateView(view, [], staleVersion);
    expect(result.merged).toBe(true);
    expect((await session.threadsFor(view)).map((t) => t.id)).toEqual(['t1']);

    await session.updateView(view, [], session.version);
    expect(await session.threadsFor(view)).toEqual([]);
  });

  it('tracks submitted messages across reopen', async () => {
    const session = await open();
    await session.updateView(
      { kind: 'rung', index: 1 },
      [thread('t1', 'a.txt', 2, 'beta changed')],
      0,
    );

    expect(session.events.pending(session.allThreads()).messageIds).toEqual(['t1']);
    expect(session.events.submit(session.allThreads()).count).toBe(1);

    const reopened = await open();
    expect(reopened.events.pending(reopened.allThreads()).messageIds).toEqual([]);
  });

  it('sets the state file aside on finish', async () => {
    const session = await open();
    const finishedPath = session.finish();

    expect(finishedPath).toBe(`${session.statePath}.finished`);
    expect(existsSync(session.statePath)).toBe(false);
    expect(JSON.parse(readFileSync(finishedPath!, 'utf8')).branch).toBe('feat');
  });
});
