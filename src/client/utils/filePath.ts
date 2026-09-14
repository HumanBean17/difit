export interface SplitFilePath {
  directory: string;
  basename: string;
}

/**
 * Splits a file path into its directory and basename segments.
 *
 * The split happens at the last `/`: `directory` is everything before it
 * (empty when the path contains no `/`), and `basename` is the final
 * segment (empty for a trailing slash).
 */
export function splitFilePath(path: string): SplitFilePath {
  const lastSlashIndex = path.lastIndexOf('/');
  if (lastSlashIndex === -1) {
    return { directory: '', basename: path };
  }

  return {
    directory: path.slice(0, lastSlashIndex),
    basename: path.slice(lastSlashIndex + 1),
  };
}
