import { describe, expect, it, vi } from 'vitest';

import type { CommentImport, DiffCommentThread } from '../types/diff';

import {
  mergeCommentImports,
  mergeCommentThreads,
  parseCommentImportValue,
  serializeCommentImports,
} from './commentImports';

function createThread({
  id,
  filePath = 'src/example.ts',
  side = 'new',
  line = 10,
  body,
  updatedAt = '2024-01-01T00:00:00.000Z',
}: {
  id: string;
  filePath?: string;
  side?: 'old' | 'new';
  line?: number;
  body: string;
  updatedAt?: string;
}): DiffCommentThread {
  return {
    id,
    filePath,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt,
    position: {
      side,
      line,
    },
    messages: [
      {
        id,
        body,
        author: 'User',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt,
      },
    ],
  };
}

function createGeneralThread({
  id,
  body,
  createdAt = '2024-01-01T00:00:00.000Z',
  updatedAt = '2024-01-01T00:00:00.000Z',
  messages,
}: {
  id: string;
  body: string;
  createdAt?: string;
  updatedAt?: string;
  messages?: DiffCommentThread['messages'];
}): DiffCommentThread {
  return {
    id,
    filePath: null,
    createdAt,
    updatedAt,
    messages: messages ?? [
      {
        id,
        body,
        author: 'User',
        createdAt,
        updatedAt,
      },
    ],
  };
}

