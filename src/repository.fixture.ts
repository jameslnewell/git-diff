import {execFileSync} from 'node:child_process';
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

/**
 * Git's own config must not reach these repositories. A developer's global
 * config can turn on gpg signing (every commit then fails), install hooks, set
 * `diff.renames=copies`, or pick a different `init.defaultObjectFormat` — any
 * of which would make the tests pass or fail for reasons that have nothing to
 * do with the code under test. Pointing both config paths at a file that
 * doesn't exist is the portable way to say "no config"; `/dev/null` isn't.
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

export interface CommitOptions {
  files: Record<string, string>;
  message?: string | undefined;
}

export interface RemoveOptions {
  files: string[];
  message?: string | undefined;
}

export interface CommitUnrelatedHistoryOptions {
  files: Record<string, string>;
  branch: string;
}

export interface Repository {
  /** The repository's working directory, to pass as `cwd`. */
  cwd: string;
  /** Run a git command in the repository and return its stdout, trimmed. */
  git(...args: string[]): string;
  /** Write the given files and commit them. */
  commit(options: CommitOptions): void;
  /** Delete the given files and commit the deletion. */
  remove(options: RemoveOptions): void;
  /**
   * Commit onto a new orphan branch and merge it back into `main`, giving the
   * repository an additional root commit — the shape a repository consolidated
   * from several `filter-repo`'d histories has.
   */
  commitUnrelatedHistory(options: CommitUnrelatedHistoryOptions): void;
  /** The paths of every file at `HEAD`. */
  pathsAtHead(): string[];
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

  const destroy = (): void => rmSync(cwd, {recursive: true, force: true});

  const commit = ({files, message = 'commit'}: CommitOptions): void => {
    for (const [path, content] of Object.entries(files)) {
      writeFileSync(join(cwd, path), content);
    }
    git('add', '--all');
    git('commit', '--quiet', '--message', message);
  };

  try {
    git(
      'init',
      '--quiet',
      '--initial-branch=main',
      ...(objectFormat ? [`--object-format=${objectFormat}`] : []),
    );
  } catch (error) {
    // the caller has no handle to clean up with yet
    destroy();
    throw error;
  }

  return {
    cwd,
    git,
    commit,
    destroy,
    remove({files, message = 'remove'}) {
      git('rm', '--quiet', ...files);
      git('commit', '--quiet', '--message', message);
    },
    commitUnrelatedHistory({files, branch}) {
      git('checkout', '--quiet', '--orphan', branch);
      git('rm', '--quiet', '-rf', '.');
      commit({files, message: `${branch} root`});
      git('checkout', '--quiet', 'main');
      git(
        'merge',
        '--quiet',
        '--allow-unrelated-histories',
        '--no-edit',
        branch,
      );
    },
    pathsAtHead() {
      // `--name-only` octal-quotes non-ASCII paths exactly as `git diff` does,
      // so without this the oracle would share the defect it is checking for
      const stdout = git(
        '-c',
        'core.quotePath=false',
        'ls-tree',
        '-r',
        '--name-only',
        'HEAD',
      );
      return stdout ? stdout.split('\n') : [];
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
