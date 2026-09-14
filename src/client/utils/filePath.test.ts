import { describe, expect, it } from 'vitest';

import { splitFilePath } from './filePath';

describe('splitFilePath', () => {
  it('splits a deep path at the last slash', () => {
    expect(splitFilePath('src/main/java/A.java')).toEqual({
      directory: 'src/main/java',
      basename: 'A.java',
    });
  });

  it('splits after the final slash of a multi-segment path', () => {
    expect(splitFilePath('packages/core/src/lib/result.ts')).toEqual({
      directory: 'packages/core/src/lib',
      basename: 'result.ts',
    });
  });

  it('returns an empty directory when the path has no slash', () => {
    expect(splitFilePath('A.java')).toEqual({
      directory: '',
      basename: 'A.java',
    });
  });

  it('returns empty directory and empty basename for the empty string', () => {
    expect(splitFilePath('')).toEqual({
      directory: '',
      basename: '',
    });
  });

  it('returns an empty basename for a trailing slash', () => {
    expect(splitFilePath('a/b/')).toEqual({
      directory: 'a/b',
      basename: '',
    });
  });
});