describe('commentImports', () => {
  describe('parseCommentImportValue', () => {
    it('parses a single thread import', () => {
      const imports = parseCommentImportValue(
        JSON.stringify({
          type: 'thread',
          filePath: 'src/example.ts',
          position: { side: 'new', line: 10 },
          body: 'Review comment',
        }),
      );

      expect(imports).toEqual([
        {
          type: 'thread',
          filePath: 'src/example.ts',
          position: { side: 'new', line: 10 },
          body: 'Review comment',
          id: undefined,
          author: undefined,
          createdAt: undefined,
          updatedAt: undefined,
          codeSnapshot: undefined,
        },
      ]);
    });

    it('parses an array of imports', () => {
      const imports = parseCommentImportValue(
        JSON.stringify([
          {
            type: 'thread',
            filePath: 'src/example.ts',
            position: { side: 'new', line: 10 },
            body: 'Root',
          },
          {
            type: 'reply',
            filePath: 'src/example.ts',
            position: { side: 'new', line: 10 },
            body: 'Reply',
          },
        ]),
      );

      expect(imports).toHaveLength(2);
      expect(imports[0]?.type).toBe('thread');
      expect(imports[1]?.type).toBe('reply');
    });

    it('rejects malformed json', () => {
      expect(() => parseCommentImportValue('{')).toThrow('Invalid --comment JSON');
    });

    it('rejects invalid import shape', () => {
      expect(() =>
        parseCommentImportValue(
          JSON.stringify({
            type: 'thread',
            filePath: '',
            position: { side: 'new', line: 0 },
            body: '',
          }),
        ),
      ).toThrow('Invalid comment import field: filePath');
    });
  });

  describe('serializeCommentImports', () => {
    it('creates a stable payload string for hashing', () => {
      const commentImports: CommentImport[] = [
        {
          type: 'thread',
          id: 'thread-1',
          filePath: 'src/example.ts',
          position: { side: 'new', line: { start: 10, end: 12 } },
          body: 'Root',
          author: 'AI',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          codeSnapshot: { content: 'const value = 1;' },
        },
      ];

      expect(serializeCommentImports(commentImports)).toBe(
        JSON.stringify([
          {
            type: 'thread',
            id: 'thread-1',
            filePath: 'src/example.ts',
            position: { side: 'new', line: { start: 10, end: 12 } },
            body: 'Root',
            author: 'AI',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            codeSnapshot: { content: 'const value = 1;', language: undefined },
          },
        ]),
      );
    });
  });

  describe('mergeCommentImports', () => {
    it('adds a new thread import', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-02-01T00:00:00.000Z'));

      const result = mergeCommentImports(
        [],
        [
          {
            type: 'thread',
            filePath: 'src/example.ts',
            position: { side: 'new', line: 10 },
            body: 'Imported thread',
          },
        ],
      );

      expect(result.warnings).toEqual([]);
      expect(result.threads).toHaveLength(1);
      expect(result.threads[0]?.messages[0]?.body).toBe('Imported thread');

      vi.useRealTimers();
    });

    it('skips a duplicate thread import with the same root message', () => {
      const existing = [createThread({ id: 'thread-1', body: 'Imported thread' })];

      const result = mergeCommentImports(existing, [
        {
          type: 'thread',
          filePath: 'src/example.ts',
          position: { side: 'new', line: 10 },
          body: 'Imported thread',
          author: 'User',
        },
      ]);

      expect(result.threads).toHaveLength(1);
    });

    it('adds a reply to the newest matching thread', () => {
      const olderThread = createThread({
        id: 'thread-1',
        body: 'Root 1',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      const newerThread = createThread({
        id: 'thread-2',
        body: 'Root 2',
        updatedAt: '2024-01-02T00:00:00.000Z',
      });

      const result = mergeCommentImports(
        [olderThread, newerThread],
        [
          {
            type: 'reply',
            filePath: 'src/example.ts',
            position: { side: 'new', line: 10 },
            body: 'Imported reply',
            author: 'AI',
          },
        ],
      );

      expect(result.threads[0]?.messages).toHaveLength(1);
      expect(result.threads[1]?.messages).toHaveLength(2);
      expect(result.threads[1]?.messages[1]?.body).toBe('Imported reply');
    });

    it('skips a duplicate reply import', () => {
      const existing = createThread({ id: 'thread-1', body: 'Root' });
      existing.messages.push({
        id: 'reply-1',
        body: 'Imported reply',
        author: 'AI',
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      });

      const result = mergeCommentImports(
        [existing],
        [
          {
            type: 'reply',
            id: 'reply-1',
            filePath: 'src/example.ts',
            position: { side: 'new', line: 10 },
            body: 'Imported reply',
            author: 'AI',
          },
        ],
      );

      expect(result.threads[0]?.messages).toHaveLength(2);
    });

    it('warns and skips reply import when no matching thread exists', () => {
      const result = mergeCommentImports(
        [],
        [
          {
            type: 'reply',
            filePath: 'src/example.ts',
            position: { side: 'new', line: 10 },
            body: 'Imported reply',
          },
        ],
      );

      expect(result.threads).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Skipped reply import');
    });
  });

  describe('general threads', () => {
    it('merging general threads with different ids keeps both threads', () => {
      const stored = createGeneralThread({ id: 'general-1', body: 'ship it' });
      const incoming = createGeneralThread({ id: 'general-2', body: 'ship it' });

      const result = mergeCommentThreads([stored], [incoming]);

      expect(result.threads).toHaveLength(2);
      expect(result.threads.map((thread) => thread.id)).toEqual(['general-1', 'general-2']);
    });

    it('merging general threads with the same id merges their messages', () => {
      const stored = createGeneralThread({
        id: 'general-1',
        body: 'root',
        messages: [
          {
            id: 'general-1',
            body: 'root',
            author: 'User',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
      const incoming = createGeneralThread({
        id: 'general-1',
        body: 'root',
        updatedAt: '2024-01-02T00:00:00.000Z',
        messages: [
          {
            id: 'general-1',
            body: 'root',
            author: 'User',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'reply-1',
            body: 'a reply',
            author: 'User',
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
        ],
      });

      const result = mergeCommentThreads([stored], [incoming]);

      expect(result.threads).toHaveLength(1);
      expect(result.threads[0]?.id).toBe('general-1');
      expect(result.threads[0]?.messages.map((message) => message.id)).toEqual([
        'general-1',
        'reply-1',
      ]);
    });

    it('preserves filePath null and an absent position when cloning and merging general threads', () => {
      const result = mergeCommentThreads(
        [createGeneralThread({ id: 'general-1', body: 'ship it' })],
        [],
      );

      expect(result.threads).toHaveLength(1);
      expect(result.threads[0]?.filePath).toBeNull();
      expect(result.threads[0]?.position).toBeUndefined();

      // JSON round-trip (as persisted/synced) drops the undefined position.
      const roundTripped = JSON.parse(JSON.stringify(result.threads[0])) as DiffCommentThread;
      expect(roundTripped.filePath).toBeNull();
      expect(Object.keys(roundTripped).includes('position')).toBe(false);
    });

    it('never merges a general thread with a file-based thread', () => {
      const general = createGeneralThread({ id: 'general-1', body: 'same body' });
      const fileThread = createThread({ id: 'file-1', body: 'same body' });

      const generalFirst = mergeCommentThreads([general], [fileThread]);
      expect(generalFirst.threads).toHaveLength(2);
      expect(generalFirst.threads.map((thread) => thread.id).sort()).toEqual([
        'file-1',
        'general-1',
      ]);

      const fileFirst = mergeCommentThreads([fileThread], [general]);
      expect(fileFirst.threads).toHaveLength(2);
      expect(fileFirst.threads.map((thread) => thread.id).sort()).toEqual(['file-1', 'general-1']);
    });

    it('never merges a stored general thread with a file-based thread import', () => {
      const general = createGeneralThread({ id: 'general-1', body: 'ship it' });

      const result = mergeCommentImports(
        [general],
        [
          {
            type: 'thread',
            id: 'file-import-1',
            filePath: 'src/example.ts',
            position: { side: 'new', line: 10 },
            body: 'ship it',
            author: 'User',
          },
        ],
      );

      expect(result.threads).toHaveLength(2);
      expect(
        result.threads.some((thread) => thread.id === 'general-1' && thread.filePath === null),
      ).toBe(true);
      expect(
        result.threads.some(
          (thread) => thread.id === 'file-import-1' && thread.filePath === 'src/example.ts',
        ),
      ).toBe(true);
    });
  });
});
