import { execFile, spawn } from 'child_process';
import { resolve } from 'path';
import { promisify } from 'util';

import type { LadderRung } from '../types/ladder.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;
const FIELD = '\x1f';
const RECORD = '\x1e';

/** The git queries behind a review-ladder session. */
export class LadderGit {
  constructor(private readonly repoPath: string) {}

  private async git(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: this.repoPath,
      maxBuffer: MAX_BUFFER,
    });
    return stdout;
  }

  async gitDir(): Promise<string> {
    return resolve(this.repoPath, (await this.git(['rev-parse', '--git-dir'])).trim());
  }

  /** The branch the ladder follows: `commitish` when it names a branch, else the checked-out one. */
  async resolveBranch(commitish?: string): Promise<string> {
    if (commitish && commitish !== 'HEAD') {
      try {
        await this.git(['show-ref', '--verify', '--quiet', `refs/heads/${commitish}`]);
        return commitish;
      } catch {
        throw new Error(`--ladder follows a local branch; "${commitish}" is not one`);
      }
    }

    try {
      return (await this.git(['symbolic-ref', '--short', 'HEAD'])).trim();
    } catch {
      throw new Error('--ladder needs a checked-out branch (HEAD is detached)');
    }
  }

  async mergeBase(base: string, branch: string): Promise<string> {
    return (await this.git(['merge-base', base, `refs/heads/${branch}`])).trim();
  }

  async branchTip(branch: string): Promise<string> {
    return (await this.git(['rev-parse', `refs/heads/${branch}`])).trim();
  }

  async listRungs(baseSha: string, branch: string): Promise<LadderRung[]> {
    const output = await this.git([
      'log',
      '--reverse',
      '--first-parent',
      `--format=%H${FIELD}%P${FIELD}%s${FIELD}%b${RECORD}`,
      `${baseSha}..refs/heads/${branch}`,
    ]);

    return output
      .split(RECORD)
      .map((record) => record.replace(/^\n/, ''))
      .filter((record) => record.trim().length > 0)
      .map((record, position) => {
        const [sha = '', parents = '', subject = '', body = ''] = record.split(FIELD);
        return {
          index: position + 1,
          sha,
          shortSha: sha.slice(0, 7),
          parentSha: parents.split(' ')[0] ?? baseSha,
          subject,
          body: body.trim(),
        };
      });
  }

  /** `git patch-id --stable` of a commit's own diff; null for an empty commit. */
  async patchId(sha: string): Promise<string | null> {
    const diff = await this.git(['show', '--format=', '--no-color', '--no-ext-diff', sha]);
    if (diff.trim() === '') {
      return null;
    }

    const output = await new Promise<string>((resolvePromise, reject) => {
      const child = spawn('git', ['patch-id', '--stable'], { cwd: this.repoPath });
      let stdout = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.once('error', reject);
      child.once('close', (code) => {
        if (code === 0) resolvePromise(stdout);
        else reject(new Error(`git patch-id exited with code ${code ?? 'unknown'}`));
      });
      child.stdin.end(diff);
    });

    return output.trim().split(/\s+/)[0] || null;
  }

  /** The commit in base..tip that introduced line `line` of `filePath` at tip; null if it predates base. */
  async blameAddedLine(
    baseSha: string,
    tipSha: string,
    filePath: string,
    line: number,
  ): Promise<string | null> {
    try {
      const output = await this.git([
        'blame',
        '--porcelain',
        '-L',
        `${line},${line}`,
        `${baseSha}..${tipSha}`,
        '--',
        filePath,
      ]);
      const sha = output.split(/\s/)[0] ?? '';
      return /\nboundary\n/.test(output) || sha === '' ? null : sha;
    } catch {
      return null;
    }
  }

  /** The last commit in base..tip where line `line` of `filePath` at base still existed. */
  async blameRemovedLine(
    baseSha: string,
    tipSha: string,
    filePath: string,
    line: number,
  ): Promise<string | null> {
    try {
      const output = await this.git([
        'blame',
        '--reverse',
        '--porcelain',
        '-L',
        `${line},${line}`,
        `${baseSha}..${tipSha}`,
        '--',
        filePath,
      ]);
      return output.split(/\s/)[0] || null;
    } catch {
      return null;
    }
  }
}
