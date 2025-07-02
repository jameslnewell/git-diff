import {suite, test} from 'node:test'
import { rejects, throws} from 'node:assert/strict'
import {diffAsync, diffSync, firstCommitAsync, firstCommitSync, } from './diff.ts'
import { equal } from 'node:assert'

suite(diffAsync.name, () => {
  test('throws for bad revision', async () => {
    await rejects(() => diffAsync({
      cwd: import.meta.dirname,
      base: 'non-existent-ref',
      head: 'HEAD',
    }), {
      name: 'GitDiffError',
      code: 'BAD_REVISION',
      message: 'The ref does not exist: non-existent-ref',
    })
  })

  test('since initial commit', async () => {
    const diff = await diffAsync({
      cwd: import.meta.dirname,
      base: 'e740b69fbf63d6e76af21efa4c356483ebf5b2f4',
      head: 'HEAD',
    })

    const paths = Array.from(diff.paths())
    equal(paths.includes('README.md'), true)
    equal(paths.includes('package.json'), true)
    equal(paths.includes('src/Diff.ts'), true)
  })

})

suite(diffSync.name, () => {
    test('throws for bad revision', () => {
    throws(() => diffSync({
      cwd: import.meta.dirname,
      base: 'non-existent-ref',
      head: 'HEAD',
    }), {
      name: 'GitDiffError',
      code: 'BAD_REVISION',
      message: 'The ref does not exist: non-existent-ref',
    })
  })

  test('since initial commit', () => {
    const diff = diffSync({
      cwd: import.meta.dirname,
      base: 'e740b69fbf63d6e76af21efa4c356483ebf5b2f4',
      head: 'HEAD',
    })

    const paths = Array.from(diff.paths())
    equal(paths.includes('README.md'), true)
    equal(paths.includes('package.json'), true)
    equal(paths.includes('src/Diff.ts'), true)
  })

})

suite(firstCommitAsync.name, () => {
  test('returns the first commit', async () => {
    const commit = await firstCommitAsync()
    equal(commit, 'e740b69fbf63d6e76af21efa4c356483ebf5b2f4')
  })
})

suite(firstCommitSync.name, () => {
  test('returns the first commit', () => {
    const commit = firstCommitSync()
    equal(commit, 'e740b69fbf63d6e76af21efa4c356483ebf5b2f4')
  })
})
