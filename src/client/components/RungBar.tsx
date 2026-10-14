import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Layers,
  List,
  MessageSquare,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { LadderInfo, LadderRungStatus, LadderView, RungApproval } from '../../types/ladder';
import { useClickOutside } from '../hooks/useClickOutside';
import { parseRungMessage } from '../utils/rungMessage';

interface RungBarProps {
  ladder: LadderInfo;
  view: LadderView;
  onSelectView: (view: LadderView) => void;
  onToggleApproval: (index: number) => void;
  banner: string | null;
  onDismissBanner: () => void;
  onOpenUnplaced: () => void;
}

const VERIFY_STORAGE_PREFIX = 'difit.ladder.verify:';

function ApprovalIcon({ approval, size = 14 }: { approval: RungApproval; size?: number }) {
  if (approval === 'approved') {
    return <CheckCircle2 size={size} className="text-green-600 shrink-0" aria-label="Approved" />;
  }
  if (approval === 'changed') {
    return (
      <AlertTriangle
        size={size}
        className="text-github-warning shrink-0"
        aria-label="Changed since approved"
      />
    );
  }
  return (
    <Circle size={size} className="text-github-text-muted shrink-0" aria-label="Not reviewed" />
  );
}

const APPROVAL_LABEL: Record<RungApproval, string> = {
  approved: 'Approved',
  changed: 'Changed since approved',
  unreviewed: 'Not reviewed',
};

