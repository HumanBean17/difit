import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Test helper: a throwaway repo whose `feat` branch is a two-rung ladder on `main`.
export interface TestRepo {
  path: string;
  git: (...args: string[]) => string;
  write: (file: string, content: string) => void;
  commit: (message: string) => string;
  cleanup: () => void;
}

export function createLadderTestRepo(): TestRepo {
  const path = mkdtempSync(join(tmpdir(), 'difit-ladder-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: path,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        GIT_SEQUENCE_EDITOR: 'true',
        GIT_EDITOR: 'true',
      },
    }).trim();
  const write = (file: string, content: string) => writeFileSync(join(path, file), content);
  const commit = (message: string) => {
    git('add', '-A');
    git('commit', '-q', '--no-verify', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  git('init', '-q', '-b', 'main');
  git('config', 'commit.gpgsign', 'false');
  write('a.txt', 'alpha\nbeta\ngamma\n');
  commit('Initial');
  git('switch', '-q', '-c', 'feat');
  write('a.txt', 'alpha\nbeta changed\ngamma\n');
  commit('Change beta');
  write('b.txt', 'one\ntwo\nthree\n');
  commit('Add b file');

  return {
    path,
    git,
    write,
    commit,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}
