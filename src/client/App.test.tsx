import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';

import { mockFetch } from '../../vitest.setup';
import type { DiffCommentThread, DiffResponse } from '../types/diff';
import type { ClientWatchState } from '../types/watch';
import { DiffMode } from '../types/watch';

import App from './App';
import { useDiffComments } from './hooks/useDiffComments';
import { useViewedFiles } from './hooks/useViewedFiles';
import { useViewport } from './hooks/useViewport';

// Mock the useViewport hook
vi.mock('./hooks/useViewport', () => ({
  useViewport: vi.fn(() => ({ isMobile: false, isDesktop: true })),
}));

// Mock the useDiffComments hook
vi.mock('./hooks/useDiffComments', () => ({
  useDiffComments: vi.fn(() => ({
    hasLoadedComments: true,
    comments: [],
    threads: mockComments,
    replaceThreads: mockReplaceThreads,
    addComment: vi.fn(),
    addThread: vi.fn(),
    addGeneralThread: mockAddGeneralThread,
    removeComment: vi.fn(),
    removeThread: vi.fn(),
    removeMessage: vi.fn(),
    replyToThread: vi.fn(),
    updateComment: vi.fn(),
    updateMessage: vi.fn(),
    clearAllComments: mockClearAllComments,
    applyCommentImports: mockApplyCommentImports,
    generatePrompt: vi.fn(),
    generateThreadPrompt: vi.fn(),
    generateAllCommentsPrompt: mockGenerateAllCommentsPrompt,
  })),
}));

// Mock the useViewedFiles hook
const mockClearViewedFiles = vi.fn();
const mockToggleFileViewed = vi.fn();
let mockViewedFiles = new Set<string>();
let mockHasLoadedInitialViewedFiles = true;
vi.mock('./hooks/useViewedFiles', () => ({
  useViewedFiles: vi.fn(() => ({
    viewedFiles: mockViewedFiles,
    changedSinceViewedFiles: new Set<string>(),
    hasLoadedInitialViewedFiles: mockHasLoadedInitialViewedFiles,
    toggleFileViewed: mockToggleFileViewed,
    isFileContentChanged: vi.fn(),
    getViewedFileRecord: vi.fn(),
    clearViewedFiles: mockClearViewedFiles,
  })),
}));

const mockWatchState: ClientWatchState = {
  isWatchEnabled: true,
  diffMode: DiffMode.DEFAULT,
  shouldReload: false,
  isReloading: false,
  lastChangeTime: null,
  lastChangeType: null,
  connectionStatus: 'connected',
};

vi.mock('./hooks/useFileWatch', () => ({
  useFileWatch: vi.fn((onReload?: () => Promise<void>) => ({
    shouldReload: mockWatchState.shouldReload,
    isConnected: true,
    error: null,
    reload: vi.fn(async () => {
      if (onReload) {
        await onReload();
      }
      mockWatchState.shouldReload = false;
      mockWatchState.lastChangeType = null;
    }),
    watchState: mockWatchState,
  })),
}));

// Mock navigator.sendBeacon
Object.defineProperty(navigator, 'sendBeacon', {
  writable: true,
  value: vi.fn(),
});

// Mock window.confirm
const mockConfirm = vi.fn();
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: mockConfirm,
});

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  url: string;

  static clearInstances() {
    MockEventSource.instances = [];
  }
}
Object.defineProperty(window, 'EventSource', {
  writable: true,
  value: MockEventSource,
});

let mockComments: DiffCommentThread[] = [];
const mockReplaceThreads = vi.fn();
const mockAddGeneralThread = vi.fn();
const mockClearAllComments = vi.fn();
const mockApplyCommentImports = vi.fn(() => []);
const mockGenerateAllCommentsPrompt = vi.fn(() => 'formatted prompt');

