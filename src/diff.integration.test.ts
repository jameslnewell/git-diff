/* eslint-disable @typescript-eslint/no-deprecated -- deprecated exports are still public API, so they're still tested */
import * as Diff from './diff.ts';
import {
  type CreateRepositoryOptions,
  type Repository,
  createRepository,
  supportsSha256,
} from './repository.fixture.ts';
import {describe, expect, onTestFinished, test} from 'vitest';

/**
 * A repository containing each of the shapes a base has to get right:
 *
 * - `kept.txt` is added in the first commit and never touched again, so it is
 *   absent from a diff taken against that root — a file that exists, reported
 *   as unchanged.
 * - `modified.txt` is added in the first commit and changed later.
 * - `removed.txt` is added and then deleted, so a diff against the root reports
 *   a `D` for a file that isn't there at all.
 * - `café.txt` is non-ASCII, which git octal-quotes unless told otherwise.
 *
 * Only a diff against the empty tree gets all of them right. Destroyed when the
 * test ends, however it ends.
 */
function useRepository(options?: CreateRepositoryOptions): Repository {
  const repository = createRepository(options);
  onTestFinished(() => {
    repository.destroy();
  });
  repository.commit({
    files: {
      'kept.txt': 'kept',
      'modified.txt': 'before',
      'removed.txt': 'removed',
      'café.txt': 'café',
    },
  });
  repository.commit({files: {'modified.txt': 'after', 'added.txt': 'added'}});
  repository.remove({files: ['removed.txt']});
  return repository;
}

describe('diffAsync', () => {
  test('throws when the base does not exist', async () => {
    const repository = useRepository();
    await expect(
      Diff.diffAsync({
        cwd: repository.cwd,
        base: 'non-existent-ref',
        head: 'HEAD',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'GitDiffError',
        code: 'BASE_DOES_NOT_EXIST',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      }),
    );
  });

  test('throws when the head does not exist', async () => {
    const repository = useRepository();
    await expect(
      Diff.diffAsync({
        cwd: repository.cwd,
        base: 'main',
        head: 'non-existent-ref',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'GitDiffError',
        code: 'HEAD_DOES_NOT_EXIST',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      }),
    );
  });

  test('reports what changed between two refs', async () => {
    const repository = useRepository();
    expect(
      await Diff.diffAsync({
        cwd: repository.cwd,
        base: 'HEAD~2',
        head: 'HEAD',
      }),
    ).toEqual({
      'added.txt': Diff.Status.Added,
      'modified.txt': Diff.Status.Modified,
      'removed.txt': Diff.Status.Deleted,
    });
  });

  test('reports non-ASCII paths unquoted, so globs can match them', async () => {
    const repository = useRepository();
    const diff = await Diff.diffAsync({
      cwd: repository.cwd,
      base: await Diff.emptyTreeAsync({cwd: repository.cwd}),
      head: 'HEAD',
    });
    expect(Diff.paths(diff)).toContain('café.txt');
    expect(Diff.added(diff, '*.txt')).toBe(true);
  });
});

describe('diffSync', () => {
  test('throws when the base does not exist', () => {
    const repository = useRepository();
    expect(() =>
      Diff.diffSync({
        cwd: repository.cwd,
        base: 'non-existent-ref',
        head: 'HEAD',
      }),
    ).toThrow(
      expect.objectContaining({
        name: 'GitDiffError',
        code: 'BASE_DOES_NOT_EXIST',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      }),
    );
  });

  test('throws when the head does not exist', () => {
    const repository = useRepository();
    expect(() =>
      Diff.diffSync({
        cwd: repository.cwd,
        base: 'main',
        head: 'non-existent-ref',
      }),
    ).toThrow(
      expect.objectContaining({
        name: 'GitDiffError',
        code: 'HEAD_DOES_NOT_EXIST',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      }),
    );
  });

  test('reports what changed between two refs', () => {
    const repository = useRepository();
    expect(
      Diff.diffSync({cwd: repository.cwd, base: 'HEAD~2', head: 'HEAD'}),
    ).toEqual({
      'added.txt': Diff.Status.Added,
      'modified.txt': Diff.Status.Modified,
      'removed.txt': Diff.Status.Deleted,
    });
  });
});

