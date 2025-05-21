import {promisify} from 'node:util'
import {execFile, execFileSync} from 'node:child_process'
import glob from 'picomatch'
import debug from 'debug'

const log = debug('git-diff')
const execFileAsync = promisify(execFile);

export type DiffPath = string
export type DiffStatus = 'A' | 'C' | 'D' | 'M' | 'R' | 'T' | 'U' | 'X' | 'B';

export interface DiffFilterOptions {paths?: DiffPath[] | undefined, statuses?: DiffStatus[] | undefined}
export interface DiffContainsOptions {paths?: DiffPath[] | undefined, statuses?: DiffStatus[] | undefined}

/**
 * A mapp of diff statuses
 */
export class Diff {
  #diff: Map<DiffPath, DiffStatus>;

  constructor(diff: Map<DiffPath, DiffStatus> | Iterable<readonly [DiffPath, DiffStatus]> = new Map()) {
    this.#diff = diff instanceof Map ? diff : new Map(diff);
  }

  size(): number {
    return this.#diff.size;
  }

  [Symbol.iterator](): IterableIterator<[DiffPath, DiffStatus]> {
    return this.#diff[Symbol.iterator]();
  }

  paths(): MapIterator<DiffPath> {
    return this.#diff.keys();
  }

  statuses(): MapIterator<DiffStatus> {
    return this.#diff.values();
  }

  entries(): MapIterator<[DiffPath, DiffStatus]> {
    return this.#diff.entries()
  }

  filter({paths, statuses}: DiffFilterOptions): Diff {
    const matcher = glob(paths ?? [])
    return new Diff(
      this.entries().filter(([path, status]) => {
        if (paths) {
          if (!matcher(path)) {
            return false;
          }
        }
        if (statuses) {
          if (!statuses.includes(status)) {
            return false;
          }
        }
        return true
      })
    );
  }

  added(paths: DiffPath[]): Diff {
    return this.filter({
      paths,
      statuses: ['A']
    });
  }

  changed(paths: DiffPath[]): Diff {
    return this.filter({
      paths,
      statuses: ['C']
    });
  }

  deleted(paths: DiffPath[]): Diff {
    return this.filter({
      paths,
      statuses: ['D']
    });
  }

  modified(paths: DiffPath[]): Diff {
    return this.filter({
      paths,
      statuses: ['M']
    });
  }

  renamed(paths: DiffPath[]): Diff {
    return this.filter({
      paths,
      statuses: ['R']
    });
  }

  unknown(paths: DiffPath[]): Diff {
    return this.filter({
      paths,
      statuses: ['X']
    });
  }

  /**
   * Check whether the diff contains *any* the given paths
   */
  contains({paths, statuses}: DiffContainsOptions): boolean {
    return this.filter({
      paths,
      statuses
    }).size() > 0
  }

  isAdded(pathsOrPaths: DiffPath | DiffPath[]): boolean {
    return this.contains({
      paths: toArray(pathsOrPaths),
      statuses: ['A']
    })
  }

  isChanged(pathsOrPaths: DiffPath | DiffPath[]): boolean {
    return this.contains({
      paths: toArray(pathsOrPaths),
      statuses: ['C']
    })
  }

  isDeleted(pathsOrPaths: DiffPath | DiffPath[]): boolean {
    return this.contains({
      paths: toArray(pathsOrPaths),
      statuses: ['D']
    })
  }

  isModified(pathsOrPaths: DiffPath | DiffPath[]): boolean {
    return this.contains({
      paths: toArray(pathsOrPaths),
      statuses: ['M']
    })
  }

  isRenamed(pathsOrPaths: DiffPath | DiffPath[]): boolean {
    return this.contains({
      paths: toArray(pathsOrPaths),
      statuses: ['R']})
  }

  isUnknown(pathsOrPaths: DiffPath | DiffPath[]): boolean {
    return this.contains({
      paths: toArray(pathsOrPaths),
      statuses: ['X']
    })
  }
}

export interface DiffOptions {
  cwd?: string | undefined;
  paths?: string[] | undefined;
  base?: string | undefined;
  head?: string | undefined;
}

/**
 * Executes `git diff` to get the diff status of files
 */
export async function diffAsync(options: DiffOptions = {}): Promise<Diff> {
  // TODO: use first commit if base ref doesn't exist
  const args = execFileArgs(options)
  log('diffAsync', ...args);
  const {stdout} = await execFileAsync(...args)
  return parse(stdout);
}

/**
 * Executes `git diff` to get the diff status of files
 */
export function diffSync(options: DiffOptions = {}): Diff {
  // TODO: use first commit if base ref doesn't exist
  const args = execFileArgs(options)
  log('diffSync', ...args);
  const stdout = execFileSync(...args);
  return parse(stdout);
}

/** Wrap value in an array if its not already an array */
function toArray<T>(value: T | T[] | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

/** Convert options into arguments */
function execFileArgs(options: DiffOptions): [string, string[], {encoding: 'utf8', cwd?: string | undefined}] {
  return [
    'git',
    [
      'diff',
      '--name-status',
      ...(options.base ? [options.base] : []),
      ...(options.head ? [options.head] : []),
      '--',
      ...(options.paths || []),
    ],
    {encoding: 'utf8', cwd: options.cwd}
  ]
}

/** Parse the stdout of `git diff` and populate a Diff class  */
function parse(stdout: string): Diff {
  const map: Map<DiffPath, DiffStatus> = new Map();

  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const match = line.match(/^([^\W]*)\W+(.*)$/);
    if (match) {
      const status = match[1]?.trim();
      const path = match[2]?.trim();
      if (status && path) {
        map.set(path, status as DiffStatus);
        continue
      }
    }
    throw new Error(`Invalid line in diff output: ${line}`);
  }

  return new Diff(map);
}

async function refExistsAsync(ref: string): Promise<boolean> {
  try {
    await execFile('git', ['rev-parse', '--verify', ref]);
    return true;
  } catch (error) {
    return false;
  }
}