function createMockThread({
  id,
  filePath,
  line,
  body,
  author = 'User',
}: {
  id: string;
  filePath: string;
  line: number;
  body: string;
  author?: string;
}): DiffCommentThread {
  const timestamp = '2024-01-01T00:00:00.000Z';
  return {
    id,
    filePath,
    createdAt: timestamp,
    updatedAt: timestamp,
    position: { side: 'new', line },
    messages: [
      {
        id,
        body,
        author,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

// Helper to render App with HotkeysProvider
const renderApp = () => {
  return render(
    <HotkeysProvider initiallyActiveScopes={['navigation']}>
      <App />
    </HotkeysProvider>,
  );
};

beforeEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  MockEventSource.clearInstances();
  mockViewedFiles = new Set<string>();
  mockHasLoadedInitialViewedFiles = true;
  mockReplaceThreads.mockReset();
  mockAddGeneralThread.mockReset();
  mockGenerateAllCommentsPrompt.mockClear();
});

const mockDiffResponse: DiffResponse = {
  commit: 'abc123',
  baseCommitish: 'HEAD^',
  targetCommitish: 'HEAD',
  requestedBaseCommitish: 'HEAD^',
  requestedTargetCommitish: 'HEAD',
  files: [
    {
      path: 'test.ts',
      status: 'modified',
      additions: 5,
      deletions: 2,
      chunks: [],
    },
  ],
  ignoreWhitespace: false,
  isEmpty: false,
};

describe('App Component - Clear Comments Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComments = [];
    mockApplyCommentImports.mockReset();
    mockApplyCommentImports.mockReturnValue([]);
    mockConfirm.mockReturnValue(false);
    mockFetch(mockDiffResponse);
  });

  describe('Copy All Prompt Button', () => {
    it('should generate Copy All Prompt with requested and resolved diff context', async () => {
      mockComments = [
        createMockThread({ id: 'test-1', filePath: 'test.ts', line: 10, body: 'Test comment' }),
      ];
      mockFetch({
        ...mockDiffResponse,
        baseCommitish: 'abcdef1',
        targetCommitish: '1234567',
        requestedBaseCommitish: 'main',
        requestedTargetCommitish: 'feature/docs-update',
        requestedBaseMode: 'merge-base',
      });

      renderApp();

      fireEvent.click(await screen.findByText(/Copy All Prompt/));

      await waitFor(() => {
        expect(mockGenerateAllCommentsPrompt).toHaveBeenCalledWith({
          requestedBaseCommitish: 'main',
          requestedTargetCommitish: 'feature/docs-update',
          baseMode: 'merge-base',
          resolvedBaseCommitish: 'abcdef1',
          resolvedTargetCommitish: '1234567',
        });
      });
    });
  });

  describe('Cleanup All Prompt Button', () => {
    it('should not show delete button when no comments exist', async () => {
      mockComments = [];

      renderApp();

      await waitFor(() => {
        // Cleanup All Prompt should not be visible without comments (dropdown doesn't exist)
        expect(screen.queryByText('Copy All Prompt')).not.toBeInTheDocument();
        expect(screen.queryByText('Cleanup All Prompt')).not.toBeInTheDocument();
      });
    });

    it('should show delete button when comments exist', async () => {
      mockComments = [
        createMockThread({ id: 'test-1', filePath: 'test.ts', line: 10, body: 'Test comment' }),
      ];

      renderApp();

      await waitFor(() => {
        // Find and click the dropdown toggle button (chevron)
        const dropdownToggle = screen.getByTitle('More options');
        fireEvent.click(dropdownToggle);
      });

      await waitFor(() => {
        expect(screen.getByText('Cleanup All Prompt')).toBeInTheDocument();
      });
    });

    it('should call clearAllComments immediately when delete button is clicked', async () => {
      mockComments = [
        createMockThread({ id: '1', filePath: 'test.ts', line: 10, body: 'Comment 1' }),
        createMockThread({ id: '2', filePath: 'test.ts', line: 20, body: 'Comment 2' }),
      ];

      renderApp();

      await waitFor(() => {
        // First, open the dropdown
        const dropdownToggle = screen.getByTitle('More options');
        fireEvent.click(dropdownToggle);
      });

      await waitFor(() => {
        const deleteButton = screen.getByText('Cleanup All Prompt');
        fireEvent.click(deleteButton);
      });

      expect(mockClearAllComments).toHaveBeenCalled();
    });
  });

  describe('Clean flag on Startup', () => {
    it('should clear existing comments when clearComments flag is true in response', async () => {
      const responseWithClearFlag: DiffResponse = {
        ...mockDiffResponse,
        clearComments: true,
      };

      mockFetch(responseWithClearFlag);

      renderApp();

      await waitFor(() => {
        expect(mockClearAllComments).toHaveBeenCalledWith({
          resetAppliedCommentImportIds: true,
        });
      });
    });

    it('should clear viewed files when clearComments flag is true in response', async () => {
      const responseWithClearFlag: DiffResponse = {
        ...mockDiffResponse,
        clearComments: true,
      };

      mockFetch(responseWithClearFlag);

      renderApp();

      await waitFor(() => {
        expect(mockClearViewedFiles).toHaveBeenCalled();
      });
    });

    it('should not clear comments when clearComments flag is false', async () => {
      const responseWithoutClearFlag: DiffResponse = {
        ...mockDiffResponse,
        clearComments: false,
      };

      mockFetch(responseWithoutClearFlag);

      renderApp();

      await waitFor(() => {
        expect(mockClearAllComments).not.toHaveBeenCalled();
      });
    });

    it('should not clear comments when clearComments flag is undefined', async () => {
      const responseWithoutFlag: DiffResponse = {
        ...mockDiffResponse,
        // clearComments is undefined
      };

      mockFetch(responseWithoutFlag);

      renderApp();

      await waitFor(() => {
        expect(mockClearAllComments).not.toHaveBeenCalled();
      });
    });

    it('should log message when clearing comments via CLI flag', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const responseWithClearFlag: DiffResponse = {
        ...mockDiffResponse,
        clearComments: true,
      };

      mockFetch(responseWithClearFlag);

      renderApp();

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '✅ All existing comments and viewed files cleared as requested via --clean flag',
        );
      });

      consoleLogSpy.mockRestore();
    });

    it('hydrates comments from the server comment session on startup', async () => {
      const serverThreads = [
        createMockThread({
          id: 'imported-thread',
          filePath: 'test.ts',
          line: 10,
          body: 'Imported comment',
        }),
      ];

      vi.mocked(global.fetch).mockImplementation((input) => {
        const url = String(input);

        if (url.startsWith('/api/comments-json')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ threads: serverThreads }),
          } as Response);
        }

        if (url.startsWith('/api/comments')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          } as Response);
        }

        if (url === '/api/revisions') {
          return Promise.resolve({
            ok: true,
            json: async () => null,
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          json: async () => mockDiffResponse,
          blob: async () => ({ size: 1024 }),
        } as Response);
      });

      renderApp();

      await waitFor(() => {
        expect(mockReplaceThreads).toHaveBeenCalledWith(serverThreads);
      });

      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        '/api/comments-json?base=HEAD%5E&target=HEAD',
      );
    });

    it('preserves server-provided comments after clearing local comments on startup', async () => {
      mockComments = [
        createMockThread({
          id: 'stale-local-thread',
          filePath: 'test.ts',
          line: 5,
          body: 'Stale local comment',
        }),
      ];
      const serverThreads = [
        createMockThread({
          id: 'imported-thread',
          filePath: 'test.ts',
          line: 10,
          body: 'Imported comment',
        }),
      ];
      const responseWithClearFlag: DiffResponse = {
        ...mockDiffResponse,
        clearComments: true,
      };

      vi.mocked(global.fetch).mockImplementation((input) => {
        const url = String(input);

        if (url.startsWith('/api/comments-json')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ threads: serverThreads }),
          } as Response);
        }

        if (url.startsWith('/api/comments')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          } as Response);
        }

        if (url === '/api/revisions') {
          return Promise.resolve({
            ok: true,
            json: async () => null,
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          json: async () => responseWithClearFlag,
          blob: async () => ({ size: 1024 }),
        } as Response);
      });

      renderApp();

      await waitFor(() => {
        expect(mockClearAllComments).toHaveBeenCalledWith({
          resetAppliedCommentImportIds: true,
        });
      });

      await waitFor(() => {
        expect(mockReplaceThreads).toHaveBeenCalledWith(serverThreads);
      });

      expect(mockReplaceThreads).not.toHaveBeenCalledWith([...serverThreads, ...mockComments]);
    });
  });
});

