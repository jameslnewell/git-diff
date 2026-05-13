import {suite, test} from 'node:test';
import {deepEqual, equal} from 'node:assert';
import * as Diff from './diff.ts';

const diff: Diff.Diff = {
  'package.json': Diff.Status.Unknown,
  'src/main.ts': Diff.Status.Added,
  'src/index.ts': Diff.Status.Deleted,
  'src/utils.ts': Diff.Status.Modified,
  'src/utils.test.ts': Diff.Status.Renamed,
  'tsconfig.json': Diff.Status.Unknown,
};

suite(Diff.filterByPaths.name, () => {
  test('keeps entries whose path matches a glob', () => {
    deepEqual(Diff.filterByPaths(diff, ['src/**']), {
      'src/main.ts': Diff.Status.Added,
      'src/index.ts': Diff.Status.Deleted,
      'src/utils.ts': Diff.Status.Modified,
      'src/utils.test.ts': Diff.Status.Renamed,
    });
  });

  test('accepts multiple globs (OR)', () => {
    deepEqual(Diff.filterByPaths(diff, ['*.json', 'src/main.ts']), {
      'package.json': Diff.Status.Unknown,
      'src/main.ts': Diff.Status.Added,
      'tsconfig.json': Diff.Status.Unknown,
    });
  });

  test('returns empty diff when nothing matches', () => {
    deepEqual(Diff.filterByPaths(diff, ['no/such/path']), {});
  });

  test('returns empty diff for an empty input', () => {
    deepEqual(Diff.filterByPaths({}, ['src/**']), {});
  });
});

suite(Diff.filterByStatuses.name, () => {
  test('keeps entries whose status is in the list', () => {
    deepEqual(Diff.filterByStatuses(diff, [Diff.Status.Added]), {
      'src/main.ts': Diff.Status.Added,
    });
  });

  test('accepts multiple statuses (OR)', () => {
    deepEqual(
      Diff.filterByStatuses(diff, [Diff.Status.Added, Diff.Status.Modified]),
      {
        'src/main.ts': Diff.Status.Added,
        'src/utils.ts': Diff.Status.Modified,
      },
    );
  });

  test('returns empty diff when no entry has the status', () => {
    deepEqual(Diff.filterByStatuses(diff, [Diff.Status.Changed]), {});
  });

  test('returns empty diff for an empty input', () => {
    deepEqual(Diff.filterByStatuses({}, [Diff.Status.Added]), {});
  });
});

suite(Diff.paths.name, () => {
  test('returns the paths in insertion order', () => {
    deepEqual(Diff.paths(diff), [
      'package.json',
      'src/main.ts',
      'src/index.ts',
      'src/utils.ts',
      'src/utils.test.ts',
      'tsconfig.json',
    ]);
  });

  test('returns [] for an empty diff', () => {
    deepEqual(Diff.paths({}), []);
  });
});

suite(Diff.statuses.name, () => {
  test('returns the statuses in insertion order', () => {
    deepEqual(Diff.statuses(diff), [
      Diff.Status.Unknown,
      Diff.Status.Added,
      Diff.Status.Deleted,
      Diff.Status.Modified,
      Diff.Status.Renamed,
      Diff.Status.Unknown,
    ]);
  });

  test('returns [] for an empty diff', () => {
    deepEqual(Diff.statuses({}), []);
  });
});

suite(Diff.any.name, () => {
  test('returns true for a non-empty diff with no paths arg', () => {
    equal(Diff.any(diff), true);
  });

  test('returns false for an empty diff with no paths arg', () => {
    equal(Diff.any({}), false);
  });

  test('returns true when a path matches', () => {
    equal(Diff.any(diff, 'src/main.ts'), true);
  });

  test('returns true when a glob matches', () => {
    equal(Diff.any(diff, 'src/**'), true);
  });

  test('accepts an array of globs', () => {
    equal(Diff.any(diff, ['no/match', 'package.json']), true);
  });

  test('returns false when nothing matches', () => {
    equal(Diff.any(diff, 'no/such/path'), false);
  });
});

suite(Diff.added.name, () => {
  test('returns true when an entry is Added', () => {
    equal(Diff.added(diff), true);
  });

  test('returns false when no entry is Added', () => {
    equal(Diff.added({'a.ts': Diff.Status.Modified}), false);
  });

  test('with paths: true when an Added entry matches the glob', () => {
    equal(Diff.added(diff, 'src/**'), true);
  });

  test('with paths: false when path matches but no Added entry', () => {
    equal(Diff.added(diff, 'tsconfig.json'), false);
  });

  test('with paths: false when status matches but no path matches', () => {
    equal(Diff.added(diff, 'no/such/path'), false);
  });

  test('returns false for an empty diff', () => {
    equal(Diff.added({}), false);
  });
});

suite(Diff.changed.name, () => {
  const withChanged: Diff.Diff = {
    'a.ts': Diff.Status.Changed,
    'b.ts': Diff.Status.Added,
  };

  test('returns true when an entry is Changed', () => {
    equal(Diff.changed(withChanged), true);
  });

  test('returns false when no entry is Changed', () => {
    equal(Diff.changed(diff), false);
  });

  test('with paths: true when a Changed entry matches', () => {
    equal(Diff.changed(withChanged, 'a.ts'), true);
  });

  test('with paths: false when path matches but no Changed entry', () => {
    equal(Diff.changed(withChanged, 'b.ts'), false);
  });
});

suite(Diff.deleted.name, () => {
  test('returns true when an entry is Deleted', () => {
    equal(Diff.deleted(diff), true);
  });

  test('returns false when no entry is Deleted', () => {
    equal(Diff.deleted({'a.ts': Diff.Status.Added}), false);
  });

  test('with paths: true when a Deleted entry matches', () => {
    equal(Diff.deleted(diff, 'src/index.ts'), true);
  });

  test('with paths: false when path matches but no Deleted entry', () => {
    equal(Diff.deleted(diff, 'src/main.ts'), false);
  });
});

suite(Diff.modified.name, () => {
  test('returns true when an entry is Modified', () => {
    equal(Diff.modified(diff), true);
  });

  test('returns false when no entry is Modified', () => {
    equal(Diff.modified({'a.ts': Diff.Status.Added}), false);
  });

  test('with paths: true when a Modified entry matches', () => {
    equal(Diff.modified(diff, 'src/utils.ts'), true);
  });

  test('with paths: false when path matches but no Modified entry', () => {
    equal(Diff.modified(diff, 'src/main.ts'), false);
  });
});

suite(Diff.renamed.name, () => {
  test('returns true when an entry is Renamed', () => {
    equal(Diff.renamed(diff), true);
  });

  test('returns false when no entry is Renamed', () => {
    equal(Diff.renamed({'a.ts': Diff.Status.Added}), false);
  });

  test('with paths: true when a Renamed entry matches', () => {
    equal(Diff.renamed(diff, 'src/utils.test.ts'), true);
  });

  test('with paths: false when path matches but no Renamed entry', () => {
    equal(Diff.renamed(diff, 'src/main.ts'), false);
  });
});

suite(Diff.unknown.name, () => {
  test('returns true when an entry is Unknown', () => {
    equal(Diff.unknown(diff), true);
  });

  test('returns false when no entry is Unknown', () => {
    equal(Diff.unknown({'a.ts': Diff.Status.Added}), false);
  });

  test('with paths: true when an Unknown entry matches', () => {
    equal(Diff.unknown(diff, '*.json'), true);
  });

  test('with paths: false when path matches but no Unknown entry', () => {
    equal(Diff.unknown(diff, 'src/main.ts'), false);
  });
});
