import {promisify} from 'node:util';
import {execFile, execFileSync} from 'node:child_process';
import glob from 'picomatch';
import debug from 'debug';

const execAsyncLog = debug('git-diff:execAsync');
const execSyncLog = debug('git-diff:execSync');

const execFileAsync = promisify(execFile);

const baseDoesNotExistErrorCode = 'BASE_DOES_NOT_EXIST';
const headDoesNotExistErrorCode = 'HEAD_DOES_NOT_EXIST';
const badRevisionErrorCode = 'BAD_REVISION';
const noMergeBaseErrorCode = 'NO_MERGE_BASE';

export type Path = string;
/**
 * How a path differs between the two points being compared.
 *
 * **These describe two snapshots, not a range of commits.** `diffAsync` runs
 * `git diff <base> <head>`, which compares the trees those refs point at — it
 * does not replay what happened in between. So a status says how `head` differs
 * from `base`, never what some commit did.
 *
 * That reads naturally while `base` is an ancestor of `head`, where the two
 * coincide. It stops being intuitive the moment it isn't: against a `base` that
 * has moved on since `head` forked, a file the *base* added is reported as
 * {@link Status.Deleted}, because it is genuinely absent from `head`.
 *
 * Both readings are useful and neither is a bug. Pick deliberately:
 *
 * - *"how does `head` differ from what's over there?"* — diff against the ref
 *   directly. Right when you are about to make one match the other.
 * - *"what did this branch change?"* — diff from {@link mergeBaseAsync}, the
 *   point the two forked at, which is an ancestor of `head` by construction and
 *   so has no reversed statuses.
 *
 * Path membership is unaffected either way, so {@link any} and the
 * {@link filterByPaths} family are safe under both.
 */
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
  /** The ref the error is about, when it is about one. */
  readonly ref: string | undefined;
  constructor(
    code: string,
    message: string,
    options?: {cause?: unknown; ref?: string | undefined},
  ) {
    super(message, options);
    this.code = code;
    this.ref = options?.ref;
  }
}

/**
 * The `stderr` of a failed `execFile`, however that error reached us.
 *
 * Deliberately not guarded on `error instanceof Error`. The error is
 * constructed by whichever realm `node:child_process` was loaded in, and
 * `instanceof` is false across realms — a bundler boundary, a dual-package
 * install, a test harness with its own module registry. Guarding on it there
 * would mean no `GitDiffError` was ever produced and
 * {@link isBaseDoesNotExistError} silently never fired, which is exactly the
 * case it exists to duck-type around. `String()` likewise covers `stderr` arriving as a `Buffer` without
 * reaching for another `instanceof`.
 */
function stderrOf(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  return String((error as {stderr?: unknown}).stderr ?? '');
}

/**
 * The exit status of a failed `git`, however that error reached us.
 *
 * The two exec flavours disagree on the property: promisified `execFile`
 * rejects with `code`, while `execFileSync` throws with `status`. Reading only
 * one of them would make a check pass on `diffAsync` and silently never fire on
 * `diffSync`. Not guarded on `instanceof Error`, for the reason given on
 * {@link stderrOf}.
 *
 * `undefined` means git never ran to completion — a spawn failure carries an
 * `ENOENT`-style code and no numeric status at all, since nothing here goes
 * through a shell. Anything reading this to mean "exited cleanly" would be
 * wrong.
 */
function exitStatusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const {code, status} = error as {code?: unknown; status?: unknown};
  if (typeof code === 'number') return code;
  if (typeof status === 'number') return status;
  return undefined;
}

/**
 * The ref git refused to resolve, if that is what went wrong.
 *
 * Four wordings: git reports a full-length object id it doesn't have
 * differently from everything else — the shape a `base` carried over from an
 * earlier build takes in a shallow checkout — and `merge-base` differs again
 * from `diff`, with a further variant for a ref that resolves to something
 * other than a commit. All four echo the argument **verbatim**, which is what
 * makes attributing it below sound.
 *
 * Some failures name no ref at all (`main@{upstream}` on a branch with no
 * upstream, say). Those stay unclassified and the original error is rethrown.
 */