describe('App Component - Heartbeat Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComments = [];
    mockConfirm.mockReturnValue(false);
    mockFetch(mockDiffResponse);
  });

  it('uses the direct API url for heartbeat when configured in development', async () => {
    vi.stubEnv('VITE_DIFIT_API_URL', 'http://localhost:4969');

    renderApp();

    await waitFor(() => {
      expect(MockEventSource.instances[0]?.url).toBe('http://localhost:4969/api/heartbeat');
    });
  });
});

describe('App Component - Initial file collapsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComments = [];
    mockConfirm.mockReturnValue(false);
    mockFetch(mockDiffResponse);
    mockViewedFiles = new Set<string>();
    mockHasLoadedInitialViewedFiles = false;
  });

  it('collapses initially viewed files after viewed state finishes loading', async () => {
    const view = renderApp();

    await waitFor(() => {
      expect(screen.getByTitle('Collapse file (Alt+Click to collapse all)')).toBeInTheDocument();
    });

    expect(screen.getByTitle('Collapse file (Alt+Click to collapse all)')).toBeInTheDocument();

    act(() => {
      mockViewedFiles = new Set(['test.ts']);
      mockHasLoadedInitialViewedFiles = true;
      view.rerender(
        <HotkeysProvider initiallyActiveScopes={['navigation']}>
          <App />
        </HotkeysProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTitle('Expand file (Alt+Click to expand all)')).toBeInTheDocument();
    });
  });
});