describe('emptyTreeAsync', () => {
  test('returns the empty tree id', async () => {
    const repository = useRepository();
    expect(await Diff.emptyTreeAsync({cwd: repository.cwd})).toBe(
      '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    );
  });

  test('diffing from it reports every file at HEAD as added', async () => {
    const repository = useRepository();
    const diff = await Diff.diffAsync({
      cwd: repository.cwd,
      base: await Diff.emptyTreeAsync({cwd: repository.cwd}),
      head: 'HEAD',
    });

    expect(Diff.paths(diff).sort()).toEqual(repository.pathsAtHead().sort());
    expect([...new Set(Diff.statuses(diff))]).toEqual([Diff.Status.Added]);
    // the two a root commit gets wrong
    expect(Diff.added(diff, 'kept.txt')).toBe(true);
    expect(Diff.any(diff, 'removed.txt')).toBe(false);
  });

  test('works in a repository with more than one root commit', async () => {
    const repository = useRepository();
    repository.commitUnrelatedHistory({
      files: {'other.txt': 'other'},
      branch: 'other',
    });

    const roots = repository.git('rev-list', '--max-parents=0', 'HEAD');
    expect(
      roots.split('\n').length,
      'expected the fixture to have several root commits',
    ).toBeGreaterThan(1);

    const diff = await Diff.diffAsync({
      cwd: repository.cwd,
      base: await Diff.emptyTreeAsync({cwd: repository.cwd}),
      head: 'HEAD',
    });

    expect(Diff.paths(diff).sort()).toEqual(repository.pathsAtHead().sort());
    expect(Diff.added(diff, 'other.txt')).toBe(true);
  });

  // skipped when git cannot create sha256 repositories
  test.skipIf(!supportsSha256())(
    'asks the repository for its object format',
    async () => {
      const repository = useRepository({objectFormat: 'sha256'});

      const base = await Diff.emptyTreeAsync({cwd: repository.cwd});
      expect(base).toBe(
        '6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321',
      );

      // the sha1 id is not a valid object here, so a hard-coded one would take
      // the diff down rather than merely return the wrong answer
      const diff = await Diff.diffAsync({
        cwd: repository.cwd,
        base,
        head: 'HEAD',
      });
      expect(Diff.paths(diff).sort()).toEqual(repository.pathsAtHead().sort());
    },
  );

  test('rejects when cwd is not a repository', async () => {
    await expect(Diff.emptyTreeAsync({cwd: '/'})).rejects.toThrow();
  });
});

describe('emptyTreeSync', () => {
  test('returns the empty tree id', () => {
    const repository = useRepository();
    expect(Diff.emptyTreeSync({cwd: repository.cwd})).toBe(
      '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    );
  });

  test('works in a repository with more than one root commit', () => {
    const repository = useRepository();
    repository.commitUnrelatedHistory({
      files: {'other.txt': 'other'},
      branch: 'other',
    });

    const roots = repository.git('rev-list', '--max-parents=0', 'HEAD');
    expect(
      roots.split('\n').length,
      'expected the fixture to have several root commits',
    ).toBeGreaterThan(1);

    const diff = Diff.diffSync({
      cwd: repository.cwd,
      base: Diff.emptyTreeSync({cwd: repository.cwd}),
      head: 'HEAD',
    });

    expect(Diff.paths(diff).sort()).toEqual(repository.pathsAtHead().sort());
  });
});

describe('firstCommitAsync', () => {
  test('returns the empty tree id', async () => {
    const repository = useRepository();
    expect(await Diff.firstCommitAsync({cwd: repository.cwd})).toBe(
      await Diff.emptyTreeAsync({cwd: repository.cwd}),
    );
  });
});

describe('firstCommitSync', () => {
  test('returns the empty tree id', () => {
    const repository = useRepository();
    expect(Diff.firstCommitSync({cwd: repository.cwd})).toBe(
      Diff.emptyTreeSync({cwd: repository.cwd}),
    );
  });
});

describe('isBaseDoesNotExistError', () => {
  test('true for a missing base, false for a missing head', async () => {
    const repository = useRepository();

    const missingBase = await Diff.diffAsync({
      cwd: repository.cwd,
      base: 'non-existent-ref',
      head: 'HEAD',
    }).catch((error: unknown) => error);
    expect(Diff.isBaseDoesNotExistError(missingBase)).toBe(true);
    expect(Diff.isHeadDoesNotExistError(missingBase)).toBe(false);

    const missingHead = await Diff.diffAsync({
      cwd: repository.cwd,
      base: 'main',
      head: 'non-existent-ref',
    }).catch((error: unknown) => error);
    expect(Diff.isBaseDoesNotExistError(missingHead)).toBe(false);
  });

  test('true for a base sha the repository does not have', async () => {
    // a full-length object id is reported as `bad object`, not `bad revision`
    const repository = useRepository();
    const error = await Diff.diffAsync({
      cwd: repository.cwd,
      base: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      head: 'HEAD',
    }).catch((error: unknown) => error);
    expect(Diff.isBaseDoesNotExistError(error)).toBe(true);
  });

  test('false for a failure that is not a missing ref', async () => {
    const repository = useRepository();
    repository.destroy();
    const error = await Diff.diffAsync({cwd: repository.cwd}).catch(
      (error: unknown) => error,
    );
    expect(error, 'expected the diff to fail').toBeInstanceOf(Error);
    expect(Diff.isBaseDoesNotExistError(error)).toBe(false);
    expect(Diff.isBadRevisionError(error)).toBe(false);
  });
});

describe('isHeadDoesNotExistError', () => {
  test('true for a missing head, false for a missing base', async () => {
    const repository = useRepository();

    const missingHead = await Diff.diffAsync({
      cwd: repository.cwd,
      base: 'main',
      head: 'non-existent-ref',
    }).catch((error: unknown) => error);
    expect(Diff.isHeadDoesNotExistError(missingHead)).toBe(true);

    const missingBase = await Diff.diffAsync({
      cwd: repository.cwd,
      base: 'non-existent-ref',
      head: 'HEAD',
    }).catch((error: unknown) => error);
    expect(Diff.isHeadDoesNotExistError(missingBase)).toBe(false);
  });
});

describe('isBadRevisionError', () => {
  test('stays true for either missing ref', async () => {
    const repository = useRepository();
    for (const options of [
      {base: 'non-existent-ref', head: 'HEAD'},
      {base: 'main', head: 'non-existent-ref'},
    ]) {
      const error = await Diff.diffAsync({
        cwd: repository.cwd,
        ...options,
      }).catch((error: unknown) => error);
      expect(Diff.isBadRevisionError(error)).toBe(true);
    }
  });

  test('still recognises an error from an older copy of this library', () => {
    // 0.5 threw this shape, with no `ref`. A consumer can have both versions
    // resolved at once, which is the whole reason these guards duck-type.
    expect(
      Diff.isBadRevisionError({
        name: 'GitDiffError',
        code: 'BAD_REVISION',
        message: 'The ref does not exist: v1.2.3',
      }),
    ).toBe(true);
  });
});

/**
 * A repository whose `main` has moved on since `feature` forked from it:
 * `shared.txt` predates the fork, `on-main.txt` was added to `main` afterwards,
 * and `on-feature.txt` only exists on the branch. Checked out on `feature`.
 *
 * The fork being behind `main` is the whole point — it is the only shape in
 * which a merge base and a plain two-ref diff disagree.
 */
interface ForkedRepository extends Repository {
  /** The commit `feature` forked from, which is what a merge base must return. */
  forkPoint: string;
}

/**
 * The error a call rejected with, for assertions that need the value itself
 * rather than a shape to match — `.rejects` cannot run a type guard over it.
 */
async function rejection(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to reject');
}

function useForkedRepository(): ForkedRepository {
  const repository = createRepository();
  onTestFinished(() => {
    repository.destroy();
  });
  repository.commit({files: {'shared.txt': 'shared'}});
  const forkPoint = repository.git('rev-parse', 'HEAD');

  repository.git('checkout', '--quiet', '-b', 'feature');
  repository.commit({files: {'on-feature.txt': 'feature'}});

  repository.git('checkout', '--quiet', 'main');
  repository.commit({files: {'on-main.txt': 'main'}});

  repository.git('checkout', '--quiet', 'feature');
  return Object.assign(repository, {forkPoint});
}

describe('mergeBaseAsync', () => {
  test('returns the commit the refs forked at', async () => {
    const repository = useForkedRepository();

    expect(
      await Diff.mergeBaseAsync({
        cwd: repository.cwd,
        refs: ['main', 'HEAD'],
      }),
    ).toBe(repository.forkPoint);
  });

  // The other tests in this suite pin the error codes, which are internal
  // shape. These are the guards consumers actually reach for, and the property
  // that makes both of them necessary is that each is false for the other's
  // failure —
  // `isBaseDoesNotExistError` included, since `merge-base` has no base to
  // attribute a rejected ref to and so classifies it as `BAD_REVISION`.
  test('the guards tell a missing merge base from a missing ref', async () => {
    const repository = useForkedRepository();
    repository.git('checkout', '--quiet', '--orphan', 'unrelated');
    repository.git('rm', '--quiet', '-rf', '.');
    repository.commit({files: {'unrelated.txt': 'unrelated'}});
    repository.git('checkout', '--quiet', 'main');

    const noMergeBase = await rejection(() =>
      Diff.mergeBaseAsync({cwd: repository.cwd, refs: ['main', 'unrelated']}),
    );
    expect(Diff.isNoMergeBaseError(noMergeBase)).toBe(true);
    expect(Diff.isRefDoesNotExistError(noMergeBase)).toBe(false);

    // the shape of a CI job that never fetched the branch it is comparing to
    const missingRef = await rejection(() =>
      Diff.mergeBaseAsync({cwd: repository.cwd, refs: ['origin/main', 'HEAD']}),
    );
    expect(Diff.isRefDoesNotExistError(missingRef)).toBe(true);
    expect(Diff.isNoMergeBaseError(missingRef)).toBe(false);
    expect(Diff.isBaseDoesNotExistError(missingRef)).toBe(false);
  });

  test('is symmetric', async () => {
    const repository = useForkedRepository();

    expect(
      await Diff.mergeBaseAsync({
        cwd: repository.cwd,
        refs: ['HEAD', 'main'],
      }),
    ).toBe(repository.forkPoint);
  });

  // the reason this exists: against `main` itself the branch also looks like it
  // *deleted* the file `main` added after the fork, because a diff compares two
  // trees rather than replaying commits
  test('is the base that reports only what the branch changed', async () => {
    const repository = useForkedRepository();

    expect(
      await Diff.diffAsync({
        cwd: repository.cwd,
        base: await Diff.mergeBaseAsync({
          cwd: repository.cwd,
          refs: ['main', 'HEAD'],
        }),
        head: 'HEAD',
      }),
    ).toEqual({'on-feature.txt': Diff.Status.Added});

    expect(
      await Diff.diffAsync({cwd: repository.cwd, base: 'main', head: 'HEAD'}),
    ).toEqual({
      'on-feature.txt': Diff.Status.Added,
      'on-main.txt': Diff.Status.Deleted,
    });
  });

  test('throws when the refs share no common ancestor', async () => {
    const repository = useForkedRepository();
    repository.git('checkout', '--quiet', '--orphan', 'unrelated');
    repository.git('rm', '--quiet', '-rf', '.');
    repository.commit({files: {'unrelated.txt': 'unrelated'}});

    await expect(
      Diff.mergeBaseAsync({
        cwd: repository.cwd,
        refs: ['main', 'unrelated'],
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'GitDiffError',
        code: 'NO_MERGE_BASE',
        message: 'The refs share no common ancestor: main, unrelated',
      }),
    );
  });

  // git exits 1 with an empty stdout for "no merge base", but it may still have
  // written a warning — requiring stderr to be empty would send this case down
  // the unclassified path and defeat the documented fallback
  test('classifies a missing merge base even when git warns alongside it', async () => {
    const repository = useForkedRepository();
    repository.git('checkout', '--quiet', '--orphan', 'dup');
    repository.git('rm', '--quiet', '-rf', '.');
    repository.commit({files: {'dup.txt': 'dup'}});
    // a tag and a branch sharing a name, which git warns about on every use
    repository.git('tag', 'dup', 'dup');
    repository.git('checkout', '--quiet', 'main');

    await expect(
      Diff.mergeBaseAsync({cwd: repository.cwd, refs: ['main', 'dup']}),
    ).rejects.toThrow(
      expect.objectContaining({name: 'GitDiffError', code: 'NO_MERGE_BASE'}),
    );
  });

  // without `--`, git reads this as the reflog-dependent option the docs say is
  // not offered — and answers successfully
  test('treats a ref beginning with a dash as a ref, not an option', async () => {
    const repository = useForkedRepository();

    await expect(
      Diff.mergeBaseAsync({
        cwd: repository.cwd,
        refs: ['--fork-point', 'HEAD'],
      }),
    ).rejects.toThrow(
      expect.objectContaining({name: 'GitDiffError', ref: '--fork-point'}),
    );
  });

  test('a missing ref is a ref failure, not a missing merge base', async () => {
    const repository = useForkedRepository();

    await expect(
      Diff.mergeBaseAsync({
        cwd: repository.cwd,
        refs: ['non-existent-ref', 'HEAD'],
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'GitDiffError',
        code: 'BAD_REVISION',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      }),
    );
  });
});

describe('mergeBaseSync', () => {
  test('a missing ref is a ref failure, not a missing merge base', () => {
    const repository = useForkedRepository();

    expect(() =>
      Diff.mergeBaseSync({
        cwd: repository.cwd,
        refs: ['non-existent-ref', 'HEAD'],
      }),
    ).toThrow(
      expect.objectContaining({
        name: 'GitDiffError',
        code: 'BAD_REVISION',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      }),
    );
  });

  test('returns the commit the refs forked at', () => {
    const repository = useForkedRepository();

    expect(
      Diff.mergeBaseSync({cwd: repository.cwd, refs: ['main', 'HEAD']}),
    ).toBe(repository.forkPoint);
  });

  // the sync path reads the exit status from `status` rather than `code`, so
  // classification has to be proven separately from the async one
  test('throws when the refs share no common ancestor', () => {
    const repository = useForkedRepository();
    repository.git('checkout', '--quiet', '--orphan', 'unrelated');
    repository.git('rm', '--quiet', '-rf', '.');
    repository.commit({files: {'unrelated.txt': 'unrelated'}});

    expect(() =>
      Diff.mergeBaseSync({cwd: repository.cwd, refs: ['main', 'unrelated']}),
    ).toThrow(
      expect.objectContaining({
        name: 'GitDiffError',
        code: 'NO_MERGE_BASE',
        message: 'The refs share no common ancestor: main, unrelated',
      }),
    );
  });
});
