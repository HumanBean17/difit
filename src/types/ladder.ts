import type { DiffCommentThread } from './diff.js';

// One commit of a review ladder: base..branch, oldest first. Index is 1-based.
export interface LadderRung {
  index: number;
  sha: string;
  shortSha: string;
  parentSha: string;
  subject: string;
  body: string;
}

export type RungApproval = 'unreviewed' | 'approved' | 'changed';

export interface LadderRungStatus extends LadderRung {
  approval: RungApproval;
  openThreads: number;
}

export interface LadderInfo {
  base: string;
  baseSha: string;
  branch: string;
  tipSha: string;
  rungs: LadderRungStatus[];
  unplacedCount: number;
  // Rungs whose sha changed in the most recent ladder rewrite, keyed by index.
  lastRewrite?: { at: string; changed: Array<{ index: number; from: string; to: string }> };
}

export type LadderView = { kind: 'rung'; index: number } | { kind: 'all' };

// Which rung a thread belongs to, kept server-side beside the thread.
export interface ThreadLadderTag {
  rung: number | null;
  subject: string | null;
  // The view whose line numbers the stored position uses.
  view: 'rung' | 'all';
  // Target sha of that view when the position was last anchored.
  anchoredSha: string;
  unplaced?: boolean;
}

export interface SessionInfo {
  mode: string;
  ladder?: LadderInfo;
  pendingCount: number;
  finished: boolean;
}

export interface FinishSummary {
  unapprovedRungs: Array<{ index: number; subject: string; approval: RungApproval }>;
  openThreads: Array<{
    id: string;
    rung: number | null;
    filePath: string | null;
    body: string;
  }>;
}

export type ReviewEvent =
  | { event: 'submit'; threadIds: string[]; count: number; at: string }
  | ({ event: 'finish'; at: string } & FinishSummary)
  | { event: 'timeout' };

export interface LadderThreadView extends DiffCommentThread {
  rung: { index: number; subject: string; sha: string } | null;
  unplaced: boolean;
  pending: boolean;
}
