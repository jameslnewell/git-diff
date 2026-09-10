import {promisify} from 'node:util';
import {execFile, execFileSync} from 'node:child_process';
import glob from 'picomatch';
import debug from 'debug';

const execAsyncLog = debug('git-diff:execAsync');
const execSyncLog = debug('git-diff:execSync');

const execFileAsync = promisify(execFile);

const badRevisionErrorCode = 'BAD_REVISION';
const unsupportedObjectFormatErrorCode = 'UNSUPPORTED_OBJECT_FORMAT';

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

/**
 * The environment git is invoked with.
 *
 * `LC_ALL=C` is the one that matters: `handleErrors` recognises a missing ref
 * by the English wording of `fatal: bad revision`, and git ships translations,
 * so on a localised machine the error would escape unclassified. `C` also stops
 * gettext honouring `LANGUAGE`, which otherwise outranks the locale variables.
 *
 * `GIT_TERMINAL_PROMPT=0` is inert for the read-only commands run here, and is
 * set so it stays that way — anything that reached the network could otherwise
 * block on a credential prompt in a CI job with nobody at the terminal.
 */
function env(): NodeJS.ProcessEnv {
  return {...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0'};
}

/**
 * `execFile` buffers stdout and kills the child when it overflows. The default
 * 1 MiB is around 26,000 `--name-status` lines, and a diff from the empty tree
 * lists every file in the repository — so the very feature that needs the most
 * room is the one that would hit the ceiling.
 */
const maxBuffer = 64 * 1024 * 1024;

async function execAsync(
  cmd: string,
  args: string[],
  options: {encoding: 'utf8'; cwd?: string | undefined},
): Promise<{stdout: string}> {
  // `env` is deliberately left out of the log — it carries the caller's whole
  // environment, secrets included
  execAsyncLog('exec: %s %s %o', cmd, args.join(' '), options);
  try {
    const result = await execFileAsync(cmd, args, {
      ...options,
      env: env(),
      maxBuffer,
    });
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
  return execFileSync(cmd, args, {
    ...options,
    env: env(),
    maxBuffer,
  }).toString();
}

class GitDiffError extends Error {
  override readonly name = 'GitDiffError';
  readonly code: string;
  constructor(code: string, message: string, options?: {cause?: unknown}) {
    super(message, options);
    this.code = code;
  }
}

/**
 * The `stderr` of a failed `execFile`, however that error reached us.
 *
 * Deliberately not guarded on `error instanceof Error`. The error is
 * constructed by whichever realm `node:child_process` was loaded in, and
 * `instanceof` is false across realms — a bundler boundary, a dual-package
 * install, a test harness with its own module registry. Guarding on it there
 * would mean no `GitDiffError` was ever produced and {@link isBadRevisionError}
 * silently never fired, which is exactly the case it exists to duck-type
 * around. `String()` likewise covers `stderr` arriving as a `Buffer` without
 * reaching for another `instanceof`.
 */
function stderrOf(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  return String((error as {stderr?: unknown}).stderr ?? '');
}

function handleErrors(error: unknown): never {
  const match = /fatal: bad revision '(.*)'/.exec(stderrOf(error));
  if (match) {
    throw new GitDiffError(
      badRevisionErrorCode,
      `The ref does not exist: ${match[1]}`,
      {cause: error},
    );
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

/**
 * Parse the stdout of `git diff --name-status` into a Diff record.
 *
 * Lines are tab-separated. Most changes are `<status>\t<path>`, but renames
 * (`R`) and copies (`C`) are `<status>\t<old>\t<new>` and carry a similarity
 * score on the status (e.g. `R100`). The entry is keyed on the path the file
 * ends up at — the last field — and the status is reduced to its leading
 * letter so the score doesn't leak into the `Status` value.
 */
export function parse(stdout: string): Diff {
  const diff: Diff = {};

  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const fields = line.split('\t');
    const code = fields[0]?.trim();
    const path = fields[fields.length - 1]?.trim();
    if (code && path && fields.length >= 2) {
      diff[path] = code[0] as Status;
      continue;
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

/**
 * The id of git's empty tree, by object format.
 *
 * The empty tree is the object `tree 0\0` — a header and no entries — so its
 * id is that string hashed with the repository's algorithm, and is identical in
 * every repository using that algorithm. Verify with
 * `printf 'tree 0\0' | shasum -a 256`.
 */
const emptyTreeIds: Record<string, string> = {
  sha1: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
  sha256: '6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321',
};

export interface EmptyTreeOptions {
  cwd?: string | undefined;
}

/** Convert options into arguments */
function emptyTreeArgs(
  options: EmptyTreeOptions,
): [string, string[], {encoding: 'utf8'; cwd?: string | undefined}] {
  return [
    'git',
    ['rev-parse', '--show-object-format'],
    {encoding: 'utf8', cwd: options.cwd},
  ];
}

function parseEmptyTree(stdout: string): string {
  const format = stdout.trim();
  const id = emptyTreeIds[format];
  if (id === undefined) {
    throw new GitDiffError(
      unsupportedObjectFormatErrorCode,
      `Unsupported object format: ${format}`,
    );
  }
  return id;
}

/**
 * Get the id of git's empty tree — the base to diff from when every file in
 * `head` should be reported as added, which is what you want when the ref you
 * meant to diff from doesn't exist yet.
 *
 * `cwd` must be inside a git repository, since the id depends on which object
 * format that repository uses.
 *
 * @example
 * ```ts
 * const diff = await diffAsync({base: await emptyTreeAsync(), head: 'HEAD'});
 * ```
 */
export async function emptyTreeAsync(
  options: EmptyTreeOptions = {},
): Promise<string> {
  try {
    const {stdout} = await execAsync(...emptyTreeArgs(options));
    return parseEmptyTree(stdout);
  } catch (error) {
    handleErrors(error);
  }
}

/**
 * Get the id of git's empty tree — the base to diff from when every file in
 * `head` should be reported as added, which is what you want when the ref you
 * meant to diff from doesn't exist yet.
 *
 * `cwd` must be inside a git repository, since the id depends on which object
 * format that repository uses.
 *
 * @example
 * ```ts
 * const diff = diffSync({base: emptyTreeSync(), head: 'HEAD'});
 * ```
 */
export function emptyTreeSync(options: EmptyTreeOptions = {}): string {
  try {
    const stdout = execSync(...emptyTreeArgs(options));
    return parseEmptyTree(stdout);
  } catch (error) {
    handleErrors(error);
  }
}

interface FirstCommitOptions {
  cwd?: string | undefined;
  ref?: string | undefined;
}

/**
 * @deprecated Use {@link emptyTreeAsync}, which returns what this was always
 * meant to give you — a base that reports every file as added. It returned the
 * repository's root commit(s) instead, which is neither (a root commit
 * contains files, and a repository can have several). `ref` is ignored: the
 * empty tree doesn't depend on one.
 */
export async function firstCommitAsync(
  options: FirstCommitOptions = {},
): Promise<string> {
  return await emptyTreeAsync({cwd: options.cwd});
}

/**
 * @deprecated Use {@link emptyTreeSync}, which returns what this was always
 * meant to give you — a base that reports every file as added. It returned the
 * repository's root commit(s) instead, which is neither (a root commit
 * contains files, and a repository can have several). `ref` is ignored: the
 * empty tree doesn't depend on one.
 */
export function firstCommitSync(options: FirstCommitOptions = {}): string {
  return emptyTreeSync({cwd: options.cwd});
}
