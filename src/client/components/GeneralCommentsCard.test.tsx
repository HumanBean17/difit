import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CommentThread } from '../../types/diff';

import { GeneralCommentsCard } from './GeneralCommentsCard';

const createGeneralThread = (id: string, body: string): CommentThread => ({
  id,
  file: null,
  line: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  messages: [
    {
      id,
      body,
      author: 'User',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ],
});

const setupProps = (overrides?: Partial<Parameters<typeof GeneralCommentsCard>[0]>) => ({
  threads: [createGeneralThread('general-1', 'First general comment')],
  isFormOpen: false,
  onFormOpenChange: vi.fn(),
  onAddComment: vi.fn().mockResolvedValue(undefined),
  onGenerateThreadPrompt: vi.fn().mockReturnValue('thread prompt'),
  onRemoveThread: vi.fn(),
  onReplyToThread: vi.fn().mockResolvedValue(undefined),
  onRemoveMessage: vi.fn(),
  onUpdateMessage: vi.fn(),
  ...overrides,
});

describe('GeneralCommentsCard', () => {
  it('renders a heading with the thread count and one card per general thread', () => {
    const props = setupProps({
      threads: [
        createGeneralThread('general-1', 'First general comment'),
        createGeneralThread('general-2', 'Second general comment'),
      ],
    });

    const { container } = render(<GeneralCommentsCard {...props} />);

    expect(container.firstChild).toHaveAttribute('id', 'general-comments');
    expect(screen.getByRole('heading', { name: 'General comments (2)' })).toBeInTheDocument();
    expect(screen.getByText('First general comment')).toBeInTheDocument();
    expect(screen.getByText('Second general comment')).toBeInTheDocument();
  });

  it('renders nothing when there are no threads and the form is closed', () => {
    const props = setupProps({ threads: [] });

    const { container } = render(<GeneralCommentsCard {...props} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders the form when it is open even without threads', () => {
    const props = setupProps({ threads: [], isFormOpen: true });

    render(<GeneralCommentsCard {...props} />);

    expect(screen.getByRole('heading', { name: 'General comments (0)' })).toBeInTheDocument();
    expect(screen.getByText('General comment')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Leave a general comment...')).toBeInTheDocument();
  });

  it('submits the trimmed body and closes the form', async () => {
    const user = userEvent.setup();
    const props = setupProps({ isFormOpen: true });

    render(<GeneralCommentsCard {...props} />);

    await user.type(screen.getByPlaceholderText('Leave a general comment...'), '  Nice work  ');
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    expect(props.onAddComment).toHaveBeenCalledTimes(1);
    expect(props.onAddComment).toHaveBeenCalledWith('Nice work');
    expect(props.onFormOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes the form on cancel', async () => {
    const user = userEvent.setup();
    const props = setupProps({ isFormOpen: true });

    render(<GeneralCommentsCard {...props} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onFormOpenChange).toHaveBeenCalledWith(false);
    expect(props.onAddComment).not.toHaveBeenCalled();
  });

  it('passes lifecycle callbacks through to the thread cards', async () => {
    const user = userEvent.setup();
    const props = setupProps();

    render(<GeneralCommentsCard {...props} />);

    // Root resolve keeps the card's inline confirmation before resolving.
    await user.click(screen.getByTitle('Resolve thread'));
    await user.click(screen.getByRole('button', { name: 'Resolve' }));

    expect(props.onRemoveThread).toHaveBeenCalledWith('general-1');
  });
});
