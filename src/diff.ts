import {promisify} from 'node:util';
import {execFile, execFileSync} from 'node:child_process';
import glob from 'picomatch';
import debug from 'debug';

const execAsyncLog = debug('git-diff:execAsync');
const execSyncLog = debug('git-diff:execSync');

const execFileAsync = promisify(execFile);

const badRevisionErrorCode = 'BAD_REVISION';

export type Path = string;
export type Status = 'A' | 'C' | 'D' | 'M' | 'R' | 'X';
export const Status = {
  Added: 'A' as const,
  Changed: 'C' as const,
  Deleted: 'D' as const,
  Modified: 'M' as const,
  Renamed: 'R' as const,
  Unknown: 'X' as const,
};

export type Diff = Record<Path, Status>;

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function empty(diff: Diff): boolean {
  for (const _ in diff) return false;
  return true;
}

export function filterByPaths(diff: Diff, paths: Path[]): Diff {
  const matcher = glob(paths);
  const out: Diff = {};
  for (const [p, status] of Object.entries(diff)) {
    if (matcher(p)) out[p] = status;
  }
  return out;
}

export function filterByStatuses(diff: Diff, statuses: Status[]): Diff {
  const allowed = new Set<Status>(statuses);
  const out: Diff = {};
  for (const [p, status] of Object.entries(diff)) {
    if (allowed.has(status)) out[p] = status;
  }
  return out;
}

export function paths(diff: Diff): Path[] {
  return Object.keys(diff);
}

export function statuses(diff: Diff): Status[] {
  return Object.values(diff) as Status[];
}

function containsPathsWithStatus(
  diff: Diff,
  status: Status,
  paths?: Path | Path[],
): boolean {
  const matcher = paths !== undefined ? glob(toArray(paths)) : null;
  for (const [p, s] of Object.entries(diff)) {
    if (s !== status) continue;
    if (matcher && !matcher(p)) continue;
    return true;
  }
  return false;
}

export function any(diff: Diff, paths?: Path | Path[]): boolean {
  if (paths === undefined) return !empty(diff);
  const matcher = glob(toArray(paths));
  for (const p in diff) {
    if (matcher(p)) return true;
  }
  return false;
}

export function added(diff: Diff, paths?: Path | Path[]): boolean {
  return containsPathsWithStatus(diff, Status.Added, paths);
}

export function changed(diff: Diff, paths?: Path | Path[]): boolean {
  return containsPathsWithStatus(diff, Status.Changed, paths);
}

export function deleted(diff: Diff, paths?: Path | Path[]): boolean {
  return containsPathsWithStatus(diff, Status.Deleted, paths);
}

export function modified(diff: Diff, paths?: Path | Path[]): boolean {
  return containsPathsWithStatus(diff, Status.Modified, paths);
}

export function renamed(diff: Diff, paths?: Path | Path[]): boolean {
  return containsPathsWithStatus(diff, Status.Renamed, paths);
}

export function unknown(diff: Diff, paths?: Path | Path[]): boolean {
  return containsPathsWithStatus(diff, Status.Unknown, paths);
}

async function execAsync(
  cmd: string,
  args: string[],
  options: {encoding: 'utf8'; cwd?: string | undefined},
): Promise<{stdout: string}> {
  execAsyncLog('exec: %s %s %o', cmd, args.join(' '), options);
  try {
    const result = await execFileAsync(cmd, args, options);
    execAsyncLog('exec result: %s', result);
    return result;
  } catch (error) {
    execAsyncLog('exec error: %s', error);
    throw error;
  }
}

function execSync(
  cmd: string,
  args: string[],
  options: {encoding: 'utf8'; cwd?: string | undefined},
): string {
  execSyncLog('exec: %s %s %o', cmd, args.join(' '), options);
  return execFileSync(cmd, args, options).toString();
}

class GitDiffError extends Error {
  override readonly name = 'GitDiffError';
  readonly code: string;
  constructor(code: string, message: string, options?: {cause?: unknown}) {
    super(message, options);
    this.code = code;
  }
}

function isErrorWithStderr(error: unknown): error is {stderr: string} {
  return error instanceof Error && !!(error as {stderr?: string}).stderr;
}

function handleErrors(error: unknown): never {
  if (isErrorWithStderr(error)) {
    const match = /fatal: bad revision '(.*)'/.exec(error.stderr);
    if (match) {
      throw new GitDiffError(
        badRevisionErrorCode,
        `The ref does not exist: ${match[1]}`,
        {cause: error},
      );
    }
  }
  throw error;
}

/**
 * Type guard for the "bad revision" error thrown by `diffAsync` / `diffSync`
 * when a `base`/`head` ref does not exist. Duck-types the error's shape
 * (`name` + `code`) rather than using `instanceof`, which breaks across
 * dual-package installs, multiple installed versions, bundler boundaries and
 * module realms.
 */
export function isBadRevisionError(
  error: unknown,
): error is {name: 'GitDiffError'; code: 'BAD_REVISION'; message: string} {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as {name?: unknown}).name === 'GitDiffError' &&
    (error as {code?: unknown}).code === badRevisionErrorCode &&
    typeof (error as {message?: unknown}).message === 'string'
  );
}

/** Parse the stdout of `git diff` into a Diff record */
function parse(stdout: string): Diff {
  const diff: Diff = {};

  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const match = line.match(/^([^\W]*)\W+(.*)$/);
    if (match) {
      const status = match[1]?.trim();
      const path = match[2]?.trim();
      if (status && path) {
        diff[path] = status as Status;
        continue;
      }
    }
    throw new Error(`Invalid line in diff output: ${line}`);
  }

  return diff;
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
    const {stdout} = await execAsync(...diffArgs(options));
    return parse(stdout);
  } catch (error) {
    handleErrors(error);
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
    handleErrors(error);
  }
}

/** Convert options into arguments */
function diffArgs(
  options: DiffOptions,
): [string, string[], {encoding: 'utf8'; cwd?: string | undefined}] {
  return [
    'git',
    [
      'diff',
      '--name-status',
      ...(options.base ? [options.base] : []),
      ...(options.head ? [options.head] : []),
      '--', // this is required to avoid ambiguous revision errors
    ],
    {encoding: 'utf8', cwd: options.cwd},
  ];
}

interface FirstCommitOptions {
  cwd?: string | undefined;
  ref?: string | undefined;
}

function firstCommitArgs(
  options: FirstCommitOptions,
): [string, string[], {encoding: 'utf8'; cwd?: string | undefined}] {
  return [
    'git',
    ['rev-list', '--max-parents=0', options.ref || 'HEAD'],
    {encoding: 'utf8', cwd: options.cwd},
  ];
}

/**
 * Get the SHA of the first commit in the repository
 */
export async function firstCommitAsync(
  options: FirstCommitOptions = {},
): Promise<string> {
  const {stdout} = await execAsync(...firstCommitArgs(options));
  return stdout.trim();
}

/**
 * Get the SHA of the first commit in the repository
 */
export function firstCommitSync(options: FirstCommitOptions = {}): string {
  const stdout = execSync(...firstCommitArgs(options));
  return stdout.trim();
}
