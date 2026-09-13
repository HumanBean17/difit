# Review UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four approved review-UX features from `docs/superpowers/specs/active/2026-09-13-review-ux-improvements-design.md`: Java-friendly split file headers, an `activeFileIndex`-driven scrollspy file tree, single-file focus mode, and general (file-independent) comments.

**Architecture:** A single `activeFileIndex` state in `App.tsx` (fed by keyboard cursor, tree clicks, and a scroll listener) becomes the shared foundation; focus mode renders only that file while keeping the keyboard-navigation data model intact. General comments extend the existing `DiffCommentThread` model with `filePath: null` and no `position`, flowing through the existing hook, server sync, and card lifecycle unchanged.

**Tech Stack:** React 19 + TypeScript (strictest), Tailwind v4 with `github-*` color tokens, lucide-react icons, react-hotkeys-hook, Vitest + happy-dom + React Testing Library, Express server.

## Global Constraints

- Package manager is `pnpm` only; Node ≥21.
- Strict TypeScript (`tsconfig.strictest`): no `any`, use `import type`, 2-space indent.
- `pnpm check` (oxlint) and `pnpm format` (oxfmt) must pass before every commit; `pnpm test` and `pnpm build` must pass at the end of every task.
- Tests are colocated as `*.test.ts(x]` next to the code, using Vitest + Testing Library; async flows must await assertions.
- Commit style: Conventional Commits, e.g. `feat(client): ...`, `feat(server): ...`, `fix: ...`.
- UI styling follows existing conventions: `github-*` Tailwind tokens, lucide-react icons sized 14–18, existing button/hover patterns.
- Do not edit `dist/`; do not modify diff computation or chunking logic.
- All work happens on branch `feat/review-ux-improvements` (create in Task 1, before the first commit).
- localStorage keys follow the `difit.` prefix convention (e.g. `difit.focusMode`).

---

### Task 1: Split file path helper + Java-friendly diff header

**Files:**
- Create: `src/client/utils/filePath.ts`
- Test: `src/client/utils/filePath.test.ts`
- Modify: `src/client/components/DiffViewerHeader.tsx` (the `<h2>` at ~line 79)
- Test: `src/client/components/DiffViewerHeader.test.tsx` (extend)
- Modify: `src/client/App.tsx` (deferred-rendering placeholder, ~line 1546)

**Interfaces:**
- Consumes: `DiffFile` from `src/types/diff.ts` (existing).
- Produces: `splitFilePath(path: string): { directory: string; basename: string }` — `directory` is everything before the final `/` (empty string when the path has no `/`), `basename` is the final segment. Exact cases: `splitFilePath('src/main/java/A.java')` → `{ directory: 'src/main/java', basename: 'A.java' }`; `splitFilePath('A.java')` → `{ directory: '', basename: 'A.java' }`; `splitFilePath('')` → `{ directory: '', basename: '' }`; `splitFilePath('a/b/')` → `{ directory: 'a/b', basename: '' }`. Later tasks and the placeholder display rely on this exact shape.

- [ ] **Step 1: Create the branch**

Run: `git checkout -b feat/review-ux-improvements`
Expected: branch created from current `main`.

- [ ] **Step 2: Write failing tests for `splitFilePath`**

In `src/client/utils/filePath.test.ts`, cover: deep path splits at the last slash; path with no slash returns empty directory; empty string returns empty directory and empty basename; trailing slash returns empty basename with the parent as directory. Assert exact object equality.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test -- filePath`
Expected: FAIL — module `filePath.ts` does not exist.

- [ ] **Step 4: Implement `splitFilePath`**

Create `src/client/utils/filePath.ts` exporting `splitFilePath` with the exact contract above (last-index-of `/` split; no other behavior).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- filePath`
Expected: PASS.

- [ ] **Step 6: Write failing header tests**

