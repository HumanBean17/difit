import { describe, expect, it } from 'vitest';

import type { DiffCommentThread } from '../types/diff.js';

import { ReviewEvents } from './review-events.js';

const thread = (id: string, authors: string[], status?: 'resolved'): DiffCommentThread => ({
  id,
  filePath: 'f.ts',
  createdAt: '',
  updatedAt: '',
  messages: authors.map((author, i) => ({
    id: `${id}:${i}`,
    body: 'b',
    author,
    createdAt: '',
    updatedAt: '',
  })),
  ...(status ? { status } : {}),
});

describe('ReviewEvents', () => {
  it('counts user messages not yet submitted, skipping agent and resolved', () => {
    const events = new ReviewEvents();
    const threads = [thread('a', ['User', 'agent']), thread('b', ['User'], 'resolved')];
    expect(events.pending(threads)).toEqual({ threadIds: ['a'], messageIds: ['a:0'] });
  });

  it('submits once, then nothing is pending', () => {
    const events = new ReviewEvents();
    const threads = [thread('a', ['User'])];
    expect(events.submit(threads).count).toBe(1);
    expect(events.submit(threads).count).toBe(0);
  });

  it('coalesces queued submits for the next waiter', async () => {
    const events = new ReviewEvents();
    events.submit([thread('a', ['User'])]);
    events.submit([thread('b', ['User'])]);
    expect(await events.wait(10)).toMatchObject({
      event: 'submit',
      threadIds: ['a', 'b'],
      count: 2,
    });
    expect(await events.wait(10)).toEqual({ event: 'timeout' });
  });

  it('delivers straight to a waiting caller', async () => {
    const events = new ReviewEvents();
    const waiting = events.wait(1000);
    expect(events.hasWaiter()).toBe(true);
    events.submit([thread('a', ['User'])]);
    expect(await waiting).toMatchObject({ event: 'submit', threadIds: ['a'] });
  });
});