describe('App Component - Comment sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockReturnValue(false);
    mockFetch(mockDiffResponse);
  });

  it('syncs an empty comment list after the last comment is resolved', async () => {
    mockComments = [
      createMockThread({ id: 'test-1', filePath: 'test.ts', line: 10, body: 'Test comment' }),
    ];

    const mockGlobalFetch = vi.mocked(global.fetch);
    const { rerender } = renderApp();

    await waitFor(() => {
      const commentCalls = mockGlobalFetch.mock.calls.filter(([url]) =>
        String(url).startsWith('/api/comments?'),
      );
      expect(commentCalls).toHaveLength(1);

      const [url, request] = commentCalls[0] as [string, RequestInit];
      expect(url).toBe('/api/comments?base=HEAD%5E&target=HEAD');
      expect(request.method).toBe('POST');
      expect(JSON.parse(String(request.body))).toEqual({
        threads: [
          expect.objectContaining({
            id: 'test-1',
            filePath: 'test.ts',
            position: { side: 'new', line: 10 },
            messages: [
              expect.objectContaining({
                id: 'test-1',
                body: 'Test comment',
                author: 'User',
              }),
            ],
          }),
        ],
      });
    });

    mockComments = [];
    rerender(
      <HotkeysProvider initiallyActiveScopes={['navigation']}>
        <App />
      </HotkeysProvider>,
    );

    await waitFor(() => {
      const commentCalls = mockGlobalFetch.mock.calls.filter(([url]) =>
        String(url).startsWith('/api/comments?'),
      );
      expect(commentCalls).toHaveLength(2);

      const [url, request] = commentCalls[1] as [string, RequestInit];
      expect(url).toBe('/api/comments?base=HEAD%5E&target=HEAD');
      expect(request.method).toBe('POST');
      expect(JSON.parse(String(request.body))).toEqual({ threads: [] });
    });
  });

  it('sends an empty comment list on unload when no comments remain', async () => {
    mockComments = [];
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    renderApp();

    await waitFor(() => {
      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    const beforeUnloadHandler = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'beforeunload',
    )?.[1] as (() => void) | undefined;
    expect(beforeUnloadHandler).toBeDefined();
    beforeUnloadHandler?.();

    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      '/api/comments?base=HEAD%5E&target=HEAD',
      JSON.stringify({ threads: [] }),
    );
    addEventListenerSpy.mockRestore();
  });

  it('shows author badges in the comments modal when the diff has multiple authors', async () => {
    mockComments = [
      createMockThread({ id: 'test-1', filePath: 'test.ts', line: 10, body: 'User comment' }),
      createMockThread({
        id: 'test-2',
        filePath: 'other.ts',
        line: 20,
        body: 'Reviewer comment',
        author: 'Reviewer',
      }),
    ];
    mockFetch({
      ...mockDiffResponse,
      files: [
        ...mockDiffResponse.files,
        {
          path: 'other.ts',
          status: 'modified',
          additions: 1,
          deletions: 1,
          chunks: [],
        },
      ],
    });

    renderApp();

    fireEvent.click(await screen.findByTitle('More options'));
    fireEvent.click(await screen.findByText('View All Comments'));

    expect(await screen.findByText('User')).toBeInTheDocument();
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
  });
});

describe('App Component - Diff Mode Persistence', () => {
  it('initializes the selected view mode from localStorage', async () => {
    mockFetch(mockDiffResponse);
    window.localStorage.setItem('difit.diffViewMode', 'unified');

    renderApp();

    const unifiedButton = await screen.findByRole('button', { name: 'Unified' });

    await waitFor(() => {
      expect(unifiedButton).toHaveClass('bg-github-bg-primary');
    });
  });

  it('persists the selected view mode to localStorage', async () => {
    mockFetch(mockDiffResponse);

    renderApp();

    const unifiedButton = await screen.findByRole('button', { name: 'Unified' });
    fireEvent.click(unifiedButton);

    expect(window.localStorage.getItem('difit.diffViewMode')).toBe('unified');
  });

  it('keeps the selected view mode after triggering refresh', async () => {
    const mockGlobalFetch = vi.mocked(global.fetch);
    mockGlobalFetch.mockClear();
    mockComments = [];
    mockClearAllComments.mockReset();
    mockConfirm.mockReturnValue(false);
    mockWatchState.shouldReload = true;
    mockWatchState.lastChangeType = 'file';
    mockFetch(mockDiffResponse);

    renderApp();

    const unifiedButton = await screen.findByRole('button', { name: 'Unified' });
    fireEvent.click(unifiedButton);

    await waitFor(() => {
      expect(unifiedButton).toHaveClass('bg-github-bg-primary');
    });

    const refreshButton = await screen.findByRole('button', { name: 'Refresh' });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      // 4 calls: initial /api/diff, /api/revisions, initial /api/comments sync, and refresh /api/diff
      expect(mockGlobalFetch).toHaveBeenCalledTimes(4);
    });

    await waitFor(() => {
      expect(unifiedButton).toHaveClass('bg-github-bg-primary');
    });
    mockWatchState.shouldReload = false;
    mockWatchState.lastChangeType = null;
  });
});

