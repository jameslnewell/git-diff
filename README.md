# @jameslnewell/git-diff

A Node.js library for running `git diff` and parsing the results in TypeScript.

## Installation

```sh
npm install @jameslnewell/git-diff
```

## Usage

### Async Diff

```typescript
import { diffAsync } from '@jameslnewell/git-diff';

const diff = await diffAsync({
  base: 'main',
  head: 'feature-branch',
  paths: ['src/']
});

if (diff.contains({
  paths: ['prisma/*'],
  statuses: ['A', 'M']
})) {
  // do something e.g. prisma generate && prisma migrate
}
```

### Sync Diff

```typescript
import { diffSync } from '@jameslnewell/git-diff';

const diff = diffSync({
  base: 'main',
  head: 'feature-branch',
  paths: ['src/']
});

if (diff.contains({
  paths: ['prisma/*'],
  statuses: ['A', 'M']
})) {
  // do something e.g. prisma generate && prisma migrate
}
```

### Diff Options

- `cwd` (string): The current working directory
- `base` (string): The base commit or branch to compare from.
- `head` (string): The head commit or branch to compare to.
- `paths` (string[]): Optional list of file or directory paths to limit the diff.

## License

MIT
