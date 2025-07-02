import {promisify} from 'node:util'
import {execFile, execFileSync} from 'node:child_process'
import glob from 'picomatch'
import debug from 'debug'

const execAsyncLog = debug('git-diff:execAsync')
const execSyncLog = debug('git-diff:execSync')

const execFileAsync = promisify(execFile);

const errorName = 'GitDiffError';
const badRevisionErrorCode = 'BAD_REVISION';

export type Path = string
export type Status = 'A' | 'C' | 'D' | 'M' | 'R' | 'X'
export const Status = {
  Added: 'A' as const,
  Changed: 'C' as const,
  Deleted: 'D' as const,
  Modified: 'M' as const,
  Renamed: 'R' as const,
  Unknown: 'X' as const,
}

interface Match {
  readonly added: boolean;
  readonly changed: boolean;
  readonly deleted: boolean;
  readonly modified: boolean;
  readonly renamed: boolean;
  readonly unknown: boolean;
}

/**
 * Cast a value to an array if its not already an array
 */
export function toArray<T>(value: T | T[] | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

async function execAsync(cmd: string, args: string[], options: {encoding: 'utf8', cwd?: string | undefined}): Promise<{stdout: string}> {
  execAsyncLog('exec: %s %s %o', cmd, args.join(' '), options);
  try {
    const result = await execFileAsync(cmd, args, options);
    execAsyncLog('exec result: %s', result);
    return result
  } catch (error) {
    execAsyncLog('exec error: %s', error);
    throw error
  }
}

function execSync(cmd: string, args: string[], options: {encoding: 'utf8', cwd?: string | undefined}): string {
  execSyncLog('exec: %s %s %o', cmd, args.join(' '), options);
  return execFileSync(cmd, args, options).toString();
}

/**
 * A git diff result
 */
export class Diff implements Iterable<[Path, Status]> {
  #diff: Map<Path, Status>;

  /**
   * Constructs a diff
   */
  constructor(diff: Map<Path, Status> | Iterable<readonly [Path, Status]> = new Map()) {
    this.#diff = diff instanceof Map ? diff : new Map(diff);
  }

  [Symbol.iterator](): IterableIterator<[Path, Status]> {
    return this.#diff[Symbol.iterator]();
  }

  /**
   * Get the number of files in the diff
   */
  size(): number {
    return this.#diff.size;
  }

  /**
   * Get the status and path for each entry in the diff
   */
  entries(): MapIterator<[Path, Status]> {
    return this.#diff.entries()
  }

  /**
   * Get the paths in the diff
   */
  paths(): MapIterator<Path> {
    return this.#diff.keys();
  }

  /**
   * Get the statuses in the diff
   */
  statuses(): MapIterator<Status> {
    return this.#diff.values();
  }

  /**
   * Match the path(s)
   */
  match(pathOrPaths: Path | Path[]): Match {
    const diff = this.#diff;
    const matcher = glob(toArray(pathOrPaths))
    return {
      get added() {
        return diff.entries().some(([path, status]) => {
          return status === Status.Added && matcher(path)
        })
      },
      get changed() {
        return diff.entries().some(([path, status]) => {
          return status === Status.Changed && matcher(path)
        })
      },
      get deleted() {
        return diff.entries().some(([path, status]) => {
          return status === Status.Deleted && matcher(path)
        })
      },
      get modified() {
        return diff.entries().some(([path, status]) => {
          return status === Status.Modified && matcher(path)
        })
      },
      get renamed() {
        return diff.entries().some(([path, status]) => {
          return status === Status.Renamed && matcher(path)
        })
      },
      get unknown() {
        return diff.entries().some(([path, status]) => {
          return status === Status.Unknown && matcher(path)
        })
      },
    }
  }

}


/**
 * Chceks whether the error has a `stderr` property
 */
function isErrorWithStderr(error: unknown): error is {stderr: string} {
  return error instanceof Error && !!(error as any).stderr
}

/**
 * Throws a git diff error
 */
function throwGitDiffError(error: unknown): void {
  if (isErrorWithStderr(error)) {
    const match = /fatal: bad revision '(.*)'/.exec(error.stderr)
    if (match) {
      const error = new Error(`The ref does not exist: ${match[1]}`);
      (error as any).name = errorName;
      (error as any).code = badRevisionErrorCode;
      throw error
    }
  }
}

/** Parse the stdout of `git diff` and populate a Diff class  */
function parse(stdout: string): Diff {
  const map: Map<Path, Status> = new Map();

  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const match = line.match(/^([^\W]*)\W+(.*)$/);
    if (match) {
      const status = match[1]?.trim();
      const path = match[2]?.trim();
      if (status && path) {
        map.set(path, status as Status);
        continue
      }
    }
    throw new Error(`Invalid line in diff output: ${line}`);
  }

  return new Diff(map);
}


export interface DiffOptions {
  cwd?: string | undefined;
  base?: string | undefined;
  head?: string | undefined;
}

/**
 * Executes `git diff` to get the diff status of files
 */
export async function diffAsync(options: DiffOptions = {}): Promise<Diff> {
  try {
    const {stdout} = await execAsync(...diffArgs(options))
    return parse(stdout);
  } catch (error) {
    throwGitDiffError(error);
    throw error;
  }
}

/**
 * Executes `git diff` to get the diff status of files
 */
export function diffSync(options: DiffOptions = {}): Diff {
  try {
    const stdout = execSync(...diffArgs(options));
    return parse(stdout);
  } catch (error) {
    throwGitDiffError(error);
    throw error;
  }
}

/** Convert options into arguments */
function diffArgs(options: DiffOptions): [string, string[], {encoding: 'utf8', cwd?: string | undefined}] {
  return [
    'git',
    [
      'diff',
      '--name-status',
      ...(options.base ? [options.base] : []),
      ...(options.head ? [options.head] : []),
      '--', // this is required to avoid amniguous revision errors
      // ...(options.paths || []),
    ],
    {encoding: 'utf8', cwd: options.cwd}
  ]
}

interface FirstCommitOptions {
  cwd?: string | undefined;
  ref?: string | undefined;
}

function firstCommitArgs(options: FirstCommitOptions): [string, string[], {encoding: 'utf8', cwd?: string | undefined}] {
  return [
    'git',
    ['rev-list', '--max-parents=0',options.ref || 'HEAD'],
    {encoding: 'utf8', cwd: options.cwd}
  ]
}

/**
 * Get then SHA of the first commit in the repository
 */
export async function firstCommitAsync(options: FirstCommitOptions = {}): Promise<string> {
  const {stdout} = await execAsync(...firstCommitArgs(options));
  return stdout.trim();
}


/**
 * Get then SHA of the first commit in the repository
 */
export function firstCommitSync(options: FirstCommitOptions = {}): string {
  const stdout = execSync(...firstCommitArgs(options));
  return stdout.trim();
}