Extend `DiffViewerHeader.test.tsx`: rendering a file with path `src/main/java/com/acme/UserService.java` shows (a) a directory element containing `src/main/java/com/acme`, (b) a basename element containing `UserService.java`, (c) the basename element is visually distinct (assert it carries the prominent class/attribute the implementation uses — spec: primary color + font-medium), and (d) the full path is still exposed via the header's `title` attribute for hover. A path with no slash renders only the basename element (no directory element). The "renamed from" note still renders for renamed files. Cover the basename-never-truncates expectation by asserting the basename element has `shrink-0` (or equivalent non-shrink class) and the directory element carries the truncation class.

- [ ] **Step 7: Run tests to verify they fail**

Run: `pnpm test -- DiffViewerHeader`
Expected: FAIL — directory element not found.

- [ ] **Step 8: Implement the split rendering in `DiffViewerHeader`**

Replace the single `<h2>{file.path}</h2>` with a two-part layout inside the same flex container: a directory `<span>` (muted `text-github-text-muted`, `min-w-0`, `overflow-hidden`, ellipsis) followed by a `/` separator and a basename `<span>` (`text-github-text-primary font-medium`, `shrink-0`, never truncated). The directory span must ellipsize from its **left** so the deepest package segments survive — use the RTL-ellipsis technique (`direction: rtl` + `unicode-bidi: plaintext` on that span, keeping the LTR text order correct). Directory span and separator render only when `directory` is non-empty. Keep the `title={file.path}` hover on the path container and the existing copy-path button unchanged.

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm test -- DiffViewerHeader`
Expected: PASS.

- [ ] **Step 10: Apply the same display to the deferred-rendering placeholder in `App.tsx`**

In the "Deferred Rendering" placeholder block, render the path via `splitFilePath` with the same dimmed-directory + prominent-basename treatment (a tiny inline usage; no new component).

- [ ] **Step 11: Run full check + tests, format, commit**

Run: `pnpm check && pnpm test && pnpm format`
Run: `git add -A && git commit -m "feat(client): split long file paths into dimmed directory and prominent basename in diff headers"`

---

### Task 2: `activeFileIndex` foundation + scrollspy file tree

**Files:**
- Modify: `src/client/App.tsx` (state, cursor effect, tree-click handler, scroll listener, `FileList` prop)
- Test: `src/client/App.test.tsx` (extend)
- Modify: `src/client/components/FileList.tsx` (row styling, ancestor auto-expand, row reveal)
- Test: `src/client/components/FileList.test.tsx` (extend)

**Interfaces:**
- Consumes: `FileList`'s existing `selectedFileIndex: number | null` prop; `useLazyDiffRendering`'s existing `scrollFileIntoDiffContainer`; `diffScrollContainerRef`.
- Produces:
  - `App` state `activeFileIndex: number | null`, updated by: (1) keyboard cursor file changes, (2) file-tree row clicks, (3) a scroll listener on the diff scroll container. Later tasks consume it (Task 3 focus mode; Task 5 general-card scroll uses unrelated anchor).
  - Scroll-listener contract: passive `scroll` listener on `diffScrollContainerRef.current`, rAF-throttled; queries the container's `[data-file-path]` children; the active file is the **last** child (in `diffData.files` order) whose `getBoundingClientRect().top <= containerTop + 60`; if none qualifies, the first file. Guarded by an `enabled` boolean in the effect's dependency array (initially the constant `true`; Task 3 replaces it with `!isFocusMode`). When `diffData` changes, `activeFileIndex` resets to `0` if null or out of range.
  - `FileList` row contract: the selected file row sets `data-active="true"` and shows a 2px accent-colored left bar (e.g. inset box-shadow or left border using `var(--color-github-accent)`) plus `font-medium` text, in addition to the existing background tint. Ancestors of the selected file are unioned into `expandedDirs` (expand-only). The selected row is scrolled into view with `scrollIntoView({ block: 'nearest' })` inside the tree's scroll container, skipped while the tree container is `:hover`.

- [ ] **Step 1: Write failing App scrollspy test**

Extend `App.test.tsx` (follow its existing fetch-mocking pattern): render with a 3-file diff; initially `activeFileIndex` is 0 (assert the first tree row carries `data-active="true"`). Mock `getBoundingClientRect` on the file wrapper elements so file 2's top is above the threshold and file 3's is below, dispatch a `scroll` event on the diff scroll container, and assert the second tree row becomes `data-active="true"`. Also assert clicking a tree row for file 3 marks it active.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- App`
Expected: FAIL — no `data-active` attribute / active row stays first.

