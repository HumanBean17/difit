# Review UX Improvements: Focus Mode, Tree Tracking, General Comments, Java-Friendly Headers

**Status:** in_progress

## Motivation

Daily review workflows — especially on large Java projects — surface four gaps:

1. The diff area renders every file as one long list; there is no way to isolate a single file for focused review.
2. The file tree's selected-file highlight is barely distinguishable from hover, only tracks the keyboard cursor (any mouse click clears it), and the tree never reveals the selected file by expanding folders or scrolling.
3. Every comment thread requires a file path and line position, so there is no way to leave a review-level remark that belongs to the change as a whole.
4. The diff header renders the full repository path as one truncating string; with deep Java package paths the ellipsis always hides the class name.

## Foundation: `activeFileIndex`

`App` gains a single `activeFileIndex` state — the file the reviewer is currently looking at. It is the one source of truth consumed by both focus mode and tree tracking.

Update sources, in priority order:

- Keyboard cursor movement (`useKeyboardNavigation` cursor's `fileIndex`).
- Explicit file-tree row clicks.
- Scroll position: the file whose header is nearest the top of the diff scroll container. Tracked via the file containers `useLazyDiffRendering` already registers (`registerLazyFileContainer` refs / `data-file-path` elements), using the same measurement pattern as `isFileScrolledPastContainerTop`, updated on scroll through `requestAnimationFrame`.

In focus mode the focused file is authoritative: scroll updates are suppressed while focus mode is active.

## Feature 1: Focus Mode (Single-File View)

### Behavior

- A Focus/List toggle in the top toolbar beside the Split/Unified switch. Entering focuses `activeFileIndex` (the first file if none is active).
- The diff area renders only the focused file; all `DiffViewer` props are unchanged.
- File-to-file navigation inside focus mode:
  - `]` / `[` keep their meaning and switch the focused file, preserving their existing wrap-around behavior (last↔first), consistent with list mode; the chevron buttons clamp instead.
  - Prev/next chevron buttons with a "3 / 27" position indicator in the focused file's header.
  - Clicking a file-tree row focuses that file.
- `Esc` exits focus mode and scrolls the list to the focused file.
- Line/chunk navigation (`j`/`k`, `n`/`p`) and commenting (`c`) work unchanged within the focused file; line navigation that would cross a file boundary moves the cursor into the adjacent file and focus follows it, while `]`/`[` hop files explicitly.
- Marking the focused file viewed (`v` or the Viewed button) auto-focuses the next unviewed file; if none remain, the current file stays focused and the existing completion animation fires.
- With an empty diff the toggle is a no-op.

### Structure

- `App` holds `isFocusMode` state. The `<main>` render list is the full file list in list mode, and exactly the focused file in focus mode.
- `useKeyboardNavigation` continues to receive all files. When its cursor lands on a different `fileIndex` than the focused one, App responds by switching focus — so line navigation naturally clamps to the focused file without changes inside the hook.
- Switching focus calls `ensureFileRendered` for the target file before navigation applies, so lazy-render placeholders never flash and keyboard scroll targets mount synchronously.
- Persistence mirrors `diffViewMode`: `localStorage['difit.focusMode']` plus the server-persisted client settings (`fetchClientSettings`/`saveClientSettings` hydration path).
- On mobile the tree remains the overlay drawer; focus mode changes nothing about that layout.

## Feature 2: Tree Tracks Review Position (Scrollspy)

### Behavior

- The file tree highlights the active file with a visually distinct treatment: a 2px accent-colored left border and bolder text, in addition to the existing background tint — clearly different from hover.
- When the active file changes, the tree:
  - expands the file's ancestor folders — expand-only, so manual collapses elsewhere are never undone;
  - scrolls the row into view with `scrollIntoView({ block: 'nearest' })`, skipped while the pointer is over the tree (the reviewer is browsing the tree themselves).

### Structure

- `FileList`'s existing `selectedFileIndex` prop is re-driven from `activeFileIndex` instead of the keyboard cursor only.
- Ancestor expansion is an effect inside `FileList` that unions the ancestor directory paths of the active file into `expandedDirs`; it never removes entries.
- Row reveal uses a ref to the tree's scroll container (`scrollContainerRef`) with nearest-block scrolling.

## Feature 3: General (File-Independent) Comments

### Data model

- `DiffCommentThread.filePath` becomes `string | null`; `position` becomes optional. `filePath: null` (with no position) identifies a general thread.
- Client `CommentThread` mirrors this: `file: string | null`, `line: LineNumber | null`, `side` optional when null.
- Server (`server.ts`) thread normalization accepts threads without `filePath`/`position` as general threads — the `'<unknown file>'` coercion no longer applies to them; `toCommentThread` maps them with null file/line. The CLI comments output prints general threads without a file/line prefix.
- Storage is unchanged: optional fields serialize into the existing v2 `DiffContextStorage` schema with no version bump. Server comment sync (`/api/comments`, `/api/comments-json`) carries general threads like any other.

### UI

- A "add general comment" icon button in the top bar, next to `CommentsDropdown`, always visible (the dropdown itself remains conditional on having threads).
- General threads render in a pinned "General comments" card at the top of the diff area — above the first file, visible in both list and focus mode — using the existing `CommentThreadCard` without code snapshot or line info. Reply, edit, delete, and copy-thread-prompt all reuse the existing thread lifecycle.
- The "copy all comments" prompt gains a general section without file/line context.
- `CommentsListModal` lists general threads first under a "General" heading (explicit null-first ordering in the existing sort).
- `threadsByFile` grouping, outdated detection (`isThreadOutdated`), and tree comment-count badges ignore null-file threads; navigating to a general thread from the list modal scrolls to the pinned card instead of a code line.

## Feature 4: Java-Friendly File Header

- `DiffViewerHeader` renders the path in two parts via a shared `splitFilePath(path)` helper (directory = everything up to the final `/`, basename = the rest):
  - directory: secondary/muted color, carries its own ellipsis so overflow eats the middle of the directory;
  - basename: primary color, emphasized, never truncated.
- The full path remains available through the existing hover tooltip and copy-path button; the "renamed from" note keeps its current secondary styling.
- The deferred-rendering placeholder in `App` may reuse the same helper for consistent display.

## Implementation Order

Each feature is an independent commit/PR:

1. Feature 4 (header path) — smallest, fully isolated.
2. Feature 2 (scrollspy + `activeFileIndex` foundation).
3. Feature 1 (focus mode) — builds on `activeFileIndex`.
4. Feature 3 (general comments) — independent, widest surface.

## Testing

- `DiffViewerHeader`: directory/basename split, truncation attribution, renamed-from display.
- `FileList`: distinct highlight treatment, expand-only ancestor reveal, nearest-block scrolling guard.
- App-level focus mode: toggle persistence, `]`/`[` switching, viewed-advance, `Esc` return, empty-diff no-op.
- `useDiffComments` + server comments endpoint: general threads round-trip, sync, and normalization.
- `commentFormatting`: general threads in single-thread and all-comments prompts, null-first ordering in the list modal.

## Out of Scope

- Any change to how diffs are computed or chunked.
- Multi-file selection or tabbed file views.
- Collapsible/inline discussion threading for general comments beyond the existing card lifecycle.
