import * as Diff from './diff.ts';
import {describe, expect, test} from 'vitest';

const diff: Diff.Diff = {
  'package.json': Diff.Status.Unknown,
  'src/main.ts': Diff.Status.Added,
  'src/index.ts': Diff.Status.Deleted,
  'src/utils.ts': Diff.Status.Modified,
  'src/utils.test.ts': Diff.Status.Renamed,
  'tsconfig.json': Diff.Status.Unknown,
};

describe('parse', () => {
  test('parses single-status lines', () => {
    expect(
      Diff.parse('A\tsrc/main.ts\nM\tsrc/utils.ts\nD\tsrc/index.ts\n'),
    ).toEqual({
      'src/main.ts': Diff.Status.Added,
      'src/utils.ts': Diff.Status.Modified,
      'src/index.ts': Diff.Status.Deleted,
    });
  });

  test('keeps the leading dot of dotfile paths', () => {
    expect(Diff.parse('M\t.gitignore\nA\t.buildkite/pipeline.ts\n')).toEqual({
      '.gitignore': Diff.Status.Modified,
      '.buildkite/pipeline.ts': Diff.Status.Added,
    });
  });

  test('keys a rename on the destination and reduces the score to R', () => {
    expect(Diff.parse('R100\tDockerfile\tbackend/Dockerfile\n')).toEqual({
      'backend/Dockerfile': Diff.Status.Renamed,
    });
  });

  test('keys a copy on the destination path', () => {
    expect(Diff.parse('C075\tsrc/a.ts\tsrc/b.ts\n')).toEqual({
      'src/b.ts': Diff.Status.Changed,
    });
  });

  test('ignores blank lines', () => {
    expect(Diff.parse('A\ta.ts\n\n')).toEqual({'a.ts': Diff.Status.Added});
  });

  test('throws on a line with no path', () => {
    expect(() => Diff.parse('A\n')).toThrow(/Invalid line in diff output/);
  });
});

describe('filterByPaths', () => {
  test('keeps entries whose path matches a glob', () => {
    expect(Diff.filterByPaths(diff, ['src/**'])).toEqual({
      'src/main.ts': Diff.Status.Added,
      'src/index.ts': Diff.Status.Deleted,
      'src/utils.ts': Diff.Status.Modified,
      'src/utils.test.ts': Diff.Status.Renamed,
    });
  });

  test('accepts multiple globs (OR)', () => {
    expect(Diff.filterByPaths(diff, ['*.json', 'src/main.ts'])).toEqual({
      'package.json': Diff.Status.Unknown,
      'src/main.ts': Diff.Status.Added,
      'tsconfig.json': Diff.Status.Unknown,
    });
  });

  test('returns empty diff when nothing matches', () => {
    expect(Diff.filterByPaths(diff, ['no/such/path'])).toEqual({});
  });

  test('returns empty diff for an empty input', () => {
    expect(Diff.filterByPaths({}, ['src/**'])).toEqual({});
  });

  test('keeps dotfiles whose path matches a glob', () => {
    expect(
      Diff.filterByPaths({'infra/.terraform.lock.hcl': Diff.Status.Modified}, [
        'infra/**',
      ]),
    ).toEqual({'infra/.terraform.lock.hcl': Diff.Status.Modified});
  });
});

describe('filterByStatuses', () => {
  test('keeps entries whose status is in the list', () => {
    expect(Diff.filterByStatuses(diff, [Diff.Status.Added])).toEqual({
      'src/main.ts': Diff.Status.Added,
    });
  });

  test('accepts multiple statuses (OR)', () => {
    expect(
      Diff.filterByStatuses(diff, [Diff.Status.Added, Diff.Status.Modified]),
    ).toEqual({
      'src/main.ts': Diff.Status.Added,
      'src/utils.ts': Diff.Status.Modified,
    });
  });

  test('returns empty diff when no entry has the status', () => {
    expect(Diff.filterByStatuses(diff, [Diff.Status.Changed])).toEqual({});
  });

  test('returns empty diff for an empty input', () => {
    expect(Diff.filterByStatuses({}, [Diff.Status.Added])).toEqual({});
  });
});

describe('paths', () => {
  test('returns the paths in insertion order', () => {
    expect(Diff.paths(diff)).toEqual([
      'package.json',
      'src/main.ts',
      'src/index.ts',
      'src/utils.ts',
      'src/utils.test.ts',
      'tsconfig.json',
    ]);
  });

  test('returns [] for an empty diff', () => {
    expect(Diff.paths({})).toEqual([]);
  });
});

describe('statuses', () => {
  test('returns the statuses in insertion order', () => {
    expect(Diff.statuses(diff)).toEqual([
      Diff.Status.Unknown,
      Diff.Status.Added,
      Diff.Status.Deleted,
      Diff.Status.Modified,
      Diff.Status.Renamed,
      Diff.Status.Unknown,
    ]);
  });

  test('returns [] for an empty diff', () => {
    expect(Diff.statuses({})).toEqual([]);
  });
});

