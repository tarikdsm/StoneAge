import { describe, expect, it } from 'vitest'
import {
  PLAYABLE_AREA_HEIGHT,
  PLAYABLE_AREA_WIDTH,
  RUNTIME_BOARD_HEIGHT,
  RUNTIME_BOARD_WIDTH,
  createRuntimeBorderWalls,
  hasCanonicalRuntimeBoardSize,
  isInsidePlayableArea,
  isInsideRuntimeBoard,
  isInsideRuntimePlayableArea,
  isRuntimeBorderWall,
  toPlayableAreaPoint,
  toRuntimeBoardPoint
} from '../utils/boardGeometry'

describe('boardGeometry', () => {
  it('defines the canonical 10x10 playable area inside a 12x12 runtime board', () => {
    expect(PLAYABLE_AREA_WIDTH).toBe(10)
    expect(PLAYABLE_AREA_HEIGHT).toBe(10)
    expect(RUNTIME_BOARD_WIDTH).toBe(12)
    expect(RUNTIME_BOARD_HEIGHT).toBe(12)
    expect(hasCanonicalRuntimeBoardSize(12, 12)).toBe(true)
    expect(hasCanonicalRuntimeBoardSize(10, 10)).toBe(false)
  })

  it('converts points between editor and runtime coordinate spaces', () => {
    expect(toRuntimeBoardPoint({ x: 0, y: 0 })).toEqual({ x: 1, y: 1 })
    expect(toRuntimeBoardPoint({ x: 9, y: 9 })).toEqual({ x: 10, y: 10 })
    expect(toPlayableAreaPoint({ x: 1, y: 1 })).toEqual({ x: 0, y: 0 })
    expect(toPlayableAreaPoint({ x: 10, y: 10 })).toEqual({ x: 9, y: 9 })
  })

  it('keeps the fixed outer border outside the playable runtime interior', () => {
    expect(isInsidePlayableArea({ x: 0, y: 0 })).toBe(true)
    expect(isInsidePlayableArea({ x: 9, y: 9 })).toBe(true)
    expect(isInsidePlayableArea({ x: 10, y: 9 })).toBe(false)

    expect(isInsideRuntimeBoard({ x: 0, y: 0 })).toBe(true)
    expect(isInsideRuntimeBoard({ x: 11, y: 11 })).toBe(true)
    expect(isInsideRuntimeBoard({ x: 12, y: 11 })).toBe(false)

    expect(isInsideRuntimePlayableArea({ x: 1, y: 1 })).toBe(true)
    expect(isInsideRuntimePlayableArea({ x: 10, y: 10 })).toBe(true)
    expect(isInsideRuntimePlayableArea({ x: 0, y: 1 })).toBe(false)
    expect(isRuntimeBorderWall({ x: 0, y: 7 })).toBe(true)
    expect(isRuntimeBorderWall({ x: 6, y: 6 })).toBe(false)
  })

  it('creates the full fixed border wall ring for the runtime board', () => {
    const borderWalls = createRuntimeBorderWalls()
    expect(borderWalls).toHaveLength(44)
    expect(borderWalls).toContainEqual({ x: 0, y: 0 })
    expect(borderWalls).toContainEqual({ x: 11, y: 11 })
    expect(borderWalls).toContainEqual({ x: 0, y: 6 })
    expect(borderWalls).toContainEqual({ x: 6, y: 11 })
  })
})
