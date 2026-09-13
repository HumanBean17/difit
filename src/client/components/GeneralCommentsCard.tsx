import type { CommentThread } from '../../types/diff';

import { CommentForm } from './CommentForm';
import { CommentThreadCard } from './CommentThreadCard';
import type { AppearanceSettings } from './SettingsModal';

interface GeneralCommentsCardProps {
  threads: CommentThread[];
  isFormOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
  onAddComment: (body: string) => Promise<void>;
  showAuthorBadges?: boolean;
  syntaxTheme?: AppearanceSettings['syntaxTheme'];
  onGenerateThreadPrompt: (thread: CommentThread) => string;
  onRemoveThread: (threadId: string) => void;
  onReplyToThread: (threadId: string, body: string) => Promise<void>;
  onRemoveMessage: (threadId: string, messageId: string) => void;
  onUpdateMessage: (threadId: string, messageId: string, newBody: string) => void;
}

export function GeneralCommentsCard({
  threads,
  isFormOpen,
  onFormOpenChange,
  onAddComment,
  showAuthorBadges = false,
  syntaxTheme,
  onGenerateThreadPrompt,
  onRemoveThread,
  onReplyToThread,
  onRemoveMessage,
  onUpdateMessage,
}: GeneralCommentsCardProps) {
  // Nothing to show until there is either a general thread or an open form.
  if (threads.length === 0 && !isFormOpen) {
    return null;
  }

  const handleSubmit = async (body: string): Promise<void> => {
    await onAddComment(body);
    onFormOpenChange(false);
  };

  return (
    <section id="general-comments" className="mb-6 px-5 pt-4">
      <h3 className="m-0 mb-2 text-sm font-semibold text-github-text-primary">
        General comments{' '}
        <span className="font-normal text-github-text-secondary">({threads.length})</span>
      </h3>
      {isFormOpen && (
        <CommentForm
          onSubmit={handleSubmit}
          onCancel={() => onFormOpenChange(false)}
          syntaxTheme={syntaxTheme}
          embedded={true}
          title="General comment"
          submitLabel="Comment"
          placeholder="Leave a general comment..."
        />
      )}
      {threads.length > 0 && (
        <div className="space-y-2">
          {threads.map((thread) => (
            <CommentThreadCard
              key={thread.id}
              thread={thread}
              showAuthorBadges={showAuthorBadges}
              onGeneratePrompt={onGenerateThreadPrompt}
              onRemoveThread={onRemoveThread}
              onReplyToThread={onReplyToThread}
              onRemoveMessage={onRemoveMessage}
              onUpdateMessage={onUpdateMessage}
              syntaxTheme={syntaxTheme}
            />
          ))}
        </div>
      )}
    </section>
  );
}
