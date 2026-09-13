import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

import type { DiffFile } from '../../types/diff';

import { FileList } from './FileList';

const createFile = (
  path: string,
  totals: { additions?: number; deletions?: number } = {},
): DiffFile => ({
  path,
  status: 'modified',
  additions: totals.additions ?? 1,
  deletions: totals.deletions ?? 1,
  chunks: [],
});

function getTreeRow(title: string): HTMLElement {
  const row = screen.getByTitle(title).closest<HTMLElement>('[data-tree-row="true"]');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function getLabel(title: string): HTMLElement {
  return screen.getByTitle(title);
}

describe('FileList', () => {
  it('renders total additions and deletions beside the file count', () => {
    render(
      <FileList
        files={[
          createFile('README.md', { additions: 3, deletions: 1 }),
          createFile('src/client/App.tsx', { additions: 2, deletions: 4 }),
        ]}
        onScrollToFile={vi.fn()}
        comments={[]}
        reviewedFiles={new Set()}
        onToggleReviewed={vi.fn()}
        onToggleFolderReviewed={vi.fn()}
        selectedFileIndex={null}
      />,
    );

    expect(screen.getByText('Files changed (2)')).toBeInTheDocument();
    expect(screen.getByLabelText('5 additions and 5 deletions')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
  });

  it('strikes through directories when all descendant files are reviewed', () => {
    const files = [
      createFile('src/cli/index.ts'),
      createFile('src/client/App.tsx'),
      createFile('README.md'),
    ];
    const props = {
      files,
      onScrollToFile: vi.fn(),
      comments: [],
      onToggleReviewed: vi.fn(),
      onToggleFolderReviewed: vi.fn(),
      selectedFileIndex: null,
    };
    const { rerender } = render(
      <FileList {...props} reviewedFiles={new Set(['README.md', 'src/cli/index.ts'])} />,
    );

    expect(getLabel('src')).not.toHaveClass('line-through');
    expect(getTreeRow('src')).not.toHaveClass('opacity-70');
    expect(getLabel('cli')).toHaveClass('line-through');
    expect(getTreeRow('cli')).toHaveClass('opacity-70');
    expect(getLabel('client')).not.toHaveClass('line-through');
    expect(getTreeRow('client')).not.toHaveClass('opacity-70');

    rerender(
      <FileList
        {...props}
        reviewedFiles={new Set(['README.md', 'src/cli/index.ts', 'src/client/App.tsx'])}
      />,
    );

    expect(getLabel('src')).toHaveClass('line-through');
    expect(getTreeRow('src')).toHaveClass('opacity-70');
    expect(getLabel('cli')).toHaveClass('line-through');
    expect(getTreeRow('cli')).toHaveClass('opacity-70');
    expect(getLabel('client')).toHaveClass('line-through');
    expect(getTreeRow('client')).toHaveClass('opacity-70');
  });

  it('marks all files in a folder as reviewed via the directory checkbox', () => {
    const onToggleFolderReviewed = vi.fn();
    render(
      <FileList
        files={[
          createFile('src/cli/index.ts'),
          createFile('src/client/App.tsx'),
          createFile('README.md'),
        ]}
        onScrollToFile={vi.fn()}
        comments={[]}
        reviewedFiles={new Set()}
        onToggleReviewed={vi.fn()}
        onToggleFolderReviewed={onToggleFolderReviewed}
        selectedFileIndex={null}
      />,
    );

    const checkbox = within(getTreeRow('src')).getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(checkbox);
    expect(onToggleFolderReviewed).toHaveBeenCalledWith('src', true);
  });

  it('renders both a file row and directory children when a path is both a file and a directory prefix', () => {
    const onScrollToFile = vi.fn();
    render(
      <FileList
        files={[
          { ...createFile('vendor'), status: 'deleted' },
          createFile('vendor/lib.ts'),
          createFile('vendor/utils.ts'),
        ]}
        onScrollToFile={onScrollToFile}
        comments={[]}
        reviewedFiles={new Set()}
        onToggleReviewed={vi.fn()}
        onToggleFolderReviewed={vi.fn()}
        selectedFileIndex={null}
      />,
    );

    expect(screen.getByTitle('vendor/lib.ts')).toBeInTheDocument();
    expect(screen.getByTitle('vendor/utils.ts')).toBeInTheDocument();

    const vendorElements = screen.getAllByTitle('vendor');
    const vendorFileRow = vendorElements
      .map((el) => el.closest('[data-file-row="true"]'))
      .find(Boolean);
    expect(vendorFileRow).toBeDefined();
    fireEvent.click(vendorFileRow!);
    expect(onScrollToFile).toHaveBeenCalledWith('vendor');
  });

  it('unmarks all files in a fully reviewed folder via the directory checkbox', () => {
    const onToggleFolderReviewed = vi.fn();
    render(
      <FileList
        files={[createFile('src/cli/index.ts'), createFile('src/client/App.tsx')]}
        onScrollToFile={vi.fn()}
        comments={[]}
        reviewedFiles={new Set(['src/cli/index.ts', 'src/client/App.tsx'])}
        onToggleReviewed={vi.fn()}
        onToggleFolderReviewed={onToggleFolderReviewed}
        selectedFileIndex={null}
      />,
    );

    const checkbox = within(getTreeRow('src')).getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(checkbox);
    expect(onToggleFolderReviewed).toHaveBeenCalledWith('src', false);
  });

  describe('active file row', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('re-expands collapsed ancestors of the selected file and reveals the row', async () => {
      const props = {
        files: [createFile('src/a.ts'), createFile('other/b.ts')],
        onScrollToFile: vi.fn(),
        comments: [],
        reviewedFiles: new Set<string>(),
        onToggleReviewed: vi.fn(),
        onToggleFolderReviewed: vi.fn(),
        selectedFileIndex: null,
      };
      const scrollIntoViewSpy = vi
        .spyOn(Element.prototype, 'scrollIntoView')
        .mockImplementation(() => {});
      const { rerender } = render(<FileList {...props} />);

      // Collapse the folder containing src/a.ts.
      fireEvent.click(getTreeRow('src'));
      expect(screen.queryByTitle('src/a.ts')).not.toBeInTheDocument();

      rerender(<FileList {...props} selectedFileIndex={0} />);

      // The folder re-expands so the selected file's row is visible again.
      expect(screen.getByTitle('src/a.ts')).toBeInTheDocument();
      expect(getTreeRow('src/a.ts')).toHaveAttribute('data-active', 'true');

      // The revealed row is scrolled into view within the tree.
      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'nearest' });
      });
    });

    it('keeps unrelated collapsed folders collapsed when the selection changes', () => {
      const props = {
        files: [createFile('src/a.ts'), createFile('src/c.ts'), createFile('other/b.ts')],
        onScrollToFile: vi.fn(),
        comments: [],
        reviewedFiles: new Set<string>(),
        onToggleReviewed: vi.fn(),
        onToggleFolderReviewed: vi.fn(),
        selectedFileIndex: 0,
      };
      const { rerender } = render(<FileList {...props} />);

      // Collapse a folder unrelated to the current selection.
      fireEvent.click(getTreeRow('other'));
      expect(screen.queryByTitle('other/b.ts')).not.toBeInTheDocument();

      rerender(<FileList {...props} selectedFileIndex={1} />);

      expect(getTreeRow('src/c.ts')).toHaveAttribute('data-active', 'true');
      expect(screen.queryByTitle('other/b.ts')).not.toBeInTheDocument();
    });

    it('marks only the selected row as active', () => {
      render(
        <FileList
          files={[createFile('src/a.ts'), createFile('src/b.ts')]}
          onScrollToFile={vi.fn()}
          comments={[]}
          reviewedFiles={new Set()}
          onToggleReviewed={vi.fn()}
          onToggleFolderReviewed={vi.fn()}
          selectedFileIndex={1}
        />,
      );

      expect(getTreeRow('src/b.ts')).toHaveAttribute('data-active', 'true');
      expect(getTreeRow('src/a.ts')).not.toHaveAttribute('data-active');
    });
  });
});
