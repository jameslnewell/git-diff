import { suite, test } from 'node:test'
import {Diff, Status} from './diff.ts'
import { deepEqual, equal } from 'node:assert'

const diff = new Diff([
  ['package.json', Status.Unknown],
  ['src/main.ts', Status.Added],
  ['src/index.ts', Status.Deleted],
  ['src/utils.ts', Status.Modified],
  ['src/utils.test.ts', Status.Renamed],
  ['tsconfig.json', Status.Unknown],
])

suite(Diff.name, () => {

  suite('.count()', () => {
    test('returns the number of files in the diff', () => {
      equal(diff.size(), 6)
    })
  })

  suite('.paths()', () => {
    test('returns the paths in the diff', () => {
      deepEqual(Array.from(diff.paths()), [
        'package.json',
        'src/main.ts',
        'src/index.ts',
        'src/utils.ts',
        'src/utils.test.ts',
        'tsconfig.json',
      ])
    })
  })

  suite('.statuses()', () => {
    test('returns the number of files in the diff', () => {
      deepEqual(Array.from(diff.statuses()), [
        Status.Unknown,
        Status.Added,
        Status.Deleted,
        Status.Modified,
        Status.Renamed,
        Status.Unknown,
      ])
    })
  })

  suite('.match()', () => {
    test('.added', () => {
      const match = diff.match('src/main.ts')
      equal(match.added, true)
      equal(match.changed, false)
      equal(match.deleted, false)
      equal(match.modified, false)
      equal(match.renamed, false)
      equal(match.unknown, false)
    })

    test('.deleted', () => {
      const match = diff.match('src/index.ts')
      equal(match.added, false)
      equal(match.changed, false)
      equal(match.deleted, true)
      equal(match.modified, false)
      equal(match.renamed, false)
      equal(match.unknown, false)
    })

    test('.modified', () => {
      const match = diff.match('src/utils.ts')
      equal(match.added, false)
      equal(match.changed, false)
      equal(match.deleted, false)
      equal(match.modified, true)
      equal(match.renamed, false)
      equal(match.unknown, false)
    })

    test('.renamed', () => {
      const match = diff.match('src/utils.test.ts')
      equal(match.added, false)
      equal(match.changed, false)
      equal(match.deleted, false)
      equal(match.modified, false)
      equal(match.renamed, true)
      equal(match.unknown, false)
    })

    test('.unknown', () => {
      const match = diff.match('tsconfig.json')
      equal(match.added, false)
      equal(match.changed, false)
      equal(match.deleted, false)
      equal(match.modified, false)
      equal(match.renamed, false)
      equal(match.unknown, true)
    })

  })
})