function rejectedRef(stderr: string): string | undefined {
  return (
    /fatal: bad revision '(.*)'/.exec(stderr)?.[1] ??
    /fatal: bad object (\S+)/.exec(stderr)?.[1] ??
    // `merge-base` does not quote the argument and it may contain spaces, so
    // these run to end of line rather than stopping at the first one
    /fatal: Not a valid object name (.+)$/m.exec(stderr)?.[1] ??
    /fatal: Not a valid commit name (.+)$/m.exec(stderr)?.[1]
  );
}

/**
 * Classifies a failed git invocation.
 *
 * git names the ref it rejected but not which argument that was, and the caller
 * cannot tell from the message alone — so it is matched against the options the
 * command was built from here, where they are known. Leaving that to consumers
 * means every one of them re-deriving it by string-matching an error message,
 * which is the sort of thing that quietly stops working.
 *
 * `base` is checked first, so a ref diffed against itself reports the base —
 * and so does a call where *both* refs are missing, since git only ever names
 * the first one it rejected.
 */
function handleErrors(error: unknown, options: DiffOptions = {}): never {
  const ref = rejectedRef(stderrOf(error));
  if (ref !== undefined) {
    const code =
      ref === options.base
        ? baseDoesNotExistErrorCode
        : ref === options.head
          ? headDoesNotExistErrorCode
          : // git echoes the argument verbatim, so a ref matching neither
            // shouldn't arise. Kept so that an unattributable ref failure is
            // still a `GitDiffError` rather than a raw exec error.
            badRevisionErrorCode;
    throw new GitDiffError(code, `The ref does not exist: ${ref}`, {
      cause: error,
      ref,
    });
  }
  throw error;
}

interface RefDoesNotExistError<Code extends string> {
  name: 'GitDiffError';
  code: Code;
  message: string;
  /** The ref that does not exist. */
  ref: string;
}

/**
 * Duck-types the error's shape (`name` + `code`) rather than using
 * `instanceof`, which breaks across dual-package installs, multiple installed
 * versions, bundler boundaries and module realms.
 */
function isGitDiffError(error: unknown, codes: readonly string[]): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as {name?: unknown}).name === 'GitDiffError' &&
    typeof (error as {message?: unknown}).message === 'string' &&
    codes.includes((error as {code?: unknown}).code as string)
  );
}

function hasRef(error: unknown): boolean {
  return typeof (error as {ref?: unknown}).ref === 'string';
}

/**
 * Whether `diffAsync` / `diffSync` failed because the `base` ref does not
 * exist — the cue to diff from {@link emptyTreeAsync} instead, on the first
 * CI run before a mutable tag has been pushed.
 *
 * git names only the first ref it rejected, so this does not imply `head` is
 * fine; the retry against the empty tree will say so if it isn't.
 *
 * @example
 * ```ts
 * try {
 *   diff = await diffAsync({base, head});
 * } catch (error) {
 *   if (!isBaseDoesNotExistError(error)) throw error;
 *   diff = await diffAsync({base: await emptyTreeAsync(), head});
 * }
 * ```
 */
export function isBaseDoesNotExistError(
  error: unknown,
): error is RefDoesNotExistError<'BASE_DOES_NOT_EXIST'> {
  return isGitDiffError(error, [baseDoesNotExistErrorCode]) && hasRef(error);
}

/**
 * Whether `diffAsync` / `diffSync` failed because the `head` ref does not
 * exist. Almost always a mistake worth surfacing rather than working around —
 * it is here so that it can be told apart from a missing `base`, which is not.
 */
export function isHeadDoesNotExistError(
  error: unknown,
): error is RefDoesNotExistError<'HEAD_DOES_NOT_EXIST'> {
  return isGitDiffError(error, [headDoesNotExistErrorCode]) && hasRef(error);
}

/**
 * Whether a call failed because one of the refs it was given does not resolve,
 * whichever ref that was.
 *
 * The narrower {@link isBaseDoesNotExistError} says the failing ref was the
 * `base`, which is the one worth recovering from for a diff. `mergeBaseAsync`
 * has no base and no head — just refs — so its ref failures cannot be attributed
 * that way, and this is the guard to catch them with. The common cause in CI is
 * an `origin/<branch>` that was never fetched.
 *
 * `ref` names the ref git rejected.
 */
