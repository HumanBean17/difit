import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { CommentThread } from '../../types/diff';

import { CommentsListModal } from './CommentsListModal';

vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn(),
  useHotkeysContext: vi.fn(() => ({
    enableScope: vi.fn(),
    disableScope: vi.fn(),
  })),
  HotkeysProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockThreads: CommentThread[] = [
  {
    id: 'thread-1',
    file: 'src/file1.ts',
    line: 10,
    side: 'new',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    codeContent: 'const value = 1;',
    messages: [
      {
        id: 'thread-1',
        body: 'First root comment',
        author: 'User',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'reply-1',
        body: 'First reply',
        author: 'Reviewer',
        createdAt: '2024-01-01T00:01:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
      },
    ],
  },
  {
    id: 'thread-2',
    file: 'src/file2.ts',
    line: [20, 25],
    side: 'new',
    createdAt: '2024-01-01T00:02:00Z',
    updatedAt: '2024-01-01T00:02:00Z',
    messages: [
      {
        id: 'thread-2',
        body: 'Second root comment',
        author: 'User',
        createdAt: '2024-01-01T00:02:00Z',
        updatedAt: '2024-01-01T00:02:00Z',
      },
    ],
  },
];

const mockGeneralThread: CommentThread = {
  id: 'general-thread',
  file: null,
  line: null,
  createdAt: '2024-01-01T00:03:00Z',
  updatedAt: '2024-01-01T00:03:00Z',
  messages: [
    {
      id: 'general-thread',
      body: 'General root comment',
      author: 'User',
      createdAt: '2024-01-01T00:03:00Z',
      updatedAt: '2024-01-01T00:03:00Z',
    },
  ],
};

const mockRemoveThread = vi.fn();
const mockGenerateThreadPrompt = vi.fn().mockReturnValue('thread prompt');
const mockReplyToThread = vi.fn().mockResolvedValue(undefined);
const mockRemoveMessage = vi.fn();
const mockUpdateMessage = vi.fn();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <HotkeysProvider initiallyActiveScopes={['global']}>{children}</HotkeysProvider>
);

