import type { DiffCommentPosition, DiffCommentThread, DiffFile } from '../types/diff.js';

export interface DiffLineIndex {
  old: Map<number, string>;
  new: Map<number, string>;
}

function trimTrailingWhitespace(line: string): string {
  return line.replace(/[ \t]+$/, '');
}

function splitSnapshot(content: string): string[] {
  return content.replace(/\r\n/g, '\n').split('\n').map(trimTrailingWhitespace);
}

export function buildDiffLineIndex(file: DiffFile): DiffLineIndex {
  const oldIndex = new Map<number, string>();
  const newIndex = new Map<number, string>();

  for (const chunk of file.chunks) {
    for (const line of chunk.lines) {
      if (line.oldLineNumber !== undefined) {
        oldIndex.set(line.oldLineNumber, line.content);
      }
      if (line.newLineNumber !== undefined) {
        newIndex.set(line.newLineNumber, line.content);
      }
    }
  }

  return { old: oldIndex, new: newIndex };
}

function lineRange(position: DiffCommentPosition): { start: number; end: number } {
  return typeof position.line === 'number'
    ? { start: position.line, end: position.line }
    : position.line;
}

function matchesAt(sideIndex: Map<number, string>, start: number, snapshot: string[]): boolean {
  for (let i = 0; i < snapshot.length; i++) {
    const current = sideIndex.get(start + i);
    if (current === undefined || trimTrailingWhitespace(current) !== snapshot[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Moves a thread's position to where its code snapshot sits in another diff of
 * the same file (a rewritten commit, or a different view of the ladder). The
 * match nearest the old line wins. Returns null when the snapshot is absent,
 * empty, or not found — the caller keeps the old position, which then shows as
 * outdated.
 */
export function reanchorPosition(
  thread: DiffCommentThread,
  index: DiffLineIndex | undefined,
): DiffCommentPosition | null {
  const snapshotContent = thread.codeSnapshot?.content;
  if (!thread.position || !index || !snapshotContent || snapshotContent.trim() === '') {
    return null;
  }

  const snapshot = splitSnapshot(snapshotContent);
  const range = lineRange(thread.position);
  const span = range.end - range.start;
  // A multi-line comment whose snapshot does not cover its range cannot be moved safely.
  if (snapshot.length !== span + 1) {
    return null;
  }

  const sideIndex = thread.position.side === 'old' ? index.old : index.new;
  if (matchesAt(sideIndex, range.start, snapshot)) {
    return thread.position;
  }

  let best: number | null = null;
  for (const candidate of sideIndex.keys()) {
    if (!matchesAt(sideIndex, candidate, snapshot)) continue;
    if (best === null || Math.abs(candidate - range.start) < Math.abs(best - range.start)) {
      best = candidate;
    }
  }

  if (best === null) {
    return null;
  }

  return {
    side: thread.position.side,
    line: span === 0 ? best : { start: best, end: best + span },
  };
}