// Checked Verify claims, per rung sha: a rewritten rung starts unchecked again.
function readChecked(sha: string): number[] {
  try {
    const raw = window.localStorage.getItem(`${VERIFY_STORAGE_PREFIX}${sha}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'number') : [];
  } catch {
    return [];
  }
}

function writeChecked(sha: string, checked: number[]) {
  try {
    window.localStorage.setItem(`${VERIFY_STORAGE_PREFIX}${sha}`, JSON.stringify(checked));
  } catch {
    // Ignore storage errors; the checklist is a per-viewer convenience.
  }
}

function VerifyChecklist({ rung }: { rung: LadderRungStatus }) {
  const message = useMemo(() => parseRungMessage(rung.body), [rung.body]);
  const [checked, setChecked] = useState<number[]>(() => readChecked(rung.sha));

  useEffect(() => {
    setChecked(readChecked(rung.sha));
  }, [rung.sha]);

  const toggle = (index: number) => {
    const next = checked.includes(index)
      ? checked.filter((value) => value !== index)
      : [...checked, index];
    setChecked(next);
    writeChecked(rung.sha, next);
  };

  if (message.verify.length === 0 && !message.proof && !message.oversize) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1 text-xs">
      {message.verify.length > 0 && (
        <ul className="space-y-1" aria-label="Verify checklist">
          {message.verify.map((claim, index) => (
            <li key={`${index}:${claim}`}>
              <label className="flex cursor-pointer items-start gap-2 text-github-text-primary">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked.includes(index)}
                  onChange={() => toggle(index)}
                />
                <span className={checked.includes(index) ? 'line-through opacity-60' : ''}>
                  {claim}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {message.proof && (
        <div className="text-github-text-secondary">
          <span className="font-medium">Proof:</span> {message.proof}
        </div>
      )}
      {message.oversize && (
        <div className="text-github-warning">
          <span className="font-medium">Oversize:</span> {message.oversize}
        </div>
      )}
    </div>
  );
}

export function RungBar({
  ladder,
  view,
  onSelectView,
  onToggleApproval,
  banner,
  onDismissBanner,
  onOpenUnplaced,
}: RungBarProps) {
  const [isListOpen, setIsListOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useClickOutside(listRef, () => setIsListOpen(false), isListOpen);

  const total = ladder.rungs.length;
  const rung = view.kind === 'rung' ? ladder.rungs[view.index - 1] : undefined;
  const canPrev = view.kind === 'rung' && view.index > 1;
  const canNext = view.kind === 'rung' && view.index < total;

  const select = (next: LadderView) => {
    setIsListOpen(false);
    onSelectView(next);
  };

  return (
    <div
      className="bg-github-bg-secondary border-b border-github-border px-4 py-2"
      data-testid="rung-bar"
    >
      {banner && (
        <div
          role="status"
          className="mb-2 flex items-center justify-between gap-3 rounded border border-github-accent/40 bg-github-bg-tertiary px-3 py-1.5 text-xs text-github-text-primary"
        >
          <span>{banner}</span>
          <button
            type="button"
            onClick={onDismissBanner}
            className="text-github-text-secondary hover:text-github-text-primary"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => view.kind === 'rung' && select({ kind: 'rung', index: view.index - 1 })}
          disabled={!canPrev}
          className="rounded p-1 text-github-text-secondary hover:bg-github-bg-tertiary hover:text-github-text-primary disabled:opacity-40"
          title="Previous rung (<)"
          aria-label="Previous rung"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          {rung ? (
            <>
              <span className="shrink-0 font-mono text-xs text-github-text-secondary">
                {rung.index}/{total}
              </span>
              <span className="text-github-text-muted">·</span>
              <span
                className="min-w-0 truncate font-medium text-github-text-primary"
                title={rung.subject}
              >
                {rung.subject}
              </span>
              <code className="shrink-0 text-xs text-github-text-muted">{rung.shortSha}</code>
            </>
          ) : (
            <>
              <Layers size={14} className="shrink-0 text-github-text-secondary" />
              <span className="font-medium text-github-text-primary">All rungs</span>
              <code className="shrink-0 text-xs text-github-text-muted">
                {ladder.baseSha.slice(0, 7)}..{ladder.tipSha.slice(0, 7)}
              </code>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => view.kind === 'rung' && select({ kind: 'rung', index: view.index + 1 })}
          disabled={!canNext}
          className="rounded p-1 text-github-text-secondary hover:bg-github-bg-tertiary hover:text-github-text-primary disabled:opacity-40"
          title="Next rung (>)"
          aria-label="Next rung"
        >
          <ChevronRight size={16} />
        </button>
        {rung && (
          <button
            type="button"
            onClick={() => onToggleApproval(rung.index)}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
              rung.approval === 'approved'
                ? 'border-green-700/50 text-green-700'
                : rung.approval === 'changed'
                  ? 'border-github-warning text-github-warning'
                  : 'border-github-border text-github-text-secondary hover:text-github-text-primary'
            }`}
            title={
              rung.approval === 'approved'
                ? 'Approved — click or press a to withdraw'
                : 'Approve this rung (a)'
            }
          >
            <ApprovalIcon approval={rung.approval} size={12} />
            {rung.approval === 'approved' ? 'Approved' : APPROVAL_LABEL[rung.approval]}
          </button>
        )}
        <div className="relative" ref={listRef}>
          <button
            type="button"
            onClick={() => setIsListOpen((open) => !open)}
            className="flex items-center gap-1 rounded border border-github-border px-2 py-1 text-xs text-github-text-secondary hover:text-github-text-primary"
            aria-expanded={isListOpen}
            aria-label="Rung list"
          >
            <List size={12} />
            Rungs
            {ladder.unplacedCount > 0 && (
              <span className="rounded-full bg-github-warning px-1.5 text-[10px] text-github-bg-primary">
                {ladder.unplacedCount}
              </span>
            )}
          </button>
          {isListOpen && (
            <div
              className="absolute right-0 top-full z-40 mt-1 w-96 max-w-[90vw] rounded-md border border-github-border bg-github-bg-primary py-1 shadow-lg"
              role="menu"
            >
              {ladder.rungs.map((item) => (
                <button
                  key={item.sha}
                  type="button"
                  role="menuitem"
                  onClick={() => select({ kind: 'rung', index: item.index })}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-github-bg-tertiary ${
                    view.kind === 'rung' && view.index === item.index ? 'bg-github-bg-tertiary' : ''
                  }`}
                  title={APPROVAL_LABEL[item.approval]}
                >
                  <ApprovalIcon approval={item.approval} size={12} />
                  <span className="shrink-0 font-mono text-github-text-secondary">
                    {item.index}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-github-text-primary">
                    {item.subject}
                  </span>
                  {item.openThreads > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-github-text-muted">
                      <MessageSquare size={11} />
                      {item.openThreads}
                    </span>
                  )}
                </button>
              ))}
              <div className="my-1 border-t border-github-border" />
              <button
                type="button"
                role="menuitem"
                onClick={() => select({ kind: 'all' })}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-github-bg-tertiary ${
                  view.kind === 'all' ? 'bg-github-bg-tertiary' : ''
                }`}
              >
                <Layers size={12} className="text-github-text-secondary" />
                <span className="text-github-text-primary">All — net diff of the ladder</span>
              </button>
              {ladder.unplacedCount > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsListOpen(false);
                    onOpenUnplaced();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-github-warning hover:bg-github-bg-tertiary"
                >
                  <AlertTriangle size={12} />
                  Unplaced threads ({ladder.unplacedCount})
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {rung && <VerifyChecklist rung={rung} />}
    </div>
  );
}