describe('App Component - Merge-base selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComments = [];
    mockConfirm.mockReturnValue(false);
  });

  it('clears the resolved base revision after switching to a merge-base quick diff', async () => {
    const initialDiffResponse: DiffResponse = {
      ...mockDiffResponse,
      baseCommitish: '88aabb0',
      targetCommitish: '.',
      requestedBaseCommitish: 'HEAD',
      requestedTargetCommitish: '.',
    };
    const mergeBaseDiffResponse: DiffResponse = {
      ...mockDiffResponse,
      baseCommitish: '1122334',
      targetCommitish: '.',
      requestedBaseCommitish: 'origin/main',
      requestedTargetCommitish: '.',
      requestedBaseMode: 'merge-base',
    };
    const revisionsResponse = {
      specialOptions: [{ value: '.', label: 'All Uncommitted Changes' }],
      branches: [],
      commits: [
        {
          hash: '88aabb0fffff1111222233334444555566667777',
          shortHash: '88aabb0',
          message: 'stale direct base',
        },
        {
          hash: '1122334fffff1111222233334444555566667777',
          shortHash: '1122334',
          message: 'merge base',
        },
      ],
      originDefaultBranch: 'origin/main',
    };

    vi.mocked(global.fetch).mockImplementation((input) => {
      const url = String(input);

      if (url.includes('/api/revisions')) {
        return Promise.resolve({
          ok: true,
          json: async () => revisionsResponse,
        } as Response);
      }

      if (url.includes('/api/diff')) {
        const response =
          url.includes('base=origin%2Fmain') && url.includes('baseMode=merge-base')
            ? mergeBaseDiffResponse
            : initialDiffResponse;

        return Promise.resolve({
          ok: true,
          json: async () => response,
          blob: async () => ({ size: 1024 }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    });

    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: /Revision menu:/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'origin/main...Uncommitted (merge-base)' }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'Revision menu: origin/main...Uncommitted Changes (merge-base)',
        }),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', {
        name: 'Revision menu: 88aabb0...Uncommitted Changes (merge-base)',
      }),
    ).not.toBeInTheDocument();
  });

  it('uses resolved revisions for persisted diff state identity', async () => {
    const response: DiffResponse = {
      ...mockDiffResponse,
      baseCommitish: '1234567',
      targetCommitish: '98664e1',
      requestedBaseCommitish: '98664e1^',
      requestedTargetCommitish: '98664e1',
    };

    mockFetch(response);

    renderApp();

    await waitFor(() => {
      expect(vi.mocked(useDiffComments)).toHaveBeenCalledWith(
        '1234567',
        '98664e1',
        'abc123',
        undefined,
        undefined,
        undefined,
      );
    });

    expect(vi.mocked(useViewedFiles)).toHaveBeenCalledWith(
      '1234567',
      '98664e1',
      'abc123',
      undefined,
      response.files,
      undefined,
      [],
      undefined,
    );
  });

  it('ignores stale resolvedBase from /api/revisions on initial merge-base load', async () => {
    const mergeBaseDiffResponse: DiffResponse = {
      ...mockDiffResponse,
      baseCommitish: '1122334',
      targetCommitish: '.',
      requestedBaseCommitish: 'origin/main',
      requestedTargetCommitish: '.',
      requestedBaseMode: 'merge-base',
    };
    const revisionsResponse = {
      specialOptions: [{ value: '.', label: 'All Uncommitted Changes' }],
      branches: [],
      commits: [
        {
          hash: '88aabb0fffff1111222233334444555566667777',
          shortHash: '88aabb0',
          message: 'stale direct base',
        },
      ],
      originDefaultBranch: 'origin/main',
      resolvedBase: '88aabb0',
      resolvedTarget: '1122334',
    };

    let resolveRevisions: (() => void) | null = null;

    vi.mocked(global.fetch).mockImplementation((input) => {
      const url = String(input);

      if (url.includes('/api/revisions')) {
        return new Promise<Response>((resolve) => {
          resolveRevisions = () =>
            resolve({
              ok: true,
              json: async () => revisionsResponse,
            } as Response);
        });
      }

      if (url.includes('/api/diff')) {
        return Promise.resolve({
          ok: true,
          json: async () => mergeBaseDiffResponse,
          blob: async () => ({ size: 1024 }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Reviewing:')).toBeInTheDocument();
    });

    await act(async () => {
      resolveRevisions?.();
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'Revision menu: origin/main...Uncommitted Changes (merge-base)',
        }),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', {
        name: 'Revision menu: 88aabb0...Uncommitted Changes (merge-base)',
      }),
    ).not.toBeInTheDocument();
  });
});