describe('any', () => {
  test('returns true for a non-empty diff with no paths arg', () => {
    expect(Diff.any(diff)).toBe(true);
  });

  test('returns false for an empty diff with no paths arg', () => {
    expect(Diff.any({})).toBe(false);
  });

  test('returns true when a path matches', () => {
    expect(Diff.any(diff, 'src/main.ts')).toBe(true);
  });

  test('returns true when a glob matches', () => {
    expect(Diff.any(diff, 'src/**')).toBe(true);
  });

  test('accepts an array of globs', () => {
    expect(Diff.any(diff, ['no/match', 'package.json'])).toBe(true);
  });

  test('returns false when nothing matches', () => {
    expect(Diff.any(diff, 'no/such/path')).toBe(false);
  });

  test('returns true when a glob matches a dotfile', () => {
    expect(
      Diff.any({'infra/.terraform.lock.hcl': Diff.Status.Modified}, 'infra/**'),
    ).toBe(true);
  });
});

describe('added', () => {
  test('returns true when an entry is Added', () => {
    expect(Diff.added(diff)).toBe(true);
  });

  test('returns false when no entry is Added', () => {
    expect(Diff.added({'a.ts': Diff.Status.Modified})).toBe(false);
  });

  test('with paths: true when an Added entry matches the glob', () => {
    expect(Diff.added(diff, 'src/**')).toBe(true);
  });

  test('with paths: false when path matches but no Added entry', () => {
    expect(Diff.added(diff, 'tsconfig.json')).toBe(false);
  });

  test('with paths: false when status matches but no path matches', () => {
    expect(Diff.added(diff, 'no/such/path')).toBe(false);
  });

  test('returns false for an empty diff', () => {
    expect(Diff.added({})).toBe(false);
  });
});

describe('changed', () => {
  const withChanged: Diff.Diff = {
    'a.ts': Diff.Status.Changed,
    'b.ts': Diff.Status.Added,
  };

  test('returns true when an entry is Changed', () => {
    expect(Diff.changed(withChanged)).toBe(true);
  });

  test('returns false when no entry is Changed', () => {
    expect(Diff.changed(diff)).toBe(false);
  });

  test('with paths: true when a Changed entry matches', () => {
    expect(Diff.changed(withChanged, 'a.ts')).toBe(true);
  });

  test('with paths: false when path matches but no Changed entry', () => {
    expect(Diff.changed(withChanged, 'b.ts')).toBe(false);
  });
});

describe('deleted', () => {
  test('returns true when an entry is Deleted', () => {
    expect(Diff.deleted(diff)).toBe(true);
  });

  test('returns false when no entry is Deleted', () => {
    expect(Diff.deleted({'a.ts': Diff.Status.Added})).toBe(false);
  });

  test('with paths: true when a Deleted entry matches', () => {
    expect(Diff.deleted(diff, 'src/index.ts')).toBe(true);
  });

  test('with paths: false when path matches but no Deleted entry', () => {
    expect(Diff.deleted(diff, 'src/main.ts')).toBe(false);
  });
});

describe('modified', () => {
  test('returns true when an entry is Modified', () => {
    expect(Diff.modified(diff)).toBe(true);
  });

  test('returns false when no entry is Modified', () => {
    expect(Diff.modified({'a.ts': Diff.Status.Added})).toBe(false);
  });

  test('with paths: true when a Modified entry matches', () => {
    expect(Diff.modified(diff, 'src/utils.ts')).toBe(true);
  });

  test('with paths: true when a Modified dotfile matches the glob', () => {
    expect(
      Diff.modified(
        {'infra/.terraform.lock.hcl': Diff.Status.Modified},
        'infra/**',
      ),
    ).toBe(true);
  });

  test('with paths: false when path matches but no Modified entry', () => {
    expect(Diff.modified(diff, 'src/main.ts')).toBe(false);
  });
});

describe('renamed', () => {
  test('returns true when an entry is Renamed', () => {
    expect(Diff.renamed(diff)).toBe(true);
  });

  test('returns false when no entry is Renamed', () => {
    expect(Diff.renamed({'a.ts': Diff.Status.Added})).toBe(false);
  });

  test('with paths: true when a Renamed entry matches', () => {
    expect(Diff.renamed(diff, 'src/utils.test.ts')).toBe(true);
  });

  test('with paths: false when path matches but no Renamed entry', () => {
    expect(Diff.renamed(diff, 'src/main.ts')).toBe(false);
  });
});

describe('unknown', () => {
  test('returns true when an entry is Unknown', () => {
    expect(Diff.unknown(diff)).toBe(true);
  });

  test('returns false when no entry is Unknown', () => {
    expect(Diff.unknown({'a.ts': Diff.Status.Added})).toBe(false);
  });

  test('with paths: true when an Unknown entry matches', () => {
    expect(Diff.unknown(diff, '*.json')).toBe(true);
  });

  test('with paths: false when path matches but no Unknown entry', () => {
    expect(Diff.unknown(diff, 'src/main.ts')).toBe(false);
  });
});
