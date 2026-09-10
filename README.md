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

On the initial CI/CD run the mutable tag doesn't exist yet and `git diff` will error. Catch that with `Diff.isBadRevisionError` and fall back to the empty tree, which reports every file as added:

```ts
import * as Diff from '@jameslnewell/git-diff';

const base = 'last-deployment';
const head = 'HEAD';

let diff: Diff.Diff;
try {
  diff = await Diff.diffAsync({base, head});
} catch (error) {
  if (!Diff.isBadRevisionError(error)) throw error;
  diff = await Diff.diffAsync({base: await Diff.emptyTreeAsync(), head});
}
```

### The empty tree

`Diff.emptyTreeAsync()` / `Diff.emptyTreeSync()` return the id of git's empty tree — a tree object with no entries. Diffing from it reports **every file in `head` as added**, so it's the base to use when you can't tell what changed and have to assume everything did.

It's git's own device for this: git-log(1) notes that "root commits are compared to an empty tree", and git-config(1) describes `log.showRoot` as "equivalent to a diff against an empty tree".

The id is a hash of the empty tree object, so it depends on which algorithm the repository uses — `4b825dc…` under SHA-1, something else entirely under SHA-256, and `git diff` rejects the wrong one outright. These functions ask the repository, so `cwd` must be inside one.

Don't reach for the repository's root commit instead. A root commit is only "nothing" if it's an empty commit, which almost none are — files added in the root and untouched since are missing from the diff, and files deleted since show up as `D`. A repository assembled from several histories (`git merge --allow-unrelated-histories`, or a `filter-repo` consolidation) has more than one root, and `git rev-list --max-parents=0` returns all of them.

### How git is invoked

Commands run with `LC_ALL=C`, so `isBadRevisionError` isn't defeated by a localised git, and `GIT_TERMINAL_PROMPT=0`, so nothing can block on a prompt. The rest of the environment is inherited.

## Migrating from 0.4

`firstCommitAsync` / `firstCommitSync` are deprecated in favour of `emptyTreeAsync` / `emptyTreeSync`.

They now return the empty tree id rather than the repository's root commit, and ignore `ref`. If you were using them to mean "diff everything" — the case the README recommended them for — that's the same intent, more accurately served, and the call still works. If you were using them to find an actual root commit, run `git rev-list --max-parents=0` yourself.

## License

MIT