describe('CommentsListModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not render when closed', () => {
    const { container } = render(
      <CommentsListModal
        isOpen={false}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        comments={mockThreads}
        onRemoveThread={mockRemoveThread}
        onGenerateThreadPrompt={mockGenerateThreadPrompt}
        onReplyToThread={mockReplyToThread}
        onRemoveMessage={mockRemoveMessage}
        onUpdateMessage={mockUpdateMessage}
      />,
      { wrapper },
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders thread content when open', () => {
    render(
      <CommentsListModal
        isOpen={true}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        comments={mockThreads}
        onRemoveThread={mockRemoveThread}
        onGenerateThreadPrompt={mockGenerateThreadPrompt}
        onReplyToThread={mockReplyToThread}
        onRemoveMessage={mockRemoveMessage}
        onUpdateMessage={mockUpdateMessage}
      />,
      { wrapper },
    );

    expect(screen.getByText('All Comments')).toBeInTheDocument();
    expect(screen.getByText('First root comment')).toBeInTheDocument();
    expect(screen.getByText('First reply')).toBeInTheDocument();
    expect(screen.getByText('Second root comment')).toBeInTheDocument();
    expect(screen.getByText('src/file1.ts:10')).toBeInTheDocument();
    expect(screen.getByText('src/file2.ts:20-25')).toBeInTheDocument();
  });

  it('shows author badges when enabled', () => {
    render(
      <CommentsListModal
        isOpen={true}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        comments={mockThreads}
        showAuthorBadges={true}
        onRemoveThread={mockRemoveThread}
        onGenerateThreadPrompt={mockGenerateThreadPrompt}
        onReplyToThread={mockReplyToThread}
        onRemoveMessage={mockRemoveMessage}
        onUpdateMessage={mockUpdateMessage}
      />,
      { wrapper },
    );

    expect(screen.getAllByText('User').length).toBeGreaterThan(0);
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
  });

  it('navigates when clicking a thread', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <CommentsListModal
        isOpen={true}
        onClose={onClose}
        onNavigate={onNavigate}
        comments={mockThreads}
        onRemoveThread={mockRemoveThread}
        onGenerateThreadPrompt={mockGenerateThreadPrompt}
        onReplyToThread={mockReplyToThread}
        onRemoveMessage={mockRemoveMessage}
        onUpdateMessage={mockUpdateMessage}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByText('First root comment'));

    expect(onNavigate).toHaveBeenCalledWith(mockThreads[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the modal open when clicking inside the reply form', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <CommentsListModal
        isOpen={true}
        onClose={onClose}
        onNavigate={onNavigate}
        comments={mockThreads}
        onRemoveThread={mockRemoveThread}
        onGenerateThreadPrompt={mockGenerateThreadPrompt}
        onReplyToThread={mockReplyToThread}
        onRemoveMessage={mockRemoveMessage}
        onUpdateMessage={mockUpdateMessage}
      />,
      { wrapper },
    );

    await user.click(screen.getAllByRole('button', { name: 'Write a reply...' })[0]!);
    await user.click(screen.getByPlaceholderText('Write a reply...'));

    expect(screen.getByText('Reply to thread')).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the modal open when cancelling message editing', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <CommentsListModal
        isOpen={true}
        onClose={onClose}
        onNavigate={onNavigate}
        comments={mockThreads}
        onRemoveThread={mockRemoveThread}
        onGenerateThreadPrompt={mockGenerateThreadPrompt}
        onReplyToThread={mockReplyToThread}
        onRemoveMessage={mockRemoveMessage}
        onUpdateMessage={mockUpdateMessage}
      />,
      { wrapper },
    );

    await user.click(screen.getAllByTitle('Edit message')[0]!);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('First root comment')).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the modal resolve handler from the resolve button', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);

    render(
      <CommentsListModal
        isOpen={true}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        comments={mockThreads}
        onRemoveThread={mockRemoveThread}
        onGenerateThreadPrompt={mockGenerateThreadPrompt}
        onReplyToThread={mockReplyToThread}
        onRemoveMessage={mockRemoveMessage}
        onUpdateMessage={mockUpdateMessage}
      />,
      { wrapper },
    );

    await user.click(screen.getAllByTitle('Resolve thread')[0]!);

    expect(confirmSpy).toHaveBeenCalledWith('Resolve this thread?\n\n"First root comment"');
    expect(mockRemoveThread).not.toHaveBeenCalled();
  });

  it('shows empty state when there are no threads', () => {
    render(
      <CommentsListModal
        isOpen={true}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        comments={[]}
        onRemoveThread={mockRemoveThread}
        onGenerateThreadPrompt={mockGenerateThreadPrompt}
        onReplyToThread={mockReplyToThread}
        onRemoveMessage={mockRemoveMessage}
        onUpdateMessage={mockUpdateMessage}
      />,
      { wrapper },
    );

    expect(screen.getByText('No comments yet')).toBeInTheDocument();
  });

  it('sorts general threads first under a General label while keeping file order unchanged', () => {
    render(
      <CommentsListModal
        isOpen={true}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        // Deliberately unsorted input: the general thread must float to the top.
        comments={[mockThreads[0]!, mockGeneralThread, mockThreads[1]!]}
        onRemoveThread={mockRemoveThread}
        onGenerateThreadPrompt={mockGenerateThreadPrompt}
        onReplyToThread={mockReplyToThread}
        onRemoveMessage={mockRemoveMessage}
        onUpdateMessage={mockUpdateMessage}
      />,
      { wrapper },
    );

    expect(screen.getByText('General root comment')).toBeInTheDocument();

    const generalCard = document.getElementById('comment-thread-general-thread');
    const firstFileCard = document.getElementById('comment-thread-thread-1');
    const secondFileCard = document.getElementById('comment-thread-thread-2');
    expect(generalCard).not.toBeNull();
    expect(firstFileCard).not.toBeNull();
    expect(secondFileCard).not.toBeNull();

    // General threads render before file threads; file order is untouched.
    expect(
      generalCard!.compareDocumentPosition(firstFileCard!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      firstFileCard!.compareDocumentPosition(secondFileCard!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The General section label renders above the general thread card, and the
    // general card's own location label also reads General.
    const generalLabels = screen.getAllByText('General');
    expect(generalLabels.length).toBe(2);
    expect(
      generalLabels[0]!.compareDocumentPosition(generalCard!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('navigates when clicking a general thread', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <CommentsListModal
        isOpen={true}
        onClose={onClose}
        onNavigate={onNavigate}
        comments={[mockGeneralThread, mockThreads[0]!]}
        onRemoveThread={mockRemoveThread}
        onGenerateThreadPrompt={mockGenerateThreadPrompt}
        onReplyToThread={mockReplyToThread}
        onRemoveMessage={mockRemoveMessage}
        onUpdateMessage={mockUpdateMessage}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByText('General root comment'));

    expect(onNavigate).toHaveBeenCalledWith(mockGeneralThread);
    expect(onClose).toHaveBeenCalled();
  });
});