describe('App Component - Revision-aware refetching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComments = [];
    mockConfirm.mockReturnValue(false);
  });

  it('keeps the selected revisions when refetching without explicit revision params', async () => {
    const diffResponse: DiffResponse = {
      ...mockDiffResponse,
      requestedBaseCommitish: 'HEAD^',
      requestedTargetCommitish: 'HEAD',
    };

    vi.mocked(global.fetch).mockImplementation((input: string | URL | Request) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes('/api/revisions')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            specialOptions: [],
            branches: [],
            commits: [
              {
                hash: 'abc1234',
                shortHash: 'abc1234',
                message: 'Test commit',
              },
            ],
          }),
        } as Response);
      }

      if (url.startsWith('/api/comments?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => diffResponse,
        blob: async () => ({ size: 1024 }),
      } as Response);
    });

    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: /Revision menu:/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Previous commit' }));

    await waitFor(() => {
      const diffCalls = vi
        .mocked(global.fetch)
        .mock.calls.filter(([url]) => typeof url === 'string' && url.startsWith('/api/diff'));
      expect(diffCalls).toHaveLength(2);
      expect(String(diffCalls[1]?.[0])).toContain('base=HEAD%5E%5E');
      expect(String(diffCalls[1]?.[0])).toContain('target=HEAD%5E');
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ignore Whitespace' }));

    await waitFor(() => {
      const diffCalls = vi
        .mocked(global.fetch)
        .mock.calls.filter(([url]) => typeof url === 'string' && url.startsWith('/api/diff'));
      expect(diffCalls).toHaveLength(3);
      expect(String(diffCalls[2]?.[0])).toContain('base=HEAD%5E%5E');
      expect(String(diffCalls[2]?.[0])).toContain('target=HEAD%5E');
    });
  });
});

describe('App Component - Sidebar persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComments = [];
    mockConfirm.mockReturnValue(false);
    vi.mocked(useViewport).mockReturnValue({ isMobile: false, isDesktop: true });
    mockFetch(mockDiffResponse);
  });

  it('restores file tree open state from localStorage', async () => {
    window.localStorage.setItem('difit.sidebarOpen', 'false');

    renderApp();

    const toggleButton = await screen.findByRole('button', { name: /toggle file tree panel/i });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('persists file tree open state when toggled', async () => {
    renderApp();

    const toggleButton = await screen.findByRole('button', { name: /toggle file tree panel/i });

    fireEvent.click(toggleButton);
    await waitFor(() => {
      expect(window.localStorage.getItem('difit.sidebarOpen')).toBe('false');
    });

    fireEvent.click(toggleButton);
    await waitFor(() => {
      expect(window.localStorage.getItem('difit.sidebarOpen')).toBe('true');
    });
  });
});

describe('App Component - Active file scrollspy', () => {
  const threeFileDiffResponse: DiffResponse = {
    ...mockDiffResponse,
    files: [
      { path: 'file1.ts', status: 'modified', additions: 1, deletions: 1, chunks: [] },
      { path: 'file2.ts', status: 'modified', additions: 1, deletions: 1, chunks: [] },
      { path: 'file3.ts', status: 'modified', additions: 1, deletions: 1, chunks: [] },
    ],
  };

  // The diff header also carries the path in its title attribute, so pick the
  // titled element that belongs to a sidebar file row.
  const getTreeFileRow = (path: string): HTMLElement => {
    const row = screen
      .getAllByTitle(path)
      .map((element) => element.closest<HTMLElement>('[data-file-row="true"]'))
      .find((element) => element !== null);
    expect(row).toBeDefined();
    return row as HTMLElement;
  };

  const getDiffScrollContainer = (): HTMLElement => {
    const container = document.querySelector<HTMLElement>('main');
    expect(container).not.toBeNull();
    return container as HTMLElement;
  };

  const getDiffFileWrappers = (): HTMLElement[] => {
    const wrappers = Array.from(
      getDiffScrollContainer().querySelectorAll<HTMLElement>('[data-file-path]'),
    );
    expect(wrappers).toHaveLength(threeFileDiffResponse.files.length);
    return wrappers;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockComments = [];
    mockConfirm.mockReturnValue(false);
    mockFetch(threeFileDiffResponse);
  });

  it('marks the first file active before any scrolling happens', async () => {
    renderApp();

    await waitFor(() => {
      expect(getTreeFileRow('file1.ts')).toHaveAttribute('data-active', 'true');
    });
    expect(getTreeFileRow('file2.ts')).not.toHaveAttribute('data-active');
    expect(getTreeFileRow('file3.ts')).not.toHaveAttribute('data-active');
  });

  it('updates the active file from the diff scroll position', async () => {
    renderApp();

    await waitFor(() => {
      expect(getTreeFileRow('file1.ts')).toHaveAttribute('data-active', 'true');
    });

    // File 1 is scrolled past, file 2 sits above the activation threshold,
    // and file 3 is still below it, so file 2 should become active.
    const wrapperTops = [-100, 20, 500];
    getDiffFileWrappers().forEach((wrapper, index) => {
      vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, wrapperTops[index], 800, 100),
      );
    });

    fireEvent.scroll(getDiffScrollContainer());

    await waitFor(() => {
      expect(getTreeFileRow('file2.ts')).toHaveAttribute('data-active', 'true');
    });
    expect(getTreeFileRow('file1.ts')).not.toHaveAttribute('data-active');
    expect(getTreeFileRow('file3.ts')).not.toHaveAttribute('data-active');
  });

  it('falls back to the first file when no file reaches the activation threshold', async () => {
    renderApp();

    await waitFor(() => {
      expect(getTreeFileRow('file1.ts')).toHaveAttribute('data-active', 'true');
    });

    // Every file starts below the threshold line.
    const wrapperTops = [500, 600, 700];
    getDiffFileWrappers().forEach((wrapper, index) => {
      vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, wrapperTops[index], 800, 100),
      );
    });

    fireEvent.scroll(getDiffScrollContainer());

    await waitFor(() => {
      expect(getTreeFileRow('file1.ts')).toHaveAttribute('data-active', 'true');
    });
    expect(getTreeFileRow('file2.ts')).not.toHaveAttribute('data-active');
    expect(getTreeFileRow('file3.ts')).not.toHaveAttribute('data-active');
  });

  it('marks the clicked file tree row active', async () => {
    renderApp();

    await waitFor(() => {
      expect(getTreeFileRow('file1.ts')).toHaveAttribute('data-active', 'true');
    });

    fireEvent.click(getTreeFileRow('file3.ts'));

    await waitFor(() => {
      expect(getTreeFileRow('file3.ts')).toHaveAttribute('data-active', 'true');
    });
    expect(getTreeFileRow('file1.ts')).not.toHaveAttribute('data-active');
    expect(getTreeFileRow('file2.ts')).not.toHaveAttribute('data-active');
  });
});

