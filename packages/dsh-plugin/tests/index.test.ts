import { describe, expect, it } from 'vitest'
import { apply, name } from '../src/index.js'

describe('@memlens/dsh-plugin', () => {
  it('uses the plugin identifier dsh-memlens', () => {
    expect(name).toBe('dsh-memlens')
  })

  it('exports apply as a function', () => {
    expect(typeof apply).toBe('function')
  })
})
