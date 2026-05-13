import {suite, test} from 'node:test';
import {rejects, throws} from 'node:assert/strict';
import {equal} from 'node:assert';
import * as Diff from './diff.ts';

suite(Diff.diffAsync.name, () => {
  test('throws for bad revision', async () => {
    await rejects(
      () =>
        Diff.diffAsync({
          cwd: import.meta.dirname,
          base: 'non-existent-ref',
          head: 'HEAD',
        }),
      {
        name: 'GitDiffError',
        code: 'BAD_REVISION',
        message: 'The ref does not exist: non-existent-ref',
      },
    );
  });

  test('since initial commit', async () => {
    const diff = await Diff.diffAsync({
      cwd: import.meta.dirname,
      base: 'e740b69fbf63d6e76af21efa4c356483ebf5b2f4',
      head: 'HEAD',
    });

    const paths = Diff.paths(diff);
    equal(paths.includes('README.md'), true);
    equal(paths.includes('package.json'), true);
    equal(paths.includes('src/diff.ts'), true);
  });
});

suite(Diff.diffSync.name, () => {
  test('throws for bad revision', () => {
    throws(
      () =>
        Diff.diffSync({
          cwd: import.meta.dirname,
          base: 'non-existent-ref',
          head: 'HEAD',
        }),
      {
        name: 'GitDiffError',
        code: 'BAD_REVISION',
        message: 'The ref does not exist: non-existent-ref',
      },
    );
  });

  test('since initial commit', () => {
    const diff = Diff.diffSync({
      cwd: import.meta.dirname,
      base: 'e740b69fbf63d6e76af21efa4c356483ebf5b2f4',
      head: 'HEAD',
    });

    const paths = Diff.paths(diff);
    equal(paths.includes('README.md'), true);
    equal(paths.includes('package.json'), true);
    equal(paths.includes('src/diff.ts'), true);
  });
});

suite(Diff.firstCommitAsync.name, () => {
  test('returns the first commit', async () => {
    const commit = await Diff.firstCommitAsync();
    equal(commit, 'e740b69fbf63d6e76af21efa4c356483ebf5b2f4');
  });
});

suite(Diff.firstCommitSync.name, () => {
  test('returns the first commit', () => {
    const commit = Diff.firstCommitSync();
    equal(commit, 'e740b69fbf63d6e76af21efa4c356483ebf5b2f4');
  });
});
