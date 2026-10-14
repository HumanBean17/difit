import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook';

import type { LadderInfo, LadderThreadView } from '../../types/ladder';

function Dialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { enableScope, disableScope } = useHotkeysContext();
  useHotkeys('escape', () => onClose(), {}, [onClose]);

  // Keys typed in the dialog must not drive diff navigation.
  useEffect(() => {
    disableScope('navigation');
    return () => enableScope('navigation');
  }, [disableScope, enableScope]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-github-border bg-github-bg-primary shadow-lg">
        <div className="flex items-center justify-between border-b border-github-border px-5 py-3">
          <h2 className="text-base font-semibold text-github-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-github-text-secondary hover:text-github-text-primary"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm text-github-text-primary">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-github-border px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

const buttonClass =
  'rounded border border-github-border bg-github-bg-tertiary px-3 py-1.5 text-xs text-github-text-primary hover:bg-github-bg-secondary disabled:opacity-50';

function threadLocation(thread: LadderThreadView): string {
  if (thread.filePath === null || !thread.position) return 'General';
  const line =
    typeof thread.position.line === 'number'
      ? thread.position.line
      : `${thread.position.line.start}-${thread.position.line.end}`;
  return `${thread.filePath}:${line}`;
}

interface UnplacedThreadsDialogProps {
  currentRung: { index: number; subject: string } | null;
  onAttach: (threadId: string, index: number) => Promise<void>;
  onDelete: (threadId: string) => Promise<void>;
  onClose: () => void;
}

export function UnplacedThreadsDialog({
  currentRung,
  onAttach,
  onDelete,
  onClose,
}: UnplacedThreadsDialogProps) {
  const [threads, setThreads] = useState<LadderThreadView[] | null>(null);

  const load = async () => {
    const response = await fetch('/api/ladder/unplaced');
    const payload = (await response.json()) as { threads?: LadderThreadView[] };
    setThreads(payload.threads ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <Dialog title="Unplaced threads" onClose={onClose}>
      <p className="mb-3 text-xs text-github-text-secondary">
        Their rung changed subject or position when the ladder was rewritten, so difit will not
        guess where they belong.
      </p>
      {threads === null ? (
        <div className="text-github-text-secondary">Loading…</div>
      ) : threads.length === 0 ? (
        <div className="text-github-text-secondary">No unplaced threads.</div>
      ) : (
        <ul className="space-y-3">
          {threads.map((thread) => (
            <li key={thread.id} className="rounded border border-github-border p-3">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-github-text-secondary">
                <span className="font-mono">{threadLocation(thread)}</span>
                {thread.rung && (
                  <span>
                    was rung {thread.rung.index}: {thread.rung.subject}
                  </span>
                )}
              </div>
              <div className="mb-2 whitespace-pre-wrap">{thread.messages[0]?.body}</div>
              <div className="flex gap-2">
                {currentRung && (
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => void onAttach(thread.id, currentRung.index).then(load)}
                  >
                    Attach to rung {currentRung.index}
                  </button>
                )}
                <button
                  type="button"
                  className={`${buttonClass} text-github-danger`}
                  onClick={() => void onDelete(thread.id).then(load)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

interface FinishReviewDialogProps {
  ladder: LadderInfo;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function FinishReviewDialog({ ladder, onConfirm, onClose }: FinishReviewDialogProps) {
  const [isFinishing, setIsFinishing] = useState(false);
  const unapproved = ladder.rungs.filter((rung) => rung.approval !== 'approved');
  const openThreads = ladder.rungs.reduce((sum, rung) => sum + rung.openThreads, 0);
  const isClean = unapproved.length === 0 && openThreads === 0 && ladder.unplacedCount === 0;

  return (
    <Dialog
      title="Finish review"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={buttonClass} onClick={onClose}>
            Keep reviewing
          </button>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-github-accent)' }}
            disabled={isFinishing}
            onClick={() => {
              setIsFinishing(true);
              void onConfirm().finally(() => setIsFinishing(false));
            }}
          >
            {isClean ? 'Finish' : 'Finish anyway'}
          </button>
        </>
      }
    >
      {isClean ? (
        <p>Every rung is approved and no thread is open.</p>
      ) : (
        <div className="space-y-3">
          {unapproved.length > 0 && (
            <div>
              <div className="mb-1 font-medium">Not approved</div>
              <ul className="list-disc space-y-0.5 pl-5 text-github-text-secondary">
                {unapproved.map((rung) => (
                  <li key={rung.sha}>
                    {rung.index}. {rung.subject}
                    {rung.approval === 'changed' ? ' (changed since approved)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {openThreads > 0 && (
            <div>
              <div className="mb-1 font-medium">Open threads</div>
              <ul className="list-disc space-y-0.5 pl-5 text-github-text-secondary">
                {ladder.rungs
                  .filter((rung) => rung.openThreads > 0)
                  .map((rung) => (
                    <li key={rung.sha}>
                      rung {rung.index}: {rung.openThreads}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {ladder.unplacedCount > 0 && (
            <div className="text-github-warning">{ladder.unplacedCount} unplaced thread(s)</div>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-github-text-secondary">
        Finishing stops this difit session and hands the summary to the agent.
      </p>
    </Dialog>
  );
}
