import {beforeEach, suite, test} from 'node:test';
import {deepEqual, equal, ok, rejects, throws} from 'node:assert';
import {mock} from 'node:test';
import {promisify} from 'node:util';
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

const calls: Call[] = [];
let results: Result[] = [];

function next(call: Call): string {
  calls.push(call);
  const result = results.shift() ?? {stdout: ''};
  if ('error' in result) throw result.error;
  return result.stdout;
}

function execFileSyncMock(
  cmd: string,
  args: string[],
  options: Call['options'],
): string {
  return next({cmd, args, options});
}

/**
 * Only ever reached through `promisify`, which honours this symbol on the real
 * `execFile` to resolve `{stdout, stderr}` rather than stdout alone. The
 * callback form is deliberately not implemented: `diff.ts` doesn't use it, and
 * a stand-in that dropped `stderr` would let the classification tests below
 * pass against a broken classifier.
 */
function execFileMock(): never {
  throw new Error(
    'execFile was called with a callback, which diff.ts does not do',
  );
}

Reflect.set(
  execFileMock,
  promisify.custom,
  async (
    cmd: string,
    args: string[],
    options: Call['options'],
  ): Promise<{stdout: string; stderr: string}> => ({
    stdout: next({cmd, args, options}),
    stderr: '',
  }),
);

mock.module('node:child_process', {
  namedExports: {execFile: execFileMock, execFileSync: execFileSyncMock},
});

const Diff = await import('./diff.ts');

/**
 * An error from another realm, as produced by a bundler boundary, a
 * dual-package install or a test harness with its own module registry:
 * `instanceof Error` is false, but it is an error in every way that matters.
 */
function foreignError(stderr: string): unknown {
  const error = vm.runInNewContext("new Error('Command failed')");
  Reflect.set(Object(error), 'stderr', stderr);
  return error;
}

beforeEach(() => {
  calls.length = 0;
  results = [];
});

suite('git invocation', () => {
  test('async: pins the locale and forbids prompting', async () => {
    results = [{stdout: ''}];
    await Diff.diffAsync();
    equal(calls[0]?.options.env?.['LC_ALL'], 'C');
    equal(calls[0]?.options.env?.['GIT_TERMINAL_PROMPT'], '0');
  });

  test('sync: pins the locale and forbids prompting', () => {
    results = [{stdout: ''}];
    Diff.diffSync();
    equal(calls[0]?.options.env?.['LC_ALL'], 'C');
    equal(calls[0]?.options.env?.['GIT_TERMINAL_PROMPT'], '0');
  });

  test('inherits the rest of the environment', () => {
    results = [{stdout: ''}];
    Diff.diffSync();
    equal(calls[0]?.options.env?.['PATH'], process.env['PATH']);
  });

  test('raises maxBuffer above the default, which a full diff overruns', () => {
    results = [{stdout: ''}, {stdout: 'sha1\n'}];
    Diff.diffSync();
    Diff.emptyTreeSync();
    for (const call of calls) ok((call.options.maxBuffer ?? 0) > 1024 * 1024);
  });
});

suite('error classification', () => {
  const stderr = "fatal: bad revision 'non-existent-ref'\n";
  const expected = {
    name: 'GitDiffError',
    code: 'BASE_DOES_NOT_EXIST',
    message: 'The ref does not exist: non-existent-ref',
    ref: 'non-existent-ref',
  };

  test('async: classifies a missing ref raised in another realm', async () => {
    results = [{error: foreignError(stderr)}];
    await rejects(() => Diff.diffAsync({base: 'non-existent-ref'}), expected);
  });

  test('sync: classifies a missing ref raised in another realm', () => {
    results = [{error: foreignError(stderr)}];
    throws(() => Diff.diffSync({base: 'non-existent-ref'}), expected);
  });

  test('a ref that is neither base nor head stays unattributed', () => {
    // git names a ref the caller did not pass — e.g. one that appeared inside a
    // revision expression. Nothing can be concluded about which argument was
    // at fault, so neither guard should claim it.
    results = [{error: foreignError(stderr)}];
    throws(() => Diff.diffSync({base: 'main', head: 'HEAD'}), {
      name: 'GitDiffError',
      code: 'BAD_REVISION',
      ref: 'non-existent-ref',
    });
  });

  test('a base that is also the head is reported as the base', () => {
    results = [{error: foreignError(stderr)}];
    throws(
      () => Diff.diffSync({base: 'non-existent-ref', head: 'non-existent-ref'}),
      {code: 'BASE_DOES_NOT_EXIST'},
    );
  });

  test('rethrows an error it cannot classify', () => {
    const error = new Error('spawn ENOENT');
    results = [{error}];
    throws(
      () => Diff.diffSync(),
      (thrown: unknown) => thrown === error,
    );
  });

  test('rejects an object format it has no id for', () => {
    results = [{stdout: 'sha512\n'}];
    throws(() => Diff.emptyTreeSync(), {
      name: 'GitDiffError',
      code: 'UNSUPPORTED_OBJECT_FORMAT',
      message: 'Unsupported object format: sha512',
    });
  });
});

suite('command arguments', () => {
  test('diff passes -- so a ref that shadows a path is unambiguous', () => {
    results = [{stdout: ''}];
    Diff.diffSync({base: 'main', head: 'HEAD'});
    deepEqual(calls[0]?.args, [
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
    results = [{stdout: 'sha1\n'}];
    Diff.emptyTreeSync();
    deepEqual(calls[0]?.args, ['rev-parse', '--show-object-format']);
  });
});