- [ ] **Step 3: Implement `activeFileIndex` in App**

Add state, the three update sources, the reset-on-diffData effect, and pass `selectedFileIndex={activeFileIndex}` to `FileList` (replacing `cursor?.fileIndex ?? null`). The tree-click handler wraps the existing `onScrollToFile` callback and also sets the index for the clicked path. The cursor effect keys on `cursor?.fileIndex` (not the cursor object identity).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- App`
Expected: PASS.

- [ ] **Step 5: Write failing FileList tests**

Extend `FileList.test.tsx`: (a) with `selectedFileIndex` pointing at a file whose parent folders are collapsed (pre-collapse via initial state manipulation or a first render with a different selection — simplest: render, collapse the folder via its header click, then rerender with `selectedFileIndex` of a file inside it) the folder re-expands and the row is visible; (b) collapsing an unrelated folder stays collapsed when the selection changes to a file elsewhere; (c) the selected row carries `data-active="true"` while others do not. For (c) assert the attribute; visual classes need no assertion beyond presence.

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm test -- FileList`
Expected: FAIL.

- [ ] **Step 7: Implement FileList changes**

Add `data-active` + accent-bar + `font-medium` styling to the selected row; add a ref map (or `data-file-path` attribute + query) for file rows; add an effect that, on `selectedFileIndex` change, derives the selected path, unions every directory-prefix of that path into `expandedDirs` (never removing), and scrolls the row into view (`block: 'nearest'`) unless the tree scroll container matches `:hover`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test -- FileList && pnpm test -- App`
Expected: PASS.

- [ ] **Step 9: Full check, format, commit**

Run: `pnpm check && pnpm test && pnpm format`
Run: `git add -A && git commit -m "feat(client): track active file across scroll, keyboard, and tree clicks with distinct tree highlight"`

---

### Task 3: Focus mode (single-file view)

**Files:**
- Modify: `src/client/App.tsx` (state + persistence, toolbar toggle, render filtering, cross-file cursor effect, viewed-advance, Esc exit, focusNav wiring)
- Modify: `src/client/components/DiffViewer.tsx` (new optional prop, forwarded)
- Modify: `src/client/components/DiffViewerHeader.tsx` (focus nav UI)
- Test: extend `src/client/App.test.tsx`, `src/client/components/DiffViewerHeader.test.tsx`
- Modify: `src/client/components/HelpModal.tsx` (shortcut rows)

**Interfaces:**
- Consumes: `activeFileIndex` and its setters from Task 2; `ensureFileRendered`, `scrollFileIntoDiffContainer` from `useLazyDiffRendering`; `toggleFileViewed` state from `useViewedFiles`; `useHotkeys` from react-hotkeys-hook.
- Produces:
  - `App` state `isFocusMode: boolean`, persisted under localStorage key `difit.focusMode` and hydrated/saved through `fetchClientSettings`/`saveClientSettings` under client key `focusMode` (mirroring the existing `sidebarOpen` pattern, including the skip-initial-mount save ref).
  - `DiffViewer` new optional prop: `focusNav?: { position: number; total: number; onPrev: () => void; onNext: () => void }` — forwarded to `DiffViewerHeader`, which renders prev/next chevron buttons plus a `"{position} / {total}"` label, buttons disabled at the boundaries (clamp, never wrap).
  - Behavior contract: in focus mode exactly one file renders (the focused one = `activeFileIndex`); `]`/`[` switch files (clamped); tree clicks switch files; marking the focused file viewed auto-focuses the next unviewed file strictly **after** the current index (no wrap; stays if none); `Esc` exits; entering/exiting never loses the active file.

- [ ] **Step 1: Write failing App focus-mode tests**

Extend `App.test.tsx` with a multi-file diff:
1. Toggling focus mode on renders exactly one `[data-file-path]` wrapper in the diff area (vs. N in list mode).
2. The toolbar toggle button reflects enabled state; clicking again restores all N wrappers.
3. `Escape` keydown exits focus mode (dispatch on document) when no modal is open and focus is not in an input/textarea.
4. Marking the focused file reviewed (click its Viewed button) moves focus to the next unviewed file (assert the single rendered wrapper's `data-file-path` changed).
5. Toggling writes `difit.focusMode` to localStorage.
6. With an empty file list the toggle button is disabled.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- App`
Expected: FAIL.

- [ ] **Step 3: Implement focus mode in App**

Implement per the Interfaces block: persistence (storage key, initial value, hydration in the existing `fetchClientSettings` effect, save effect with skip-initial ref); toolbar icon button (lucide `Focus`, 16–18px, `title="Focus mode — show only the active file (Esc to exit)"`, active styling when on, disabled on empty diff) placed in the toolbar control group beside the Split/Unified switcher and visible on mobile too; render filtering that keeps **original** `fileIndex` values when mapping (so cursor/fileIndex comparisons stay correct); entry effect (`ensureFileRendered` for the focused path, remove it from `collapsedFiles`, default `activeFileIndex` to 0 when null); cross-file cursor effect (`isFocusMode && cursor.fileIndex !== activeFileIndex` → set active, ensure rendered, un-collapse, then rAF `scrollTop = 0` on the diff container); scrollspy `enabled` flag from Task 2 now `!isFocusMode`; viewed-advance inside `toggleFileReviewed` (only when `isFocusMode` and the file was not previously viewed; scan forward from `activeFileIndex + 1` for the first path not in `viewedFiles` and not the just-viewed file); Esc handler via `useHotkeys('esc', …, { enabled: isFocusMode && !isSettingsOpen && !isCommentsListOpen && !isRevisionModalOpen && !isHelpOpen })` whose callback no-ops when `document.activeElement` is an input/textarea/contentEditable, else exits and calls `scrollFileIntoDiffContainer(focusedPath)`; wire `focusNav` to `DiffViewer` only in focus mode with `position = activeFileIndex + 1`, `total = diffData.files.length`, and clamped prev/next callbacks that also `ensureFileRendered` + reset scroll to top.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- App`
Expected: PASS.

- [ ] **Step 5: Write failing header focusNav tests**

Extend `DiffViewerHeader.test.tsx`: with `focusNav = { position: 3, total: 27, onPrev, onNext }` the header renders a `3 / 27` label and both chevron buttons; clicking them calls the callbacks; with `position: 1` prev is disabled; with `position: total` next is disabled; without `focusNav` nothing extra renders.

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm test -- DiffViewerHeader`
Expected: FAIL.

- [ ] **Step 7: Implement focusNav passthrough + header UI**

Add the optional prop to `DiffViewer` (forwarded to `DiffViewerHeader`) and render the nav in the header's right-side action cluster using ChevronLeft/ChevronRight (16px) and the label, matching existing button styling.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test -- DiffViewerHeader && pnpm test -- App`
Expected: PASS.

- [ ] **Step 9: Update HelpModal + full check, format, commit**

Add a shortcut row for `Esc` — "Exit focus mode" (note it also closes forms; focus-mode exit applies when no form/modal is open) and amend the `]`/`[` row description with "(focus mode: switch focused file)".
Run: `pnpm check && pnpm test && pnpm format`
Run: `git add -A && git commit -m "feat(client): add single-file focus mode with per-file navigation and viewed auto-advance"`

---

### Task 4: General comments — data model and plumbing

**Files:**
- Modify: `src/types/diff.ts` (`DiffCommentThread`, `CommentThread`)
- Modify: `src/client/hooks/useDiffComments.ts` (new `addGeneralThread`, null-safe normalize)
- Test: extend `src/client/hooks/useDiffComments.test.ts`
- Modify: `src/utils/commentImports.ts` (null-safe position handling in `clonePosition`, `cloneThread`, `positionsMatch`, `threadsMatch`, `mergeThread`)
- Test: `src/utils/commentImports.test.ts` (create if absent, else extend)
- Modify: `src/utils/commentFormatting.ts` (null-safe location formatting)
- Test: extend `src/utils/commentFormatting.test.ts`
- Modify: `src/client/hooks/useKeyboardNavigation.ts` (comment index skips general threads)
- Modify: `src/client/App.tsx` (null-safe thread mapping/grouping/navigation)
- Modify: `src/server/server.ts` (`normalizeThreadPayload`, `toCommentThread`)
- Test: extend `src/server/server.test.ts`

**Interfaces:**
- Consumes: existing thread lifecycle methods of `useDiffComments`; existing server comment session shape.
- Produces:
  - `DiffCommentThread.filePath: string | null` and `position?: DiffCommentPosition` — `filePath === null` (with no `position`, no `codeSnapshot`) identifies a general thread.
  - `CommentThread.file: string | null` and `line: LineNumber | null` (general → both null, `side` undefined, `isOutdated` false).
  - `useDiffComments` new method `addGeneralThread(body: string): DiffCommentThread` — creates a thread with `filePath: null`, no `position`, no `codeSnapshot`, one root message authored `'User'`, persisted through the existing `saveThreads` path.
  - Formatting contract: a thread with null file renders its location line as exactly `General comment` (no `file:Lx` segment) in both single-thread and all-comments prompts, and in server CLI output.
  - Merge contract: two general threads with different ids never merge; two with the same id merge by the existing message-merge rules; general threads never match file-position imports.
  - Server contract: `POST /api/comments` accepts and stores general threads; `GET /api/comments-json` returns them with `filePath: null` and no `position`; legacy threads are unaffected.

- [ ] **Step 1: Write failing type-level and hook tests**

Extend `useDiffComments.test.ts`: calling `addGeneralThread('ship it')` yields a thread with `filePath === null`, `position === undefined`, `codeSnapshot === undefined`, one message with body `'ship it'`; it round-trips through the storage service (reload hook state contains it); `generateAllCommentsPrompt` output contains the line `General comment`. Note: existing tests referencing `thread.position` on all threads must keep passing — only genuinely-general threads lack it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- useDiffComments`
Expected: FAIL — `addGeneralThread` is not a function.

- [ ] **Step 3: Update types and the hook**

Apply the type changes exactly as in Interfaces; make the internal `normalizeThread` map missing `filePath`/`position` to null/absent; add `addGeneralThread` and expose it on the return object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- useDiffComments`
Expected: PASS.

- [ ] **Step 5: Write failing merge tests**

In `src/utils/commentImports.test.ts` (create if absent): merging a stored general thread with an incoming general thread of a **different id** but identical body keeps both threads (length 2); identical ids merge messages; `mergeCommentThreads` with two general threads sharing id keeps one; a general thread never matches a file-based import. Also: `cloneThread` on a general thread preserves `position === undefined` and `filePath === null`.

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm test -- commentImports`
Expected: FAIL (crash on `positionsMatch(undefined, …)` or wrong counts).

- [ ] **Step 7: Implement null-safe merge logic**

Update `positionsMatch` to return `false` when either position is `undefined`; update `threadsMatch` so that when **both** threads lack a position, the position check is skipped entirely and matching relies on id + root-message comparison (this is what prevents distinct general threads from collapsing); make `clonePosition`/`cloneThread`/`mergeThread` pass `undefined` positions through untouched instead of destructuring.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test -- commentImports`
Expected: PASS.

- [ ] **Step 9: Write failing formatting tests, then implement**

Extend `commentFormatting.test.ts`: `formatCommentThreadPrompt` on a general thread (`file: null, line: null`) starts with the line `General comment`; replies still render; `formatAllCommentThreadsPrompt` mixes general and file threads in order. Then update `formatCommentLocation` (or its thread-level equivalent) so null file/line produce exactly `General comment`, keeping file threads byte-identical to current output. Run `pnpm test -- commentFormatting`; expect FAIL then PASS.

- [ ] **Step 10: Update keyboard navigation and App mapping**

In `useKeyboardNavigation`'s `commentIndex`, skip threads with null file. In `App.tsx`'s `normalizedThreads` mapping, map general threads to `file: null`, `line: null`, `isOutdated: false`; `threadsByFile` skips null-file threads; `handleNavigateToComment` returns early (no-op) for null-file threads in this task — Task 5 replaces the no-op with scrolling to the general card.

- [ ] **Step 11: Write failing server tests, then implement**

Extend `server.test.ts` (follow existing comment-endpoint test setup): `POST /api/comments` with a general thread (no `filePath`/`position`) then `GET /api/comments-json` returns it with `filePath: null` and no `position`; posting a legacy `CommentThread`-shaped payload with `file: null` normalizes to a general thread; file-based threads round-trip unchanged. Then update `normalizeThreadPayload` (treat absent/null `filePath` with absent `position` as general — no `'<unknown file>'` coercion for it; keep the coercion for malformed file threads that have a position but no file) and `toCommentThread` (null-safe `file`/`line`/`side`). Run `pnpm test -- server`; expect FAIL then PASS.

- [ ] **Step 12: Full check, format, commit**

Run: `pnpm check && pnpm test && pnpm format`
Run: `git add -A && git commit -m "feat: support general file-independent comment threads across client, formatting, and server"`

---

### Task 5: General comments UI

**Files:**
- Create: `src/client/components/GeneralCommentsCard.tsx`
- Test: `src/client/components/GeneralCommentsCard.test.tsx`
- Modify: `src/client/App.tsx` (top-bar button, card wiring, navigation)
- Test: extend `src/client/App.test.tsx`
- Modify: `src/client/components/CommentsListModal.tsx` (general-first ordering + labels)
- Test: extend `src/client/components/CommentsListModal.test.tsx`

**Interfaces:**
- Consumes: `addGeneralThread` and the thread lifecycle callbacks from Task 4; `CommentThreadCard`, `CommentForm` (props as they exist today).
- Produces:
  - `GeneralCommentsCard` props: `threads: CommentThread[]` (general only), `isFormOpen: boolean`, `onFormOpenChange: (open: boolean) => void`, `onAddComment: (body: string) => Promise<void>`, `showAuthorBadges?: boolean`, `syntaxTheme?: AppearanceSettings['syntaxTheme']`, and the standard lifecycle callbacks `onGenerateThreadPrompt: (thread: CommentThread) => string`, `onRemoveThread: (threadId: string) => void`, `onReplyToThread: (threadId: string, body: string) => Promise<void>`, `onRemoveMessage: (threadId: string, messageId: string) => void`, `onUpdateMessage: (threadId: string, messageId: string, newBody: string) => void`.
  - Rendering contract: root element has `id="general-comments"`; shows a "General comments" heading with thread count; lists `CommentThreadCard`s; when `isFormOpen` shows a `CommentForm` (title `General comment`, placeholder `Leave a general comment...`, submit label `Comment`, `embedded`) whose cancel closes it; renders nothing when there are no threads and the form is closed.
  - App behavior: a top-bar icon button (lucide `MessageSquarePlus`, `title="Add general comment"`) visible in both desktop and mobile headers; clicking sets `isFormOpen` true and scrolls the diff container to top; submitting calls `addGeneralThread(body)` and closes the form; the card mounts above the file list in both list and focus mode; `handleNavigateToComment` for null-file threads scrolls the `#general-comments` element into view instead of the Task 4 no-op.
  - `CommentsListModal`: threads sort with null-file threads first (stable within group by the existing secondary ordering), a `General` section label renders above them, their location label shows `General` instead of a file path, and clicking one invokes the existing `onNavigate` callback with the thread.

- [ ] **Step 1: Write failing GeneralCommentsCard tests**

Cover: renders heading and one card per general thread; hidden entirely when no threads and form closed; when `isFormOpen`, the form renders and submitting calls `onAddComment` with the trimmed body and `onFormOpenChange(false)`; cancel calls `onFormOpenChange(false)`; lifecycle callbacks are passed through to cards (assert one, e.g. remove).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- GeneralCommentsCard`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `GeneralCommentsCard`**

Per the rendering contract above, reusing `CommentThreadCard` exactly as `CommentsListModal` does today.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- GeneralCommentsCard`
Expected: PASS.

- [ ] **Step 5: Write failing App wiring tests**

Extend `App.test.tsx`: the top-bar button exists; clicking it opens the general form (card visible with form); submitting a general comment adds a thread shown in the card; the card is absent before any general comment exists. Mock the hook or storage per existing App test patterns.

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm test -- App`
Expected: FAIL.

- [ ] **Step 7: Implement App wiring**

Add `isGeneralFormOpen` state, the top-bar button (both header layouts), `handleAddGeneralComment`, mount `GeneralCommentsCard` above the files map with the general threads selected from `normalizedThreads` (null file), and update `handleNavigateToComment` to scroll `#general-comments` into view for null-file threads.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test -- App`
Expected: PASS.

- [ ] **Step 9: Write failing CommentsListModal tests, then implement**

Extend `CommentsListModal.test.tsx`: with mixed general + file threads, general ones render first under a `General` label, file grouping/order unchanged; a general row's location text is `General`; clicking a general row calls `onNavigate` with that thread. Then implement: null-first comparator (explicit check before `localeCompare`), `General` label, location display, unchanged navigation plumbing. Run `pnpm test -- CommentsListModal`; expect FAIL then PASS.

- [ ] **Step 10: Full check, format, commit**

Run: `pnpm check && pnpm test && pnpm format`
Run: `git add -A && git commit -m "feat(client): surface general comments via top-bar button, pinned card, and comments list"`

---

### Task 6: Final verification

**Files:** none new (verification only; fix fallout if any).

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a verified branch ready for PR.

- [ ] **Step 1: Run the full quality gate**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all three succeed. If anything fails, fix and commit the fix (`fix: ...`) — do not weaken assertions to pass.

- [ ] **Step 2: Confirm clean tree and push-ready state**

Run: `git status` (clean) and `git log --oneline main..HEAD` (5 feature commits + this task's fixes if any).

---

## Self-Review Notes

- Spec coverage: Feature 4 → Task 1; Feature 2 → Task 2; Feature 1 → Task 3; Feature 3 (model/plumbing + UI) → Tasks 4–5; implementation order matches the spec (4 → 2 → 1 → 3); final gate → Task 6.
- Known null-safety hazards verified in code and covered by tasks: `positionsMatch`/`clonePosition`/`cloneThread` in `commentImports.ts` (Task 4), `CommentsListModal` sort `localeCompare` on null (Task 5), `useKeyboardNavigation` comment index (Task 4), `isThreadOutdated` (safe via missing snapshot; guarded anyway in App mapping, Task 4).
- `scrollFileIntoDiffContainer` is deliberately NOT reused for in-focus-mode file switches because its readiness loop requires all preceding file sections to be mounted; focus mode switches reset `scrollTop` instead.