export function isRefDoesNotExistError(error: unknown): error is {
  name: 'GitDiffError';
  code: 'BASE_DOES_NOT_EXIST' | 'HEAD_DOES_NOT_EXIST' | 'BAD_REVISION';
  message: string;
  ref: string;
} {
  return (
    isGitDiffError(error, [
      baseDoesNotExistErrorCode,
      headDoesNotExistErrorCode,
      badRevisionErrorCode,
    ]) && hasRef(error)
  );
}

/**
 * Whether {@link mergeBaseAsync} / {@link mergeBaseSync} failed because the
 * refs share no ancestor at all — two histories grafted into one repository, or
 * a clone shallow enough that the common ancestor was never fetched.
 *
 * This is an outcome to handle rather than a mistake: it is what "I cannot tell
 * what this branch changed" looks like, and the usual answer is to diff from
 * {@link emptyTreeAsync} instead and treat every file as changed.
 *
 * It is an error rather than an `undefined` return **on purpose**. A missing
 * merge base and a broken git are both failures of the same call, and an API
 * that flattened them into one value would invite `?? fallback` at the call
 * site — silently converting "git is not installed" or "this object store is
 * corrupt" into a full rebuild, forever, with nothing in the log to say so.
 * Making the benign case the one you have to name keeps the other one loud.
 *
 * @example
 * ```ts
 * let base: string;
 * try {
 *   base = await mergeBaseAsync({refs: ['origin/main', 'HEAD']});
 * } catch (error) {
 *   if (!isNoMergeBaseError(error)) throw error;
 *   base = await emptyTreeAsync();
 * }
 * const diff = await diffAsync({base, head: 'HEAD'});
 * ```
 */
export function isNoMergeBaseError(error: unknown): error is {
  name: 'GitDiffError';
  code: 'NO_MERGE_BASE';
  message: string;
} {
  return isGitDiffError(error, [noMergeBaseErrorCode]);
}

/**
 * @deprecated Use {@link isBaseDoesNotExistError}, which says *which* ref was
 * missing. This is true for a missing `base` or `head` alike, so a caller using
 * it to decide on a fallback base would take that branch for a typo'd `head`
 * too — logging and diffing something other than what actually failed.
 */
export function isBadRevisionError(error: unknown): error is {
  name: 'GitDiffError';
  code: 'BASE_DOES_NOT_EXIST' | 'HEAD_DOES_NOT_EXIST' | 'BAD_REVISION';
  message: string;
} {
  // Deliberately not requiring `ref`: an error raised by an older copy of this
  // library — the cross-version case the duck-typing exists for — predates it,
  // and this guard is the one such callers are still using.
  return isGitDiffError(error, [
    baseDoesNotExistErrorCode,
    headDoesNotExistErrorCode,
    badRevisionErrorCode,
  ]);
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
  /**
   * What to compare against. This is a **snapshot**, not the start of a range:
   * where it isn't an ancestor of `head`, statuses read in reverse — see
   * {@link Status}, and {@link mergeBaseAsync} for the other reading.
   */
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
    handleErrors(error, options);
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
    handleErrors(error, options);
  }
}

