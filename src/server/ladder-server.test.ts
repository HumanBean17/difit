import { existsSync, readdirSync, readFileSync } from 'fs';
import { type Server } from 'http';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

process.env.VITEST_SERVER_TEST = 'true';

import type { LadderThreadView, ReviewEvent, SessionInfo } from '../types/ladder.js';

import { createLadderTestRepo, type TestRepo } from './ladder-test-repo.js';
import { startServer } from './server.js';

const { fetch } = await import('undici');
globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

describe('difit --ladder server', () => {
  let repo: TestRepo;
  let server: Server | undefined;
  let base: string;

  const url = (path: string) => `${base}${path}`;
  const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url(path), init as never);
    return (await response.json()) as T;
  };
  const post = (path: string, body: unknown) =>
    json(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    repo = createLadderTestRepo();
    const result = await startServer({
      ladder: { base: 'main' },
      repoPath: repo.path,
      preferredPort: 5300 + Math.floor(Math.random() * 500),
      openBrowser: false,
      keepAlive: true,
      exitOnFinish: false,
    });
    server = result.server;
    base = `http://localhost:${result.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    repo.cleanup();
  });

  const rungQuery = async (index: number) => {
    const session = await json<SessionInfo>('/api/session');
    const rung = session.ladder!.rungs[index - 1]!;
    return `base=${rung.parentSha}&target=${rung.sha}`;
  };

  const userThread = (id: string) => {
    const now = new Date().toISOString();
    return {
      id,
      filePath: 'b.txt',
      createdAt: now,
      updatedAt: now,
      position: { side: 'new', line: 2 },
      codeSnapshot: { content: 'two' },
      messages: [{ id, body: 'Rename this', author: 'User', createdAt: now, updatedAt: now }],
    };
  };

  it('records its port and pid in the state file for reattaching', async () => {
    const gitDir = join(repo.path, '.git', 'difit');
    const [stateFile] = readdirSync(gitDir).filter((name) => name.endsWith('.json'));
    const state = JSON.parse(readFileSync(join(gitDir, stateFile!), 'utf8')) as {
      server?: { port: number; pid: number; url: string };
    };
    expect(state.server).toEqual({ port: Number(new URL(base).port), pid: process.pid, url: base });
  });

  it('reports ladder mode, rungs, and opens on rung 1', async () => {
    const session = await json<SessionInfo>('/api/session');
    expect(session.mode).toBe('ladder');
    expect(session.ladder?.rungs.map((rung) => rung.subject)).toEqual([
      'Change beta',
      'Add b file',
    ]);

    const diff = await json<{ files: Array<{ path: string }> }>('/api/diff');
    expect(diff.files.map((file) => file.path)).toEqual(['a.txt']);
  });

  it('serves a whole-ladder read to the CLI, threads tagged with their rung', async () => {
    await post(`/api/comments?${await rungQuery(2)}`, { threads: [userThread('t1')] });

    const cli = await json<{ mode: string; threads: LadderThreadView[] }>(
      '/api/comments-json?status=open',
    );
    expect(cli.mode).toBe('ladder');
    expect(cli.threads[0]).toMatchObject({
      id: 't1',
      rung: { index: 2, subject: 'Add b file' },
      unplaced: false,
      pending: true,
    });
  });

  it('wakes comment wait on submit, with the submitted threads', async () => {
    const waiting = json<ReviewEvent>('/api/review/wait?timeout=5000');
    const submitted = await post(`/api/review/submit?${await rungQuery(2)}`, {
      threads: [userThread('t1')],
    });

    expect(submitted).toMatchObject({ count: 1, threadIds: ['t1'] });
    expect(await waiting).toMatchObject({ event: 'submit', threadIds: ['t1'], count: 1 });
    expect((await json<SessionInfo>('/api/session')).pendingCount).toBe(0);
  });

  it('queues a submit made while nobody waits', async () => {
    await post(`/api/review/submit?${await rungQuery(2)}`, { threads: [userThread('t1')] });
    expect(await json<ReviewEvent>('/api/review/wait?timeout=1000')).toMatchObject({
      event: 'submit',
    });
    expect(await json<ReviewEvent>('/api/review/wait?timeout=50')).toEqual({ event: 'timeout' });
  });

  it('answers an agent reply addressed by threadId', async () => {
    await post(`/api/comments?${await rungQuery(2)}`, { threads: [userThread('t1')] });
    await post('/api/comment-imports', {
      type: 'reply',
      threadId: 't1',
      body: 'Renamed.',
      author: 'agent',
    });

    const cli = await json<{ threads: LadderThreadView[] }>('/api/comments-json');
    expect(cli.threads[0]?.messages.map((message) => message.body)).toEqual([
      'Rename this',
      'Renamed.',
    ]);
    expect(cli.threads[0]?.pending).toBe(true);
  });

  it('keeps resolved threads, hidden from status=open reads', async () => {
    await post(`/api/comments?${await rungQuery(2)}`, { threads: [userThread('t1')] });
    await post('/api/comments/t1/resolve', {});

    const open = await json<{ threads: LadderThreadView[] }>('/api/comments-json?status=open');
    const all = await json<{ threads: LadderThreadView[] }>('/api/comments-json?status=all');
    expect(open.threads).toEqual([]);
    expect(all.threads[0]).toMatchObject({ id: 't1', status: 'resolved' });
  });

  it('approves a rung and reports it in the session', async () => {
    await post('/api/ladder/approve', { index: 1, approved: true });
    const session = await json<SessionInfo>('/api/session');
    expect(session.ladder?.rungs.map((rung) => rung.approval)).toEqual(['approved', 'unreviewed']);
  });

  it('follows the branch ref: a new commit re-lists rungs and broadcasts reload', async () => {
    const controller = new AbortController();
    const response = await fetch(url('/api/watch'), { signal: controller.signal });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const sawReload = (async () => {
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return false;
        buffer += decoder.decode(value);
        if (buffer.includes('"type":"reload"')) return true;
      }
    })();

    // Let the watcher subscription settle before writing.
    await new Promise((resolve) => setTimeout(resolve, 300));
    repo.write('c.txt', 'new\n');
    repo.commit('Add c file');

    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000));
    expect(await Promise.race([sawReload, timeout])).toBe(true);
    controller.abort();

    const session = await json<SessionInfo>('/api/session');
    expect(session.ladder?.rungs.map((rung) => rung.subject)).toEqual([
      'Change beta',
      'Add b file',
      'Add c file',
    ]);
  });

  it('finishes: summary to the waiter, state file set aside', async () => {
    await post(`/api/comments?${await rungQuery(2)}`, { threads: [userThread('t1')] });
    const waiting = json<ReviewEvent>('/api/review/wait?timeout=5000');
    const finished = await post('/api/review/finish', {});

    const event = await waiting;
    expect(event).toMatchObject({ event: 'finish' });
    if (event.event !== 'finish') throw new Error('expected finish');
    expect(event.unapprovedRungs.map((rung) => rung.index)).toEqual([1, 2]);
    expect(event.openThreads.map((thread) => thread.id)).toEqual(['t1']);
    const { stateFile } = finished as { stateFile: string };
    expect(stateFile.endsWith('.json.finished')).toBe(true);
    expect(existsSync(stateFile)).toBe(true);
    expect((await json<SessionInfo>('/api/session')).finished).toBe(true);
  });
});
