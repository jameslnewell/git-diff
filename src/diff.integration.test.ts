import {suite, test} from 'node:test';
import {rejects, throws} from 'node:assert/strict';
import {deepEqual, equal, ok} from 'node:assert';
import * as Diff from './diff.ts';
import {
  createRepository,
  supportsSha256,
  type Repository,
} from './repository.fixture.ts';

/**
 * A repository containing each of the three shapes a base has to get right:
 *
 * - `kept.txt` is added in the root commit and never touched again, so it is
 *   absent from a diff taken against that root — a file that exists reported as
 *   unchanged.
 * - `modified.txt` is added in the root and changed later.
 * - `removed.txt` is added and then deleted, so a diff against the root reports
 *   a `D` for a file that isn't there at all.
 *
 * Only a diff against the empty tree gets all three right.
 */
function createRepositoryWithHistory(): Repository {
  const repository = createRepository();
  repository.commit({
    'kept.txt': 'kept',
    'modified.txt': 'before',
    'removed.txt': 'removed',
  });
  repository.commit({'modified.txt': 'after', 'added.txt': 'added'});
  repository.remove(['removed.txt']);
  return repository;
}

function pathsAtHead(repository: Repository): string[] {
  return repository.git('ls-tree', '-r', '--name-only', 'HEAD').split('\n');
}

suite(Diff.diffAsync.name, () => {
  test('throws for bad revision', async () => {
    const repository = createRepositoryWithHistory();
    try {
      await rejects(
        () =>
          Diff.diffAsync({
            cwd: repository.cwd,
            base: 'non-existent-ref',
            head: 'HEAD',
          }),
        {
          name: 'GitDiffError',
          code: 'BAD_REVISION',
          message: 'The ref does not exist: non-existent-ref',
        },
      );
    } finally {
      repository.destroy();
    }
  });

  test('reports what changed between two refs', async () => {
    const repository = createRepositoryWithHistory();
    try {
      const diff = await Diff.diffAsync({
        cwd: repository.cwd,
        base: 'HEAD~2',
        head: 'HEAD',
      });
      deepEqual(diff, {
        'added.txt': Diff.Status.Added,
        'modified.txt': Diff.Status.Modified,
        'removed.txt': Diff.Status.Deleted,
      });
    } finally {
      repository.destroy();
    }
  });
});

suite(Diff.diffSync.name, () => {
  test('throws for bad revision', () => {
    const repository = createRepositoryWithHistory();
    try {
      throws(
        () =>
          Diff.diffSync({
            cwd: repository.cwd,
            base: 'non-existent-ref',
            head: 'HEAD',
          }),
        {
          name: 'GitDiffError',
          code: 'BAD_REVISION',
          message: 'The ref does not exist: non-existent-ref',
        },
      );
    } finally {
      repository.destroy();
    }
  });

  test('reports what changed between two refs', () => {
    const repository = createRepositoryWithHistory();
    try {
      const diff = Diff.diffSync({
        cwd: repository.cwd,
        base: 'HEAD~2',
        head: 'HEAD',
      });
      deepEqual(diff, {
        'added.txt': Diff.Status.Added,
        'modified.txt': Diff.Status.Modified,
        'removed.txt': Diff.Status.Deleted,
      });
    } finally {
      repository.destroy();
    }
  });
});

suite(Diff.emptyTreeAsync.name, () => {
  test('returns the empty tree id', async () => {
    const repository = createRepositoryWithHistory();
    try {
      equal(
        await Diff.emptyTreeAsync({cwd: repository.cwd}),
        '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      );
    } finally {
      repository.destroy();
    }
  });

  test('diffing from it reports every file at HEAD as added', async () => {
    const repository = createRepositoryWithHistory();
    try {
      const diff = await Diff.diffAsync({
        cwd: repository.cwd,
        base: await Diff.emptyTreeAsync({cwd: repository.cwd}),
        head: 'HEAD',
      });

      deepEqual(Diff.paths(diff).sort(), pathsAtHead(repository).sort());
      deepEqual([...new Set(Diff.statuses(diff))], [Diff.Status.Added]);
      // the two a root commit gets wrong
      equal(Diff.added(diff, 'kept.txt'), true);
      equal(Diff.any(diff, 'removed.txt'), false);
    } finally {
      repository.destroy();
    }
  });

  test('works in a repository with more than one root commit', async () => {
    const repository = createRepositoryWithHistory();
    repository.commitUnrelatedHistory({'other.txt': 'other'}, 'other');
    try {
      const roots = repository
        .git('rev-list', '--max-parents=0', 'HEAD')
        .split('\n');
      ok(roots.length > 1, 'expected the fixture to have several root commits');

      const diff = await Diff.diffAsync({
        cwd: repository.cwd,
        base: await Diff.emptyTreeAsync({cwd: repository.cwd}),
        head: 'HEAD',
      });

      deepEqual(Diff.paths(diff).sort(), pathsAtHead(repository).sort());
      equal(Diff.added(diff, 'other.txt'), true);
    } finally {
      repository.destroy();
    }
  });

  test(
    'asks the repository for its object format',
    {skip: supportsSha256() ? false : 'git cannot create sha256 repositories'},
    async () => {
      const repository = createRepository({objectFormat: 'sha256'});
      repository.commit({'a.txt': 'a'});
      try {
        const base = await Diff.emptyTreeAsync({cwd: repository.cwd});
        equal(
          base,
          '6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321',
        );
        // the sha1 id is not a valid object here, so a hard-coded one would
        // take the diff down rather than merely return the wrong answer
        deepEqual(
          await Diff.diffAsync({cwd: repository.cwd, base, head: 'HEAD'}),
          {'a.txt': Diff.Status.Added},
        );
      } finally {
        repository.destroy();
      }
    },
  );

  test('rejects when cwd is not a repository', async () => {
    await rejects(() => Diff.emptyTreeAsync({cwd: '/'}));
  });
});

suite(Diff.emptyTreeSync.name, () => {
  test('returns the empty tree id', () => {
    const repository = createRepositoryWithHistory();
    try {
      equal(
        Diff.emptyTreeSync({cwd: repository.cwd}),
        '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      );
    } finally {
      repository.destroy();
    }
  });

  test('works in a repository with more than one root commit', () => {
    const repository = createRepositoryWithHistory();
    repository.commitUnrelatedHistory({'other.txt': 'other'}, 'other');
    try {
      const roots = repository
        .git('rev-list', '--max-parents=0', 'HEAD')
        .split('\n');
      ok(roots.length > 1, 'expected the fixture to have several root commits');

      const diff = Diff.diffSync({
        cwd: repository.cwd,
        base: Diff.emptyTreeSync({cwd: repository.cwd}),
        head: 'HEAD',
      });

      deepEqual(Diff.paths(diff).sort(), pathsAtHead(repository).sort());
    } finally {
      repository.destroy();
    }
  });
});

suite(Diff.firstCommitAsync.name, () => {
  test('returns the empty tree id', async () => {
    const repository = createRepositoryWithHistory();
    try {
      equal(
        await Diff.firstCommitAsync({cwd: repository.cwd}),
        await Diff.emptyTreeAsync({cwd: repository.cwd}),
      );
    } finally {
      repository.destroy();
    }
  });
});

suite(Diff.firstCommitSync.name, () => {
  test('returns the empty tree id', () => {
    const repository = createRepositoryWithHistory();
    try {
      equal(
        Diff.firstCommitSync({cwd: repository.cwd}),
        Diff.emptyTreeSync({cwd: repository.cwd}),
      );
    } finally {
      repository.destroy();
    }
  });
});
