import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

import type { DiffFile } from '../../types/diff';

import { DiffViewerHeader } from './DiffViewerHeader';

const file: DiffFile = {
  path: 'src/app.ts',
  status: 'modified',
  additions: 1,
  deletions: 1,
  chunks: [],
};

const baseProps = {
  file,
  isCollapsed: false,
  isReviewed: false,
  onToggleCollapsed: vi.fn(),
  onToggleAllCollapsed: vi.fn(),
  onToggleReviewed: vi.fn(),
};

describe('DiffViewerHeader', () => {
  it('shows the "Updated" badge when the file changed since last viewed', () => {
    render(<DiffViewerHeader {...baseProps} isChangedSinceViewed />);

    const badge = screen.getByLabelText('Updated since you last viewed this file');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Updated');
    expect(badge).toHaveAttribute('title', 'Updated since you last viewed this file');
  });

  it('hides the "Updated" badge once the file is marked as reviewed', () => {
    render(<DiffViewerHeader {...baseProps} isChangedSinceViewed isReviewed />);

    expect(
      screen.queryByLabelText('Updated since you last viewed this file'),
    ).not.toBeInTheDocument();
  });

  it('hides the "Updated" badge when the file is unchanged since last viewed', () => {
    render(<DiffViewerHeader {...baseProps} isChangedSinceViewed={false} />);

    expect(
      screen.queryByLabelText('Updated since you last viewed this file'),
    ).not.toBeInTheDocument();
  });
});

describe('DiffViewerHeader path display', () => {
  const deepFile: DiffFile = {
    path: 'src/main/java/com/acme/UserService.java',
    status: 'modified',
    additions: 12,
    deletions: 4,
    chunks: [],
  };

  it('renders the directory and basename as separate elements for deep paths', () => {
    render(<DiffViewerHeader {...baseProps} file={deepFile} />);

    expect(screen.getByText('src/main/java/com/acme')).toBeInTheDocument();
    expect(screen.getByText('UserService.java')).toBeInTheDocument();
  });

  it('keeps the basename prominent and non-shrinking while the directory truncates', () => {
    render(<DiffViewerHeader {...baseProps} file={deepFile} />);

    const basename = screen.getByText('UserService.java');
    expect(basename).toHaveClass('text-github-text-primary', 'font-medium', 'shrink-0');

    const directory = screen.getByText('src/main/java/com/acme');
    expect(directory).toHaveClass(
      'text-github-text-muted',
      'min-w-0',
      'overflow-hidden',
      'text-ellipsis',
      'whitespace-nowrap',
    );
  });

  it('ellipsizes the directory from the left via the RTL technique', () => {
    render(<DiffViewerHeader {...baseProps} file={deepFile} />);

    const directory = screen.getByText('src/main/java/com/acme');
    expect(directory).toHaveAttribute('style', expect.stringContaining('direction: rtl'));
    expect(directory).toHaveAttribute('style', expect.stringContaining('unicode-bidi: plaintext'));
  });

  it('exposes the full path via the title attribute for hover', () => {
    render(<DiffViewerHeader {...baseProps} file={deepFile} />);

    expect(screen.getByTitle('src/main/java/com/acme/UserService.java')).toBeInTheDocument();
  });

  it('renders only the basename when the path has no slash', () => {
    const flatFile: DiffFile = { ...file, path: 'README.md' };
    render(<DiffViewerHeader {...baseProps} file={flatFile} />);

    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.queryByText('/')).not.toBeInTheDocument();
    expect(screen.getByTitle('README.md')).toBeInTheDocument();
  });

  it('still renders the renamed-from note for renamed files', () => {
    const renamedFile: DiffFile = {
      ...deepFile,
      status: 'renamed',
      oldPath: 'src/main/java/com/acme/BaseUserService.java',
    };
    render(<DiffViewerHeader {...baseProps} file={renamedFile} />);

    expect(
      screen.getByText(/renamed from src\/main\/java\/com\/acme\/BaseUserService\.java/),
    ).toBeInTheDocument();
  });
});

describe('DiffViewerHeader focus navigation', () => {
  it('renders the position label and chevron buttons that invoke the callbacks', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <DiffViewerHeader {...baseProps} focusNav={{ position: 3, total: 27, onPrev, onNext }} />,
    );

    expect(screen.getByText('3 / 27')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Previous file'));
    expect(onPrev).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle('Next file'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('disables the previous button at the first file', () => {
    render(
      <DiffViewerHeader
        {...baseProps}
        focusNav={{ position: 1, total: 27, onPrev: vi.fn(), onNext: vi.fn() }}
      />,
    );

    expect(screen.getByTitle('Previous file')).toBeDisabled();
    expect(screen.getByTitle('Next file')).toBeEnabled();
  });

  it('disables the next button at the last file', () => {
    render(
      <DiffViewerHeader
        {...baseProps}
        focusNav={{ position: 27, total: 27, onPrev: vi.fn(), onNext: vi.fn() }}
      />,
    );

    expect(screen.getByTitle('Previous file')).toBeEnabled();
    expect(screen.getByTitle('Next file')).toBeDisabled();
  });

  it('renders nothing extra without focusNav', () => {
    render(<DiffViewerHeader {...baseProps} />);

    expect(screen.queryByTitle('Previous file')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Next file')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Focused file position')).not.toBeInTheDocument();
  });
});