describe('App Component - Focus mode', () => {
  const focusFileChunk = (start: number) => ({
    oldStart: start,
    oldLines: 2,
    newStart: start,
    newLines: 2,
    header: `@@ -${start},2 +${start},2 @@`,
    lines: [
      {
        type: 'normal' as const,
        oldLineNumber: start,
        newLineNumber: start,
        content: '  unchanged',
      },
      { type: 'add' as const, newLineNumber: start + 1, content: '+ added line' },
    ],
  });

  const threeFileDiffResponse: DiffResponse = {
    ...mockDiffResponse,
    files: [
      {
        path: 'file1.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        chunks: [focusFileChunk(1)],
      },
      {
        path: 'file2.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        chunks: [focusFileChunk(1)],
      },
      {
        path: 'file3.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        chunks: [focusFileChunk(1)],
      },
    ],
  };

  const getDiffFileWrappers = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('main [data-file-path]'));

  const getFocusModeToggle = (): HTMLElement =>
    screen.getByTitle('Focus mode — show only the active file (Esc to exit)');

  const enableFocusMode = async () => {
    const toggle = await screen.findByTitle('Focus mode — show only the active file (Esc to exit)');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(getDiffFileWrappers()).toHaveLength(1);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockComments = [];
    mockConfirm.mockReturnValue(false);
    mockFetch(threeFileDiffResponse);
  });

  it('renders exactly one file wrapper in focus mode versus all files in list mode', async () => {
    renderApp();

    await waitFor(() => {
      expect(getDiffFileWrappers()).toHaveLength(3);
    });

    await enableFocusMode();

    const wrappers = getDiffFileWrappers();
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0]).toHaveAttribute('data-file-path', 'file1.ts');
  });

  it('reflects the enabled state on the toggle and restores all wrappers when toggled off', async () => {
    renderApp();

    const toggle = await screen.findByTitle('Focus mode — show only the active file (Esc to exit)');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await enableFocusMode();
    expect(getFocusModeToggle()).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(getFocusModeToggle());

    await waitFor(() => {
      expect(getDiffFileWrappers()).toHaveLength(3);
    });
    expect(getFocusModeToggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('exits focus mode on Escape when no modal is open', async () => {
    renderApp();

    await enableFocusMode();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(getDiffFileWrappers()).toHaveLength(3);
    });
    expect(getFocusModeToggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps focus mode when Escape fires while focus is inside an input', async () => {
    renderApp();

    await enableFocusMode();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    await act(async () => {});
    expect(getDiffFileWrappers()).toHaveLength(1);
    expect(getFocusModeToggle()).toHaveAttribute('aria-pressed', 'true');

    input.remove();
  });

  it('moves focus to the next unviewed file when the focused file is marked viewed', async () => {
    renderApp();

    await enableFocusMode();
    expect(getDiffFileWrappers()[0]).toHaveAttribute('data-file-path', 'file1.ts');

    fireEvent.click(screen.getByRole('button', { name: /Viewed/ }));

    await waitFor(() => {
      const wrappers = getDiffFileWrappers();
      expect(wrappers).toHaveLength(1);
      expect(wrappers[0]).toHaveAttribute('data-file-path', 'file2.ts');
    });
  });

  it('switches the focused file with the ] and [ keys', async () => {
    const user = userEvent.setup();
    renderApp();

    await enableFocusMode();

    // From a null cursor the first ] lands on file 1 (the focused file);
    // the next one moves to file 2.
    await user.keyboard('{\\]}');
    await user.keyboard('{\\]}');
    await waitFor(() => {
      expect(getDiffFileWrappers()[0]).toHaveAttribute('data-file-path', 'file2.ts');
    });

    await user.keyboard('{\\[}');
    await waitFor(() => {
      expect(getDiffFileWrappers()[0]).toHaveAttribute('data-file-path', 'file1.ts');
    });
  });

  it('persists the focus mode toggle to localStorage', async () => {
    renderApp();

    await enableFocusMode();
    expect(window.localStorage.getItem('difit.focusMode')).toBe('true');

    fireEvent.click(getFocusModeToggle());
    await waitFor(() => {
      expect(window.localStorage.getItem('difit.focusMode')).toBe('false');
    });
  });

  it('disables the focus toggle when the file list is empty', async () => {
    mockFetch({ ...mockDiffResponse, files: [] });
    renderApp();

    const toggle = await screen.findByTitle('Focus mode — show only the active file (Esc to exit)');

    expect(toggle).toBeDisabled();
  });
});