/** Convert options into arguments */
function diffArgs(
  options: DiffOptions,
): [string, string[], {encoding: 'utf8'; cwd?: string | undefined}] {
  return [
    'git',
    [
      // non-ASCII paths are octal-quoted by default, which no glob would then
      // match. This does not cover a path containing a tab, newline, quote or
      // backslash — git quotes those regardless, and unquoting them properly
      // means parsing `-z` output
      '-c',
      'core.quotePath=false',
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

  // `git rev-parse` echoes back an option it doesn't recognise and exits 0, so
  // this is what git older than 2.29 — which predates `--show-object-format` —
  // returns, and it needs to say so rather than name a format nobody asked for
  if (format.startsWith('--')) {
    throw new GitDiffError(
      'UNSUPPORTED_OBJECT_FORMAT',
      'Reading the object format requires git 2.29 or newer',
    );
  }

  const id = emptyTreeIds[format];
  if (id === undefined) {
    throw new GitDiffError(
      'UNSUPPORTED_OBJECT_FORMAT',
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
 * format that repository uses — so pass the same `cwd` you pass to the diff, or
 * the base can come back in the wrong format and be rejected as a bad revision.
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
 * format that repository uses — so pass the same `cwd` you pass to the diff, or
 * the base can come back in the wrong format and be rejected as a bad revision.
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

export interface MergeBaseOptions {
  cwd?: string | undefined;
  /**
   * The two refs to find the common ancestor of, in either order.
   *
   * Exactly two, deliberately. Plain `git merge-base` privileges its first
   * argument for three or more — `merge-base a b c` and `merge-base c b a`
   * return different commits, and the first can be a descendant of the true
   * common ancestor rather than an ancestor of all three. Answering that
   * properly needs `--octopus`, which nothing has asked for; with two refs the
   * result is genuinely symmetric.
   */
  refs: [string, string];
}

/** Convert options into arguments */
function mergeBaseArgs(
  options: MergeBaseOptions,
): [string, string[], {encoding: 'utf8'; cwd?: string | undefined}] {
  return [
    'git',
    [
      'merge-base',
      // `--fork-point` is deliberately not offered: it consults the reflog,
      // which a fresh CI checkout does not have, so it would answer differently
      // on a developer's machine and on a build agent without either being
      // wrong. `--` keeps a ref that begins with a dash from turning into that
      // option — or into `--all`, whose multi-line output would be handed on as
      // if it were one commit.
      '--',
      ...options.refs,
    ],
    {encoding: 'utf8', cwd: options.cwd},
  ];
}

/**
 * Classifies a failed `git merge-base`.
 *
 * git separates its two failures by exit status: **1** means the refs share no
 * ancestor, while a ref it could not resolve exits **128** and names it on
 * stderr. Reading the status is the whole of the distinction — a spawn failure
 * carries no numeric status at all, so it cannot be mistaken for either.
 *
 * stderr is checked for a rejected ref rather than for being empty. git exits 1
 * with an *empty stdout* for "no merge base", but it may still have written a
 * warning — `warning: refname 'x' is ambiguous` when a tag and a branch share a
 * name, which is ordinary enough in CI — and requiring silence there would send
 * that case down the unclassified path, defeating the fallback this exists for.
 */
function handleMergeBaseErrors(
  error: unknown,
  options: MergeBaseOptions,
): never {
  if (exitStatusOf(error) === 1 && rejectedRef(stderrOf(error)) === undefined) {
    throw new GitDiffError(
      noMergeBaseErrorCode,
      `The refs share no common ancestor: ${options.refs.join(', ')}`,
      {cause: error},
    );
  }
  handleErrors(error);
}

/**
 * Get the commit two refs forked at — the base to diff from when you want *what
 * this branch changed* rather than *how these two trees differ*. See the note on
 * {@link Status} for which of those you want.
 *
 * Throws {@link isNoMergeBaseError} when the refs share no ancestor, and a ref
 * error when one of them doesn't resolve — see {@link isRefDoesNotExistError}.
 *
 * @example
 * ```ts
 * const base = await mergeBaseAsync({refs: ['origin/main', 'HEAD']});
 * const diff = await diffAsync({base, head: 'HEAD'});
 * ```
 */
export async function mergeBaseAsync(
  options: MergeBaseOptions,
): Promise<string> {
  try {
    const {stdout} = await execAsync(...mergeBaseArgs(options));
    return stdout.trim();
  } catch (error) {
    handleMergeBaseErrors(error, options);
  }
}

/**
 * Get the commit two refs forked at — the base to diff from when you want *what
 * this branch changed* rather than *how these two trees differ*. See the note on
 * {@link Status} for which of those you want.
 *
 * Throws {@link isNoMergeBaseError} when the refs share no ancestor, and a ref
 * error when one of them doesn't resolve — see {@link isRefDoesNotExistError}.
 *
 * @example
 * ```ts
 * const base = mergeBaseSync({refs: ['origin/main', 'HEAD']});
 * const diff = diffSync({base, head: 'HEAD'});
 * ```
 */
export function mergeBaseSync(options: MergeBaseOptions): string {
  try {
    const stdout = execSync(...mergeBaseArgs(options));
    return stdout.trim();
  } catch (error) {
    handleMergeBaseErrors(error, options);
  }
}

interface FirstCommitOptions {
  cwd?: string | undefined;
  /** @deprecated Ignored — the empty tree doesn't depend on a ref. */
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
