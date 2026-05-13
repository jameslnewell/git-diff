import {suite, test} from 'node:test';
import {
  Status,
  filterByPaths,
  filterByStatuses,
  paths,
  statuses,
  any,
  added,
  changed,
  deleted,
  modified,
  renamed,
  unknown,
  type Diff,
} from './diff.ts';
import {deepEqual, equal} from 'node:assert';

const diff: Diff = {
  'package.json': Status.Unknown,
  'src/main.ts': Status.Added,
  'src/index.ts': Status.Deleted,
  'src/utils.ts': Status.Modified,
  'src/utils.test.ts': Status.Renamed,
  'tsconfig.json': Status.Unknown,
};

suite(filterByPaths.name, () => {
  test('keeps entries whose path matches a glob', () => {
    deepEqual(filterByPaths(diff, ['src/**']), {
      'src/main.ts': Status.Added,
      'src/index.ts': Status.Deleted,
      'src/utils.ts': Status.Modified,
      'src/utils.test.ts': Status.Renamed,
    });
  });

  test('accepts multiple globs (OR)', () => {
    deepEqual(filterByPaths(diff, ['*.json', 'src/main.ts']), {
      'package.json': Status.Unknown,
      'src/main.ts': Status.Added,
      'tsconfig.json': Status.Unknown,
    });
  });

  test('returns empty diff when nothing matches', () => {
    deepEqual(filterByPaths(diff, ['no/such/path']), {});
  });

  test('returns empty diff for an empty input', () => {
    deepEqual(filterByPaths({}, ['src/**']), {});
  });
});

suite(filterByStatuses.name, () => {
  test('keeps entries whose status is in the list', () => {
    deepEqual(filterByStatuses(diff, [Status.Added]), {
      'src/main.ts': Status.Added,
    });
  });

  test('accepts multiple statuses (OR)', () => {
    deepEqual(filterByStatuses(diff, [Status.Added, Status.Modified]), {
      'src/main.ts': Status.Added,
      'src/utils.ts': Status.Modified,
    });
  });

  test('returns empty diff when no entry has the status', () => {
    deepEqual(filterByStatuses(diff, [Status.Changed]), {});
  });

  test('returns empty diff for an empty input', () => {
    deepEqual(filterByStatuses({}, [Status.Added]), {});
  });
});

suite(paths.name, () => {
  test('returns the paths in insertion order', () => {
    deepEqual(paths(diff), [
      'package.json',
      'src/main.ts',
      'src/index.ts',
      'src/utils.ts',
      'src/utils.test.ts',
      'tsconfig.json',
    ]);
  });

  test('returns [] for an empty diff', () => {
    deepEqual(paths({}), []);
  });
});

suite(statuses.name, () => {
  test('returns the statuses in insertion order', () => {
    deepEqual(statuses(diff), [
      Status.Unknown,
      Status.Added,
      Status.Deleted,
      Status.Modified,
      Status.Renamed,
      Status.Unknown,
    ]);
  });

  test('returns [] for an empty diff', () => {
    deepEqual(statuses({}), []);
  });
});

suite(any.name, () => {
  test('returns true for a non-empty diff with no paths arg', () => {
    equal(any(diff), true);
  });

  test('returns false for an empty diff with no paths arg', () => {
    equal(any({}), false);
  });

  test('returns true when a path matches', () => {
    equal(any(diff, 'src/main.ts'), true);
  });

  test('returns true when a glob matches', () => {
    equal(any(diff, 'src/**'), true);
  });

  test('accepts an array of globs', () => {
    equal(any(diff, ['no/match', 'package.json']), true);
  });

  test('returns false when nothing matches', () => {
    equal(any(diff, 'no/such/path'), false);
  });
});

suite(added.name, () => {
  test('returns true when an entry is Added', () => {
    equal(added(diff), true);
  });

  test('returns false when no entry is Added', () => {
    equal(added({'a.ts': Status.Modified}), false);
  });

  test('with paths: true when an Added entry matches the glob', () => {
    equal(added(diff, 'src/**'), true);
  });

  test('with paths: false when path matches but no Added entry', () => {
    equal(added(diff, 'tsconfig.json'), false);
  });

  test('with paths: false when status matches but no path matches', () => {
    equal(added(diff, 'no/such/path'), false);
  });

  test('returns false for an empty diff', () => {
    equal(added({}), false);
  });
});

suite(changed.name, () => {
  const withChanged: Diff = {'a.ts': Status.Changed, 'b.ts': Status.Added};

  test('returns true when an entry is Changed', () => {
    equal(changed(withChanged), true);
  });

  test('returns false when no entry is Changed', () => {
    equal(changed(diff), false);
  });

  test('with paths: true when a Changed entry matches', () => {
    equal(changed(withChanged, 'a.ts'), true);
  });

  test('with paths: false when path matches but no Changed entry', () => {
    equal(changed(withChanged, 'b.ts'), false);
  });
});

suite(deleted.name, () => {
  test('returns true when an entry is Deleted', () => {
    equal(deleted(diff), true);
  });

  test('returns false when no entry is Deleted', () => {
    equal(deleted({'a.ts': Status.Added}), false);
  });

  test('with paths: true when a Deleted entry matches', () => {
    equal(deleted(diff, 'src/index.ts'), true);
  });

  test('with paths: false when path matches but no Deleted entry', () => {
    equal(deleted(diff, 'src/main.ts'), false);
  });
});

suite(modified.name, () => {
  test('returns true when an entry is Modified', () => {
    equal(modified(diff), true);
  });

  test('returns false when no entry is Modified', () => {
    equal(modified({'a.ts': Status.Added}), false);
  });

  test('with paths: true when a Modified entry matches', () => {
    equal(modified(diff, 'src/utils.ts'), true);
  });

  test('with paths: false when path matches but no Modified entry', () => {
    equal(modified(diff, 'src/main.ts'), false);
  });
});

suite(renamed.name, () => {
  test('returns true when an entry is Renamed', () => {
    equal(renamed(diff), true);
  });

  test('returns false when no entry is Renamed', () => {
    equal(renamed({'a.ts': Status.Added}), false);
  });

  test('with paths: true when a Renamed entry matches', () => {
    equal(renamed(diff, 'src/utils.test.ts'), true);
  });

  test('with paths: false when path matches but no Renamed entry', () => {
    equal(renamed(diff, 'src/main.ts'), false);
  });
});

suite(unknown.name, () => {
  test('returns true when an entry is Unknown', () => {
    equal(unknown(diff), true);
  });

  test('returns false when no entry is Unknown', () => {
    equal(unknown({'a.ts': Status.Added}), false);
  });

  test('with paths: true when an Unknown entry matches', () => {
    equal(unknown(diff, '*.json'), true);
  });

  test('with paths: false when path matches but no Unknown entry', () => {
    equal(unknown(diff, 'src/main.ts'), false);
  });
});
