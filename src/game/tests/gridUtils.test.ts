import { describe, expect, it } from 'vitest'
import { addPoints, samePoint } from '../utils/grid'

describe('grid helpers', () => {
  it('adds points correctly', () => {
    expect(addPoints({ x: 2, y: 3 }, { x: -1, y: 4 })).toEqual({ x: 1, y: 7 })
  })

  it('compares points correctly', () => {
    expect(samePoint({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(true)
    expect(samePoint({ x: 1, y: 1 }, { x: 1, y: 2 })).toBe(false)
  })
})