describe('App Component - Mobile sidebar auto-close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComments = [];
    mockConfirm.mockReturnValue(false);
    vi.mocked(useViewport).mockReturnValue({ isMobile: true, isDesktop: false });
  });

  afterEach(() => {
    vi.mocked(useViewport).mockReturnValue({ isMobile: false, isDesktop: true });
  });

  it('closes the sidebar when a file is selected on mobile', async () => {
    mockFetch(mockDiffResponse);
    renderApp();

    // Sidebar toggle button
    const toggleButton = await screen.findByRole('button', { name: /toggle file tree panel/i });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    // Wait for file list to render, then click the file row.
    // The diff header also exposes the path via its title attribute, so pick
    // the titled element that belongs to a sidebar file row.
    const titledElements = await screen.findAllByTitle('test.ts');
    const fileRow = titledElements.find((el) => el.closest('[data-file-row]'));
    fireEvent.click(fileRow!.closest('[data-file-row]')!);

    // Sidebar should now be closed on mobile
    await waitFor(() => {
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    });
  });
});

describe('App Component - General comments', () => {
  const createGeneralMockThread = (id: string, body: string): DiffCommentThread => {
    const timestamp = '2024-01-01T00:00:00.000Z';
    return {
      id,
      filePath: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [
        {
          id,
          body,
          author: 'User',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockComments = [];
    mockConfirm.mockReturnValue(false);
    mockFetch(mockDiffResponse);
  });

  it('renders the top-bar button but no general comments card before any general comment exists', async () => {
    renderApp();

    expect(await screen.findByTitle('Add general comment')).toBeInTheDocument();
    expect(document.getElementById('general-comments')).toBeNull();
    expect(screen.queryByRole('heading', { name: /General comments/ })).not.toBeInTheDocument();
  });

  it('opens the general comment form and scrolls the diff container to top', async () => {
    const { container } = renderApp();

    const addButton = await screen.findByTitle('Add general comment');
    const scrollContainer = container.querySelector('main');
    expect(scrollContainer).not.toBeNull();
    scrollContainer!.scrollTop = 400;

    fireEvent.click(addButton);

    expect(await screen.findByText('General comment')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Leave a general comment...')).toBeInTheDocument();
    expect(scrollContainer!.scrollTop).toBe(0);
  });

  it('submits a general comment from the top-bar form and shows it in the card', async () => {
    const generalThread = createGeneralMockThread('general-1', 'Overall this looks great');
    mockAddGeneralThread.mockImplementation(() => {
      mockComments = [generalThread];
      return generalThread;
    });

    const { rerender } = renderApp();

    fireEvent.click(await screen.findByTitle('Add general comment'));

    const textarea = await screen.findByPlaceholderText('Leave a general comment...');
    fireEvent.change(textarea, { target: { value: 'Overall this looks great' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() => {
      expect(mockAddGeneralThread).toHaveBeenCalledWith('Overall this looks great');
    });
    // The form closes after a successful submit.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Leave a general comment...')).not.toBeInTheDocument();
    });

    // Reflect the hook state update, as the real useDiffComments would.
    rerender(
      <HotkeysProvider initiallyActiveScopes={['navigation']}>
        <App />
      </HotkeysProvider>,
    );

    expect(await screen.findByText('Overall this looks great')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'General comments (1)' })).toBeInTheDocument();
  });

  it('scrolls the general comments card into view when navigating to a general thread', async () => {
    mockComments = [createGeneralMockThread('general-1', 'General remark')];

    renderApp();

    fireEvent.click(await screen.findByTitle('More options'));
    fireEvent.click(await screen.findByText('View All Comments'));

    const generalCard = await waitFor(() => {
      const element = document.getElementById('general-comments');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    const scrollIntoViewSpy = vi.spyOn(generalCard, 'scrollIntoView');

    // The body text also exists in the pinned card behind the modal, so scope
    // the click to the modal's own copy of the thread.
    const modal = screen.getByText('All Comments').closest('div.fixed');
    expect(modal).not.toBeNull();
    fireEvent.click(within(modal as HTMLElement).getByText('General remark'));

    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });
});
