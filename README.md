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

### Async Diff

```typescript
import { diffAsync } from '@jameslnewell/git-diff';

const diff = await diffAsync({
  base: 'main',
  head: 'feature-branch',
});

const match = diff.match('prisma/*')

if (match.added || match.modified) {
  // do something
  // e.g. prisma generate && prisma migrate
}
```

### Sync Diff

```typescript
import { diffSync } from '@jameslnewell/git-diff';

const diff = diffSync({
  base: 'main',
  head: 'feature-branch',
});

const match = diff.match('prisma/*')

if (match.added || match.modified) {
  // do something
  // e.g. prisma generate && prisma migrate
}
```

### Handling a non-existent `base`

A common use case is diffing against a mutable tag on CI/CD.
```ts
import { diffAsync } from '@jameslnewell/git-diff';

const diff = await diffAsync({
  base: 'last-deployment',
  head: 'HEAD',
});
```

On the initial CI/CD run the mutable tag may not yet exist and `git diff` will error.

In order to handle this case its recommended you diff against the first commit instead.

```ts
import { Diff, diffAsync, firstCommitAsync } from '@jameslnewell/git-diff';

const base = 'last-deployment'
const head = 'HEAD'

let diff: Diff
try {
  diff = await diffAsync({
    base,
    head,
  });
} catch (error) {
  if (error.code === 'BAD_REVISION') {
    diff = await diffAsync({
      base: await firstCommitAsync({ref: head}),
      head,
    });
  } else {
    throw error
  }
}

```

## License

MIT
