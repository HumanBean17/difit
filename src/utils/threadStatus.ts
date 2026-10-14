import type { DiffCommentThread, DiffCommentThreadStatus } from '../types/diff.js';

/** A copy of `thread` resolved or reopened; open threads carry no status fields. */
export function withThreadStatus(
  thread: DiffCommentThread,
  status: DiffCommentThreadStatus,
  now = new Date().toISOString(),
): DiffCommentThread {
  const next: DiffCommentThread = { ...thread, updatedAt: now };
  if (status === 'resolved') {
    next.status = 'resolved';
    next.resolvedAt = now;
  } else {
    delete next.status;
    delete next.resolvedAt;
  }
  return next;
}
