import { describe, expect, it } from 'vitest'
import { main } from '../src/cli.js'

describe('@memlens/cli', () => {
  it('gives the exit code 0 without a command', () => {
    expect(main([])).toBe(0)
  })

  it('gives the exit code 1 for an unknown command', () => {
    expect(main(['nope'])).toBe(1)
  })
})
