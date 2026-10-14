import type { DiffCommentThread } from '../types/diff.js';
import type { ReviewEvent } from '../types/ladder.js';

type Waiter = (event: ReviewEvent) => void;

const AGENT_AUTHOR = 'agent';

function isAgentMessage(author: string | undefined): boolean {
  return author?.trim().toLowerCase() === AGENT_AUTHOR;
}

/**
 * Tracks which user messages were submitted to the agent and hands submit /
 * finish events to `difit comment wait` callers. Events queue until a waiter
 * takes them, so a submit made while the agent is busy is not lost.
 */
export class ReviewEvents {
  private readonly submitted: Set<string>;
  private readonly queue: ReviewEvent[] = [];
  private readonly waiters: Waiter[] = [];

  constructor(
    submittedIds: Iterable<string> = [],
    private readonly onSubmittedChange?: (ids: string[]) => void,
  ) {
    this.submitted = new Set(submittedIds);
  }

  /** Open threads holding user messages not yet submitted, with those message ids. */
  pending(threads: DiffCommentThread[]): { threadIds: string[]; messageIds: string[] } {
    const threadIds: string[] = [];
    const messageIds: string[] = [];
    for (const thread of threads) {
      if (thread.status === 'resolved') continue;
      const ids = thread.messages
        .filter((message) => !isAgentMessage(message.author) && !this.submitted.has(message.id))
        .map((message) => message.id);
      if (ids.length > 0) {
        threadIds.push(thread.id);
        messageIds.push(...ids);
      }
    }
    return { threadIds, messageIds };
  }

  submittedIds(): string[] {
    return [...this.submitted];
  }

  isPending(thread: DiffCommentThread): boolean {
    return this.pending([thread]).messageIds.length > 0;
  }

  /** Marks every pending message submitted; queues a submit event when there was any. */
  submit(threads: DiffCommentThread[]): { threadIds: string[]; count: number } {
    const { threadIds, messageIds } = this.pending(threads);
    if (messageIds.length === 0) {
      return { threadIds: [], count: 0 };
    }

    messageIds.forEach((id) => this.submitted.add(id));
    this.onSubmittedChange?.([...this.submitted]);
    this.emit({
      event: 'submit',
      threadIds,
      count: messageIds.length,
      at: new Date().toISOString(),
    });
    return { threadIds, count: messageIds.length };
  }

  emit(event: ReviewEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(event);
      return;
    }
    this.queue.push(event);
  }

  hasWaiter(): boolean {
    return this.waiters.length > 0;
  }

  /** Resolves with the next event (queued submits coalesce), or a timeout event. */
  wait(timeoutMs: number, signal?: AbortSignal): Promise<ReviewEvent> {
    const queued = this.takeQueued();
    if (queued) {
      return Promise.resolve(queued);
    }

    return new Promise((resolvePromise) => {
      const waiter: Waiter = (event) => {
        clearTimeout(timer);
        resolvePromise(event);
      };
      const drop = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
      };
      const timer = setTimeout(() => {
        drop();
        resolvePromise({ event: 'timeout' });
      }, timeoutMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        drop();
        resolvePromise({ event: 'timeout' });
      });
      this.waiters.push(waiter);
    });
  }

  private takeQueued(): ReviewEvent | null {
    const first = this.queue.shift();
    if (!first || first.event !== 'submit') {
      return first ?? null;
    }

    const merged = { ...first, threadIds: [...first.threadIds] };
    while (this.queue[0]?.event === 'submit') {
      const next = this.queue.shift();
      if (next?.event !== 'submit') break;
      merged.threadIds = [...new Set([...merged.threadIds, ...next.threadIds])];
      merged.count += next.count;
      merged.at = next.at;
    }
    return merged;
  }
}
