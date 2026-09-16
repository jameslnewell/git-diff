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

On the initial CI/CD run the mutable tag doesn't exist yet and `git diff` will error. Catch that with `Diff.isBaseDoesNotExistError` and fall back to the empty tree, which reports every file as added:

```ts
import * as Diff from '@jameslnewell/git-diff';

const base = 'last-deployment';
const head = 'HEAD';

let diff: Diff.Diff;
try {
  diff = await Diff.diffAsync({base, head});
} catch (error) {
  if (!Diff.isBaseDoesNotExistError(error)) throw error;
  diff = await Diff.diffAsync({base: await Diff.emptyTreeAsync(), head});
}
```

### What a branch changed, vs. how two trees differ

`diffAsync` runs `git diff <base> <head>`, which compares the two **snapshots** those refs point at. It does not replay what happened in between, so a `Status` says how `head` differs from `base` — never what some commit did.

While `base` is an ancestor of `head` the two readings coincide, which is why a mutable tag like `last-deployment` behaves intuitively. They part company as soon as it isn't. Against a `main` that has moved on since your branch forked, a file **`main` added** is reported as `Deleted`, because it is genuinely absent from `head`:

```ts
await Diff.diffAsync({base: 'main', head: 'HEAD'});
// {'on-feature.txt': 'A', 'on-main.txt': 'D'}
```

Neither reading is wrong; they answer different questions. Pick deliberately:

- **"How does `head` differ from what's over there?"** — diff against the ref directly. This is what you want when you are about to make one match the other, such as deploying a branch over an environment.
- **"What did this branch change?"** — diff from `mergeBaseAsync`, the commit the two forked at. It is an ancestor of `head` by construction, so no status is ever reversed.

```ts
import * as Diff from '@jameslnewell/git-diff';

const base = await Diff.mergeBaseAsync({refs: ['origin/main', 'HEAD']});
await Diff.diffAsync({base, head: 'HEAD'});
// {'on-feature.txt': 'A'}
```

Path membership is unaffected either way, so `any` and the `filterByPaths` family are safe under both.

`refs` takes exactly two, in either order. Three or more is deliberately not accepted: plain `git merge-base` privileges its first argument, so `merge-base a b c` and `merge-base c b a` return different commits and the first can be a descendant of the true common ancestor. `--fork-point` is not offered either — it consults the reflog, which a fresh CI checkout does not have, so it would answer differently on a developer's machine and on a build agent.

#### When there is no common ancestor

`mergeBaseAsync` throws when the refs share no ancestor — unrelated histories grafted into one repository, or a clone shallow enough that the fork point was never fetched. Catch it with `Diff.isNoMergeBaseError` and fall back to the empty tree:

```ts
import * as Diff from '@jameslnewell/git-diff';

let base: string;
try {
  base = await Diff.mergeBaseAsync({refs: ['origin/main', 'HEAD']});
} catch (error) {
  // `isRefDoesNotExistError` covers the other common CI case: an
  // `origin/<branch>` that was never fetched
  if (!Diff.isNoMergeBaseError(error) && !Diff.isRefDoesNotExistError(error)) {
    throw error;
  }
  base = await Diff.emptyTreeAsync();
}

const diff = await Diff.diffAsync({base, head: 'HEAD'});
```

It throws rather than returning `undefined` deliberately — see `isNoMergeBaseError` for why, and why that keeps a broken git loud.

### Missing refs

git says which ref it rejected but not which argument that was, so the library matches it against the options the command was built from and reports it:

- `Diff.isBaseDoesNotExistError(error)` — the `base` is missing. This is the one worth recovering from: fall back to the empty tree, as above.
- `Diff.isHeadDoesNotExistError(error)` — the `head` is missing. Almost always a mistake worth surfacing; it exists so it can be told apart from the case above.

Both narrow the error to `{name, code, message, ref}`, where `ref` is the ref that doesn't exist. Both duck-type rather than using `instanceof`, which breaks across dual-package installs, bundler boundaries and module realms.

git names only the _first_ ref it rejected, so `isBaseDoesNotExistError` doesn't imply the head is fine — if both are missing, the retry against the empty tree will say so.

`Diff.isBadRevisionError` is deprecated: it is true for a missing `base` _or_ `head`, so using it to pick a fallback base takes that branch for a typo'd `head` too — then diffs and logs something other than what actually failed.

### The empty tree

`Diff.emptyTreeAsync()` / `Diff.emptyTreeSync()` return the id of git's empty tree — a tree object with no entries. Diffing from it reports **every file in `head` as added**, so it's the base to use when you can't tell what changed and have to assume everything did.

It's git's own device for this: git-log(1) notes that "root commits are compared to an empty tree", and git-config(1) describes `log.showRoot` as "equivalent to a diff against an empty tree".

The id is a hash of the empty tree object, so it depends on which algorithm the repository uses — `4b825dc…` under SHA-1, something else entirely under SHA-256, and `git diff` rejects the wrong one outright. These functions ask the repository (`git rev-parse --show-object-format`, so git 2.29 or newer), which means `cwd` must be inside one — and it must be the **same** repository you pass to the diff, or you'll get a base in the wrong format.

Don't reach for the repository's root commit instead. A root commit is only "nothing" if it's an empty commit, which almost none are — files added in the root and untouched since are missing from the diff, and files deleted since show up as `D`. A repository assembled from several histories (`git merge --allow-unrelated-histories`, or a `filter-repo` consolidation) has more than one root, and `git rev-list --max-parents=0` returns all of them.

### How git is invoked

Commands run with `LC_ALL=C`, so the missing-ref guards aren't defeated by a localised git, and `GIT_TERMINAL_PROMPT=0`, which stops git prompting on the terminal. The rest of the environment is inherited — including `GIT_ASKPASS`/`SSH_ASKPASS` and any configured credential helper, which are not neutralised, though none of the commands run here reach the network.

Paths are read with `core.quotePath=false`, so non-ASCII filenames come back as themselves rather than octal escapes. Paths containing a tab, newline, quote or backslash are still quoted by git and are not currently unquoted.

## Migrating from 0.4

`firstCommitAsync` / `firstCommitSync` are deprecated in favour of `emptyTreeAsync` / `emptyTreeSync`.

They now return the empty tree id rather than the repository's root commit, and ignore `ref`. If you were using them to mean "diff everything" — the case the README recommended them for — that's the same intent, more accurately served, and the call still works. If you were using them to find an actual root commit, run `git rev-list --max-parents=0` yourself.

## Migrating from 0.5

`isBadRevisionError` is deprecated in favour of `isBaseDoesNotExistError` and `isHeadDoesNotExistError`. It still returns `true` for both, so existing calls keep working — but a caller using it to choose a fallback base was also taking that branch for a missing `head`. Swap it for `isBaseDoesNotExistError`.

The thrown error's `code` is now `BASE_DOES_NOT_EXIST` or `HEAD_DOES_NOT_EXIST` rather than `BAD_REVISION`, and carries the `ref`. Code matching on the string `'BAD_REVISION'` directly needs updating.

`isBadRevisionError` narrows `code` to a union of the three values rather than the literal `'BAD_REVISION'`, so an annotation or exhaustive `switch` written against the old literal needs widening.

## License

MIT
