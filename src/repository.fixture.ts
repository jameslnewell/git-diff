import {execFileSync} from 'node:child_process';
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

/**
 * Git's own config must not reach these repositories. A developer's global
 * config can turn on gpg signing (every commit then fails), install hooks, or
 * set `diff.renames=copies` — any of which would make the tests pass or fail
 * for reasons that have nothing to do with the code under test. Pointing both
 * config paths at a file that doesn't exist is the portable way to say "no
 * config"; `/dev/null` isn't, and git rejects an unreadable path outright.
 */
const noUserConfig = join(tmpdir(), 'git-diff-tests-no-such-config');

const identity = {
  GIT_CONFIG_GLOBAL: noUserConfig,
  GIT_CONFIG_SYSTEM: noUserConfig,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
};

export interface Repository {
  /** The repository's working directory, to pass as `cwd`. */
  cwd: string;
  /** Run a git command in the repository and return its stdout, trimmed. */
  git(...args: string[]): string;
  /** Write the given files and commit them. */
  commit(files: Record<string, string>, message?: string): void;
  /** Delete the given files and commit the deletion. */
  remove(files: string[], message?: string): void;
  /**
   * Commit onto a new orphan branch and merge it back into `main`, giving the
   * repository an additional root commit — the shape a repository consolidated
   * from several `filter-repo`'d histories has.
   */
  commitUnrelatedHistory(files: Record<string, string>, branch: string): void;
  /** Delete the repository. */
  destroy(): void;
}

export interface CreateRepositoryOptions {
  /** Defaults to whatever `git init` defaults to, normally `sha1`. */
  objectFormat?: 'sha1' | 'sha256' | undefined;
}

export function createRepository({
  objectFormat,
}: CreateRepositoryOptions = {}): Repository {
  // macOS' `os.tmpdir()` is `/var/...`, a symlink to `/private/var/...`, and
  // git reports the resolved path — so an unresolved `cwd` makes any comparison
  // against git's own output fail
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'git-diff-')));

  const git = (...args: string[]): string =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: {...process.env, ...identity},
      // git's stderr would otherwise land in the test output; on failure it is
      // still readable on the thrown error
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

  git(
    'init',
    '--quiet',
    '--initial-branch=main',
    ...(objectFormat ? [`--object-format=${objectFormat}`] : []),
  );

  const write = (files: Record<string, string>): void => {
    for (const [path, content] of Object.entries(files)) {
      writeFileSync(join(cwd, path), content);
    }
  };

  const commit: Repository['commit'] = (files, message = 'commit') => {
    write(files);
    git('add', '--all');
    git('commit', '--quiet', '--message', message);
  };

  return {
    cwd,
    git,
    commit,
    remove(files, message = 'remove') {
      git('rm', '--quiet', ...files);
      git('commit', '--quiet', '--message', message);
    },
    commitUnrelatedHistory(files, branch) {
      git('checkout', '--quiet', '--orphan', branch);
      git('rm', '--quiet', '-rf', '.');
      commit(files, `${branch} root`);
      git('checkout', '--quiet', 'main');
      git(
        'merge',
        '--quiet',
        '--allow-unrelated-histories',
        '--no-edit',
        branch,
      );
    },
    destroy() {
      rmSync(cwd, {recursive: true, force: true});
    },
  };
}

/** Whether the installed git can create SHA-256 repositories. */
export function supportsSha256(): boolean {
  let repository: Repository | undefined;
  try {
    repository = createRepository({objectFormat: 'sha256'});
    return repository.git('rev-parse', '--show-object-format') === 'sha256';
  } catch {
    return false;
  } finally {
    repository?.destroy();
  }
}
