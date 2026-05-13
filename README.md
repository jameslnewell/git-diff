# @jameslnewell/git-diff

Utilities for obtaining the git diff status of files in a repository.

## Installation

```sh
npm install @jameslnewell/git-diff
```

## Usage

### Diff Options

- `cwd?: string` The current working directory
- `base?: string` The base commit or branch to compare from
- `head?: string` The head commit or branch to compare to

### Async

```typescript
import * as Diff from '@jameslnewell/git-diff';

const diff = await Diff.diffAsync({
  base: 'main',
  head: 'feature-branch',
});

if (Diff.added(diff, 'prisma/*') || Diff.modified(diff, 'prisma/*')) {
  // do something
  // e.g. prisma generate && prisma migrate
}
```

### Sync

```typescript
import * as Diff from '@jameslnewell/git-diff';

const diff = Diff.diffSync({
  base: 'main',
  head: 'feature-branch',
});

if (Diff.added(diff, 'prisma/*') || Diff.modified(diff, 'prisma/*')) {
  // do something
}
```

### Predicates

Each predicate returns `true` when at least one path matches. The optional second argument is a path or glob (or array of either) to scope the check.

- `Diff.any(diff, paths?)` — any file at all
- `Diff.added(diff, paths?)`
- `Diff.changed(diff, paths?)`
- `Diff.deleted(diff, paths?)`
- `Diff.modified(diff, paths?)`
- `Diff.renamed(diff, paths?)`
- `Diff.unknown(diff, paths?)`

```ts
if (Diff.added(diff)) {
  /* any added */
}
if (Diff.added(diff, 'src/**')) {
  /* any added under src/ */
}
if (Diff.any(diff, ['prisma/*', 'src/db/**'])) {
  /* anything touched */
}
```

### Filters and views

- `Diff.filterByPaths(diff, paths)` — returns a new `Diff` containing only entries whose path matches one of the globs (array required).
- `Diff.filterByStatuses(diff, statuses)` — returns a new `Diff` containing only entries with one of the given statuses (array required).
- `Diff.paths(diff)` — returns the paths as an array.
- `Diff.statuses(diff)` — returns the statuses as an array.

Compose to build more specific queries:

```ts
import * as Diff from '@jameslnewell/git-diff';

// All added file paths under src/
const newSourceFiles = Diff.paths(
  Diff.filterByPaths(Diff.filterByStatuses(diff, [Diff.Status.Added]), [
    'src/**',
  ]),
);
```

### Faking a diff in tests

`Diff` is just `Record<Path, Status>`, so a test fixture is a plain object literal:

```ts
import {added, Status, type Diff} from '@jameslnewell/git-diff';

const diff: Diff = {
  'src/main.ts': Status.Added,
};

added(diff, 'src/**'); // true
```

### Handling a non-existent `base`

A common use case is diffing against a mutable tag on CI/CD.

```ts
import * as Diff from '@jameslnewell/git-diff';

const diff = await Diff.diffAsync({
  base: 'last-deployment',
  head: 'HEAD',
});
```

On the initial CI/CD run the mutable tag may not yet exist and `git diff` will error.

In order to handle this case its recommended you diff against the first commit instead.

```ts
import * as Diff from '@jameslnewell/git-diff';

const base = 'last-deployment';
const head = 'HEAD';

let diff: Diff.Diff;
try {
  diff = await Diff.diffAsync({base, head});
} catch (error) {
  if (error.code === 'BAD_REVISION') {
    diff = await Diff.diffAsync({
      base: await Diff.firstCommitAsync({ref: head}),
      head,
    });
  } else {
    throw error;
  }
}
```

## License

MIT
