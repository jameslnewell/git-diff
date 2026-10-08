import * as Diff from './diff.ts';
import {beforeEach, describe, expect, test, vi} from 'vitest';
import vm from 'node:vm';

/**
 * How git is invoked, and how its failures are classified, can't be reached
 * through the public surface: real git only ever throws an error from this
 * realm, and none of the commands run here can be made to prompt. So
 * `node:child_process` is replaced and the calls inspected directly.
 */

type Result = {stdout: string} | {error: unknown};

interface Call {
  cmd: string;
  args: string[];
  options: {env?: NodeJS.ProcessEnv; maxBuffer?: number};
}

// `vi.mock` is hoisted above everything else in this file, so the state its
// factory closes over has to be hoisted with it
const {calls, results, next} = vi.hoisted(() => {
  const calls: Call[] = [];
  const results: Result[] = [];

  function next(call: Call): string {
    calls.push(call);
    const result = results.shift() ?? {stdout: ''};
    if ('error' in result) throw result.error;
    return result.stdout;
  }

  return {calls, results, next};
});

vi.mock('node:child_process', async () => {
  // a static import isn't available yet: this factory runs before them
  const {promisify} = await import('node:util');

  function execFileSyncMock(
    cmd: string,
    args: string[],
    options: Call['options'],
  ): string {
    return next({cmd, args, options});
  }

  /**
   * Only ever reached through `promisify`, which honours this symbol on the
   * real `execFile` to resolve `{stdout, stderr}` rather than stdout alone. The
   * callback form is deliberately not implemented: `diff.ts` doesn't use it,
   * and a stand-in that dropped `stderr` would let the classification tests
   * below pass against a broken classifier.
   */
  function execFileMock(): never {
    throw new Error(
      'execFile was called with a callback, which diff.ts does not do',
    );
  }

  // async so that a scripted error rejects, as the real one would, rather than
  // throwing synchronously
  // eslint-disable-next-line @typescript-eslint/require-await
  async function execFileAsyncMock(
    cmd: string,
    args: string[],
    options: Call['options'],
  ): Promise<{stdout: string; stderr: string}> {
    return {stdout: next({cmd, args, options}), stderr: ''};
  }

  Reflect.set(execFileMock, promisify.custom, execFileAsyncMock);

  return {execFile: execFileMock, execFileSync: execFileSyncMock};
});

/**
 * An error from another realm, as produced by a bundler boundary, a
 * dual-package install or a test harness with its own module registry:
 * `instanceof Error` is false, but it is an error in every way that matters.
 */
function foreignError(stderr: string): unknown {
  const error: unknown = vm.runInNewContext("new Error('Command failed')");
  Reflect.set(Object(error), 'stderr', stderr);
  return error;
}

beforeEach(() => {
  calls.length = 0;
  results.length = 0;
});

describe('git invocation', () => {
  test('async: pins the locale and forbids prompting', async () => {
    results.push({stdout: ''});
    await Diff.diffAsync();
    expect(calls[0]?.options.env?.['LC_ALL']).toBe('C');
    expect(calls[0]?.options.env?.['GIT_TERMINAL_PROMPT']).toBe('0');
  });

  test('sync: pins the locale and forbids prompting', () => {
    results.push({stdout: ''});
    Diff.diffSync();
    expect(calls[0]?.options.env?.['LC_ALL']).toBe('C');
    expect(calls[0]?.options.env?.['GIT_TERMINAL_PROMPT']).toBe('0');
  });

  test('inherits the rest of the environment', () => {
    results.push({stdout: ''});
    Diff.diffSync();
    expect(calls[0]?.options.env?.['PATH']).toBe(process.env['PATH']);
  });

  test('raises maxBuffer above the default, which a full diff overruns', () => {
    results.push({stdout: ''}, {stdout: 'sha1\n'});
    Diff.diffSync();
    Diff.emptyTreeSync();
    for (const call of calls) {
      expect(call.options.maxBuffer ?? 0).toBeGreaterThan(1024 * 1024);
    }
  });
});

describe('error classification', () => {
  const stderr = "fatal: bad revision 'non-existent-ref'\n";
  const expected = {
    name: 'GitDiffError',
    code: 'BASE_DOES_NOT_EXIST',
    message: 'The ref does not exist: non-existent-ref',
    ref: 'non-existent-ref',
  };

  test('async: classifies a missing ref raised in another realm', async () => {
    results.push({error: foreignError(stderr)});
    await expect(Diff.diffAsync({base: 'non-existent-ref'})).rejects.toThrow(
      expect.objectContaining(expected),
    );
  });

  test('sync: classifies a missing ref raised in another realm', () => {
    results.push({error: foreignError(stderr)});
    expect(() => Diff.diffSync({base: 'non-existent-ref'})).toThrow(
      expect.objectContaining(expected),
    );
  });

  test('a ref matching neither argument is still a GitDiffError', () => {
    // Real git echoes the argument verbatim, so this shouldn't happen — the
    // branch exists so an unattributable ref failure doesn't escape as a raw
    // exec error. Only a mock can reach it.
    results.push({error: foreignError(stderr)});
    expect(() => Diff.diffSync({base: 'main', head: 'HEAD'})).toThrow(
      expect.objectContaining({
        name: 'GitDiffError',
        code: 'BAD_REVISION',
        ref: 'non-existent-ref',
      }),
    );
  });

  test('a base that is also the head is reported as the base', () => {
    results.push({error: foreignError(stderr)});
    expect(() =>
      Diff.diffSync({base: 'non-existent-ref', head: 'non-existent-ref'}),
    ).toThrow(expect.objectContaining({code: 'BASE_DOES_NOT_EXIST'}));
  });

  test('rethrows an error it cannot classify', () => {
    const error = new Error('spawn ENOENT');
    results.push({error});
    let thrown: unknown;
    try {
      Diff.diffSync();
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBe(error);
  });

  test('rejects an object format it has no id for', () => {
    results.push({stdout: 'sha512\n'});
    expect(() => Diff.emptyTreeSync()).toThrow(
      expect.objectContaining({
        name: 'GitDiffError',
        code: 'UNSUPPORTED_OBJECT_FORMAT',
        message: 'Unsupported object format: sha512',
      }),
    );
  });
});

describe('command arguments', () => {
  test('diff passes -- so a ref that shadows a path is unambiguous', () => {
    results.push({stdout: ''});
    Diff.diffSync({base: 'main', head: 'HEAD'});
    expect(calls[0]?.args).toEqual([
      '-c',
      'core.quotePath=false',
      'diff',
      '--name-status',
      'main',
      'HEAD',
      '--',
    ]);
  });

  test('the empty tree id is asked of the repository', () => {
    results.push({stdout: 'sha1\n'});
    Diff.emptyTreeSync();
    expect(calls[0]?.args).toEqual(['rev-parse', '--show-object-format']);
  });
});
