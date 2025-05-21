

import {suite, test} from 'node:test'
import {deepEqual} from 'node:assert/strict'
import {Diff, diffAsync} from './diff.ts'

const stdout =
`
A       .editorconfig
M       .gitignore
D       package-lock.json
A       package.json
M       src/Diff.ts
A       tsconfig.json
`


suite(Diff.name, () => {
  suite('.filter()', () => {
    test('filter by status', () => {
      const diff = new Diff([
        ['.editorconfig', 'A'],
        ['.gitignore', 'M'],
        ['package-lock.json', 'D'],
        ['package.json', 'A'],
        ['src/Diff.ts', 'M'],
        ['tsconfig.json', 'A'],
      ]);

      const added = diff.filter({statuses: ['A']});

      deepEqual(Array.from(added.entries()), [
        ['.editorconfig', 'A'],
        ['package.json', 'A'],
        ['tsconfig.json', 'A'],
      ]);

      const modifiedDiff = diff.filter({statuses: ['M']});

      deepEqual(Array.from(modifiedDiff.entries()), [
        ['.gitignore', 'M'],
        ['src/Diff.ts', 'M'],
      ]);
    });

    test('filter by path', () => {
      const diff = new Diff([
        ['.editorconfig', 'A'],
        ['.gitignore', 'M'],
        ['package-lock.json', 'D'],
        ['package.json', 'A'],
        ['src/Diff.ts', 'M'],
        ['tsconfig.json', 'A'],
      ]);

      const jsonDiff = diff.filter({paths: ['*.json']});

      deepEqual(Array.from(jsonDiff.entries()), [
        ['package-lock.json', 'D'],
        ['package.json', 'A'],
        ['tsconfig.json', 'A'],
      ]);
    });

    test('filter by path and status', () => {
      const diff = new Diff([
        ['.editorconfig', 'A'],
        ['.gitignore', 'M'],
        ['package-lock.json', 'D'],
        ['package.json', 'A'],
        ['src/Diff.ts', 'M'],
        ['tsconfig.json', 'A'],
      ]);

      const addedJson = diff.filter({paths: ['*.json'], statuses: ['A']});

      deepEqual(Array.from(addedJson.entries()), [
        ['package.json', 'A'],
        ['tsconfig.json', 'A'],
      ]);
    });

    test('filter with no matches', () => {
      const diff = new Diff([
        ['.editorconfig', 'A'],
        ['.gitignore', 'M'],
      ]);

      const result = diff.filter({paths: ['*.md'], statuses: ['D']});

      deepEqual(Array.from(result.entries()), []);
    });
  })
  suite('.contains()', () => {
    test('contains path', () => {
      const diff = new Diff([
        ['.editorconfig', 'A'],
        ['.gitignore', 'M'],
      ]);

      const result = diff.contains({paths: ['.gitignore']});

      deepEqual(result, true);
    });

    test('does not contain path', () => {
      const diff = new Diff([
        ['.editorconfig', 'A'],
        ['.gitignore', 'M'],
      ]);

      const result = diff.contains({paths: ['README.md']});

      deepEqual(result, false);
    });
  })
});

const d = new Diff([
  ['.editorconfig', 'A'],
  ['.gitignore', 'M'],
  ['package-lock.json', 'D'],
  ['package.json', 'A'],
  ['src/Diff.ts', 'M'],
])

test('diffAsync()', async () => {
  const x = await diffAsync({
    head: 'main',
    base: 'xxx',
  })
  console.log(x)
})
