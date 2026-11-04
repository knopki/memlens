import { describe, expect, it } from 'vitest'
import { NAME } from '../src/index.js'

describe('@memlens/core', () => {
  it('exports the product name', () => {
    expect(NAME).toBe('memlens')
  })
})
