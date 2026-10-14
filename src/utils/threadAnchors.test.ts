import { describe, expect, it } from 'vitest';

import type { DiffCommentThread, DiffFile } from '../types/diff.js';

import { buildDiffLineIndex, reanchorPosition } from './threadAnchors.js';

const file = (lines: string[]): DiffFile => ({
  path: 'f.ts',
  status: 'modified',
  additions: lines.length,
  deletions: 0,
  chunks: [
    {
      header: '@@',
      oldStart: 1,
      oldLines: 0,
      newStart: 1,
      newLines: lines.length,
      lines: lines.map((content, i) => ({ type: 'add', content, newLineNumber: i + 1 })),
    },
  ],
});

const thread = (line: number | { start: number; end: number }, content?: string) =>
  ({
    id: 't',
    filePath: 'f.ts',
    createdAt: '',
    updatedAt: '',
    position: { side: 'new', line },
    codeSnapshot: content === undefined ? undefined : { content },
    messages: [],
  }) as DiffCommentThread;

describe('reanchorPosition', () => {
  const index = buildDiffLineIndex(file(['a', 'x', 'b', 'x', 'c', 'd']));

  it('keeps a position whose snapshot still matches', () => {
    expect(reanchorPosition(thread(5, 'c'), index)).toEqual({ side: 'new', line: 5 });
  });

  it('moves to the nearest match', () => {
    expect(reanchorPosition(thread(5, 'x'), index)).toEqual({ side: 'new', line: 4 });
    expect(reanchorPosition(thread(1, 'c'), index)).toEqual({ side: 'new', line: 5 });
  });

  it('moves ranges as a block', () => {
    expect(reanchorPosition(thread({ start: 1, end: 2 }, 'c\nd'), index)).toEqual({
      side: 'new',
      line: { start: 5, end: 6 },
    });
  });

  it('gives up without a usable snapshot or match', () => {
    expect(reanchorPosition(thread(2), index)).toBeNull();
    expect(reanchorPosition(thread(2, '  '), index)).toBeNull();
    expect(reanchorPosition(thread(2, 'gone'), index)).toBeNull();
  });
});
