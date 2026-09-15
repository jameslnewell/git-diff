import {suite, test, type TestContext} from 'node:test';
import {rejects, throws} from 'node:assert/strict';
import {deepEqual, equal, ok} from 'node:assert';
import * as Diff from './diff.ts';
import {
  createRepository,
  supportsSha256,
  type CreateRepositoryOptions,
  type Repository,
} from './repository.fixture.ts';

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
function useRepository(
  t: TestContext,
  options?: CreateRepositoryOptions,
): Repository {
  const repository = createRepository(options);
  t.after(() => repository.destroy());
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

suite(Diff.diffAsync.name, () => {
  test('throws when the base does not exist', async (t) => {
    const repository = useRepository(t);
    await rejects(
      () =>
        Diff.diffAsync({
          cwd: repository.cwd,
          base: 'non-existent-ref',
          head: 'HEAD',
        }),
      {
        name: 'GitDiffError',
        code: 'BASE_DOES_NOT_EXIST',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      },
    );
  });

  test('throws when the head does not exist', async (t) => {
    const repository = useRepository(t);
    await rejects(
      () =>
        Diff.diffAsync({
          cwd: repository.cwd,
          base: 'main',
          head: 'non-existent-ref',
        }),
      {
        name: 'GitDiffError',
        code: 'HEAD_DOES_NOT_EXIST',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      },
    );
  });

  test('reports what changed between two refs', async (t) => {
    const repository = useRepository(t);
    deepEqual(
      await Diff.diffAsync({
        cwd: repository.cwd,
        base: 'HEAD~2',
        head: 'HEAD',
      }),
      {
        'added.txt': Diff.Status.Added,
        'modified.txt': Diff.Status.Modified,
        'removed.txt': Diff.Status.Deleted,
      },
    );
  });

  test('reports non-ASCII paths unquoted, so globs can match them', async (t) => {
    const repository = useRepository(t);
    const diff = await Diff.diffAsync({
      cwd: repository.cwd,
      base: await Diff.emptyTreeAsync({cwd: repository.cwd}),
      head: 'HEAD',
    });
    ok(Diff.paths(diff).includes('café.txt'));
    equal(Diff.added(diff, '*.txt'), true);
  });
});

suite(Diff.diffSync.name, () => {
  test('throws when the base does not exist', (t) => {
    const repository = useRepository(t);
    throws(
      () =>
        Diff.diffSync({
          cwd: repository.cwd,
          base: 'non-existent-ref',
          head: 'HEAD',
        }),
      {
        name: 'GitDiffError',
        code: 'BASE_DOES_NOT_EXIST',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      },
    );
  });

  test('throws when the head does not exist', (t) => {
    const repository = useRepository(t);
    throws(
      () =>
        Diff.diffSync({
          cwd: repository.cwd,
          base: 'main',
          head: 'non-existent-ref',
        }),
      {
        name: 'GitDiffError',
        code: 'HEAD_DOES_NOT_EXIST',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      },
    );
  });

  test('reports what changed between two refs', (t) => {
    const repository = useRepository(t);
    deepEqual(
      Diff.diffSync({cwd: repository.cwd, base: 'HEAD~2', head: 'HEAD'}),
      {
        'added.txt': Diff.Status.Added,
        'modified.txt': Diff.Status.Modified,
        'removed.txt': Diff.Status.Deleted,
      },
    );
  });
});

suite(Diff.emptyTreeAsync.name, () => {
  test('returns the empty tree id', async (t) => {
    const repository = useRepository(t);
    equal(
      await Diff.emptyTreeAsync({cwd: repository.cwd}),
      '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    );
  });

  test('diffing from it reports every file at HEAD as added', async (t) => {
    const repository = useRepository(t);
    const diff = await Diff.diffAsync({
      cwd: repository.cwd,
      base: await Diff.emptyTreeAsync({cwd: repository.cwd}),
      head: 'HEAD',
    });

    deepEqual(Diff.paths(diff).sort(), repository.pathsAtHead().sort());
    deepEqual([...new Set(Diff.statuses(diff))], [Diff.Status.Added]);
    // the two a root commit gets wrong
    equal(Diff.added(diff, 'kept.txt'), true);
    equal(Diff.any(diff, 'removed.txt'), false);
  });

  test('works in a repository with more than one root commit', async (t) => {
    const repository = useRepository(t);
    repository.commitUnrelatedHistory({
      files: {'other.txt': 'other'},
      branch: 'other',
    });

    const roots = repository.git('rev-list', '--max-parents=0', 'HEAD');
    ok(
      roots.split('\n').length > 1,
      'expected the fixture to have several root commits',
    );

    const diff = await Diff.diffAsync({
      cwd: repository.cwd,
      base: await Diff.emptyTreeAsync({cwd: repository.cwd}),
      head: 'HEAD',
    });

    deepEqual(Diff.paths(diff).sort(), repository.pathsAtHead().sort());
    equal(Diff.added(diff, 'other.txt'), true);
  });

  test(
    'asks the repository for its object format',
    {skip: supportsSha256() ? false : 'git cannot create sha256 repositories'},
    async (t) => {
      const repository = useRepository(t, {objectFormat: 'sha256'});

      const base = await Diff.emptyTreeAsync({cwd: repository.cwd});
      equal(
        base,
        '6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321',
      );

      // the sha1 id is not a valid object here, so a hard-coded one would take
      // the diff down rather than merely return the wrong answer
      const diff = await Diff.diffAsync({
        cwd: repository.cwd,
        base,
        head: 'HEAD',
      });
      deepEqual(Diff.paths(diff).sort(), repository.pathsAtHead().sort());
    },
  );

  test('rejects when cwd is not a repository', async () => {
    await rejects(() => Diff.emptyTreeAsync({cwd: '/'}));
  });
});

suite(Diff.emptyTreeSync.name, () => {
  test('returns the empty tree id', (t) => {
    const repository = useRepository(t);
    equal(
      Diff.emptyTreeSync({cwd: repository.cwd}),
      '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    );
  });

  test('works in a repository with more than one root commit', (t) => {
    const repository = useRepository(t);
    repository.commitUnrelatedHistory({
      files: {'other.txt': 'other'},
      branch: 'other',
    });

    const roots = repository.git('rev-list', '--max-parents=0', 'HEAD');
    ok(
      roots.split('\n').length > 1,
      'expected the fixture to have several root commits',
    );

    const diff = Diff.diffSync({
      cwd: repository.cwd,
      base: Diff.emptyTreeSync({cwd: repository.cwd}),
      head: 'HEAD',
    });

    deepEqual(Diff.paths(diff).sort(), repository.pathsAtHead().sort());
  });
});

suite(Diff.firstCommitAsync.name, () => {
  test('returns the empty tree id', async (t) => {
    const repository = useRepository(t);
    equal(
      await Diff.firstCommitAsync({cwd: repository.cwd}),
      await Diff.emptyTreeAsync({cwd: repository.cwd}),
    );
  });
});

suite(Diff.firstCommitSync.name, () => {
  test('returns the empty tree id', (t) => {
    const repository = useRepository(t);
    equal(
      Diff.firstCommitSync({cwd: repository.cwd}),
      Diff.emptyTreeSync({cwd: repository.cwd}),
    );
  });
});

suite(Diff.isBaseDoesNotExistError.name, () => {
  test('true for a missing base, false for a missing head', async (t) => {
    const repository = useRepository(t);

    const missingBase = await Diff.diffAsync({
      cwd: repository.cwd,
      base: 'non-existent-ref',
      head: 'HEAD',
    }).catch((error: unknown) => error);
    equal(Diff.isBaseDoesNotExistError(missingBase), true);
    equal(Diff.isHeadDoesNotExistError(missingBase), false);

    const missingHead = await Diff.diffAsync({
      cwd: repository.cwd,
      base: 'main',
      head: 'non-existent-ref',
    }).catch((error: unknown) => error);
    equal(Diff.isBaseDoesNotExistError(missingHead), false);
  });

  test('true for a base sha the repository does not have', async (t) => {
    // a full-length object id is reported as `bad object`, not `bad revision`
    const repository = useRepository(t);
    const error = await Diff.diffAsync({
      cwd: repository.cwd,
      base: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      head: 'HEAD',
    }).catch((error: unknown) => error);
    equal(Diff.isBaseDoesNotExistError(error), true);
  });

  test('false for a failure that is not a missing ref', async (t) => {
    const repository = useRepository(t);
    repository.destroy();
    const error = await Diff.diffAsync({cwd: repository.cwd}).catch(
      (error: unknown) => error,
    );
    ok(error instanceof Error, 'expected the diff to fail');
    equal(Diff.isBaseDoesNotExistError(error), false);
    equal(Diff.isBadRevisionError(error), false);
  });
});

suite(Diff.isHeadDoesNotExistError.name, () => {
  test('true for a missing head, false for a missing base', async (t) => {
    const repository = useRepository(t);

    const missingHead = await Diff.diffAsync({
      cwd: repository.cwd,
      base: 'main',
      head: 'non-existent-ref',
    }).catch((error: unknown) => error);
    equal(Diff.isHeadDoesNotExistError(missingHead), true);

    const missingBase = await Diff.diffAsync({
      cwd: repository.cwd,
      base: 'non-existent-ref',
      head: 'HEAD',
    }).catch((error: unknown) => error);
    equal(Diff.isHeadDoesNotExistError(missingBase), false);
  });
});

suite(Diff.isBadRevisionError.name, () => {
  test('stays true for either missing ref', async (t) => {
    const repository = useRepository(t);
    for (const options of [
      {base: 'non-existent-ref', head: 'HEAD'},
      {base: 'main', head: 'non-existent-ref'},
    ]) {
      const error = await Diff.diffAsync({
        cwd: repository.cwd,
        ...options,
      }).catch((error: unknown) => error);
      equal(Diff.isBadRevisionError(error), true);
    }
  });

  test('still recognises an error from an older copy of this library', () => {
    // 0.5 threw this shape, with no `ref`. A consumer can have both versions
    // resolved at once, which is the whole reason these guards duck-type.
    equal(
      Diff.isBadRevisionError({
        name: 'GitDiffError',
        code: 'BAD_REVISION',
        message: 'The ref does not exist: v1.2.3',
      }),
      true,
    );
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

function useForkedRepository(t: TestContext): ForkedRepository {
  const repository = createRepository();
  t.after(() => repository.destroy());
  repository.commit({files: {'shared.txt': 'shared'}});
  const forkPoint = repository.git('rev-parse', 'HEAD');

  repository.git('checkout', '--quiet', '-b', 'feature');
  repository.commit({files: {'on-feature.txt': 'feature'}});

  repository.git('checkout', '--quiet', 'main');
  repository.commit({files: {'on-main.txt': 'main'}});

  repository.git('checkout', '--quiet', 'feature');
  return Object.assign(repository, {forkPoint});
}

suite(Diff.mergeBaseAsync.name, () => {
  test('returns the commit the refs forked at', async (t) => {
    const repository = useForkedRepository(t);

    equal(
      await Diff.mergeBaseAsync({
        cwd: repository.cwd,
        refs: ['main', 'HEAD'],
      }),
      repository.forkPoint,
    );
  });

  test('is symmetric', async (t) => {
    const repository = useForkedRepository(t);

    equal(
      await Diff.mergeBaseAsync({
        cwd: repository.cwd,
        refs: ['HEAD', 'main'],
      }),
      repository.forkPoint,
    );
  });

  // the reason this exists: against `main` itself the branch also looks like it
  // *deleted* the file `main` added after the fork, because a diff compares two
  // trees rather than replaying commits
  test('is the base that reports only what the branch changed', async (t) => {
    const repository = useForkedRepository(t);

    deepEqual(
      await Diff.diffAsync({
        cwd: repository.cwd,
        base: await Diff.mergeBaseAsync({
          cwd: repository.cwd,
          refs: ['main', 'HEAD'],
        }),
        head: 'HEAD',
      }),
      {'on-feature.txt': Diff.Status.Added},
    );

    deepEqual(
      await Diff.diffAsync({cwd: repository.cwd, base: 'main', head: 'HEAD'}),
      {
        'on-feature.txt': Diff.Status.Added,
        'on-main.txt': Diff.Status.Deleted,
      },
    );
  });

  test('throws when the refs share no common ancestor', async (t) => {
    const repository = useForkedRepository(t);
    repository.git('checkout', '--quiet', '--orphan', 'unrelated');
    repository.git('rm', '--quiet', '-rf', '.');
    repository.commit({files: {'unrelated.txt': 'unrelated'}});

    await rejects(
      () =>
        Diff.mergeBaseAsync({
          cwd: repository.cwd,
          refs: ['main', 'unrelated'],
        }),
      {
        name: 'GitDiffError',
        code: 'NO_MERGE_BASE',
        message: 'The refs share no common ancestor: main, unrelated',
      },
    );
  });

  // git exits 1 with an empty stdout for "no merge base", but it may still have
  // written a warning — requiring stderr to be empty would send this case down
  // the unclassified path and defeat the documented fallback
  test('classifies a missing merge base even when git warns alongside it', async (t) => {
    const repository = useForkedRepository(t);
    repository.git('checkout', '--quiet', '--orphan', 'dup');
    repository.git('rm', '--quiet', '-rf', '.');
    repository.commit({files: {'dup.txt': 'dup'}});
    // a tag and a branch sharing a name, which git warns about on every use
    repository.git('tag', 'dup', 'dup');
    repository.git('checkout', '--quiet', 'main');

    await rejects(
      () => Diff.mergeBaseAsync({cwd: repository.cwd, refs: ['main', 'dup']}),
      {name: 'GitDiffError', code: 'NO_MERGE_BASE'},
    );
  });

  // without `--`, git reads this as the reflog-dependent option the docs say is
  // not offered — and answers successfully
  test('treats a ref beginning with a dash as a ref, not an option', async (t) => {
    const repository = useForkedRepository(t);

    await rejects(
      () =>
        Diff.mergeBaseAsync({
          cwd: repository.cwd,
          refs: ['--fork-point', 'HEAD'],
        }),
      {name: 'GitDiffError', ref: '--fork-point'},
    );
  });

  test('a missing ref is a ref failure, not a missing merge base', async (t) => {
    const repository = useForkedRepository(t);

    await rejects(
      () =>
        Diff.mergeBaseAsync({
          cwd: repository.cwd,
          refs: ['non-existent-ref', 'HEAD'],
        }),
      {
        name: 'GitDiffError',
        code: 'BAD_REVISION',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      },
    );
  });
});

suite(Diff.mergeBaseSync.name, () => {
  test('a missing ref is a ref failure, not a missing merge base', (t) => {
    const repository = useForkedRepository(t);

    throws(
      () =>
        Diff.mergeBaseSync({
          cwd: repository.cwd,
          refs: ['non-existent-ref', 'HEAD'],
        }),
      {
        name: 'GitDiffError',
        code: 'BAD_REVISION',
        message: 'The ref does not exist: non-existent-ref',
        ref: 'non-existent-ref',
      },
    );
  });

  test('returns the commit the refs forked at', (t) => {
    const repository = useForkedRepository(t);

    equal(
      Diff.mergeBaseSync({cwd: repository.cwd, refs: ['main', 'HEAD']}),
      repository.forkPoint,
    );
  });

  // the sync path reads the exit status from `status` rather than `code`, so
  // classification has to be proven separately from the async one
  test('throws when the refs share no common ancestor', (t) => {
    const repository = useForkedRepository(t);
    repository.git('checkout', '--quiet', '--orphan', 'unrelated');
    repository.git('rm', '--quiet', '-rf', '.');
    repository.commit({files: {'unrelated.txt': 'unrelated'}});

    throws(
      () =>
        Diff.mergeBaseSync({cwd: repository.cwd, refs: ['main', 'unrelated']}),
      {
        name: 'GitDiffError',
        code: 'NO_MERGE_BASE',
        message: 'The refs share no common ancestor: main, unrelated',
      },
    );
  });
});
