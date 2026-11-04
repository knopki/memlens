#!/usr/bin/env node
/**
 * The CLI frontend of memlens.
 *
 * The CLI gives the library functions to a user in a terminal. There are no
 * commands yet, because the product function is still open. See
 * docs/spec/02-requirements.md, requirement REQ-002.
 */
import { pathToFileURL } from 'node:url'
import { NAME } from '@memlens/core'

const USAGE = `Usage: ${NAME} <command>

There are no commands yet. The specification is in docs/spec/.`

/** Run one command line. Return the exit code. */
export function main(argv: readonly string[]): number {
  const first = argv[0]

  if (first === undefined) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }

  process.stderr.write(`Unknown command: ${first}\n\n${USAGE}\n`)
  return 1
}

const entry = process.argv[1]

if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = main(process.argv.slice(2))
}
