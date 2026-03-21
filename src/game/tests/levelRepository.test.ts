import { describe, expect, it } from 'vitest'
import {
  AUTHORED_BOARD_SIZE,
  buildLevelFromEditableLevel,
  createEmptyEditableLevel,
  deleteLevel,
  editableLevelFromLevel,
  getFirstAvailableCustomSlot,
  getLevel,
  getNextLevelSlot,
  listLevelSummaries,
  saveEditableLevel,
  validateEditableLevel
} from '../data/levelRepository'
import type { LevelData } from '../types/level'

function createMemoryStorage() {
  const values = new Map<string, string>()

  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
    removeItem(key: string) {
      values.delete(key)
    }
  }
}

describe('levelRepository', () => {
  it('builds authored level data from the editor-friendly 10x10 layout', () => {
    const level = buildLevelFromEditableLevel({
      slot: 2,
      name: 'Ice Cavern 02',
      objective: 'Test',
      playerSpawn: { x: 1, y: 2 },
      exit: { x: 8, y: 9 },
      blocks: [{ x: 3, y: 4 }],
      columns: [{ x: 5, y: 6 }],
      enemies: [{ x: 7, y: 1 }]
    })

    expect(level.width).toBe(AUTHORED_BOARD_SIZE)
    expect(level.height).toBe(AUTHORED_BOARD_SIZE)
    expect(level.playerSpawn).toEqual({ x: 2, y: 3 })
    expect(level.goals[0]).toEqual({ x: 9, y: 10 })
    expect(level.blocks[0]).toEqual({ x: 4, y: 5 })
    expect(level.enemies[0]).toEqual({ type: 'basic', x: 8, y: 2 })
    expect(level.walls).toContainEqual({ x: 6, y: 7 })
    expect(level.walls).toContainEqual({ x: 0, y: 0 })
    expect(level.walls).toContainEqual({ x: 11, y: 11 })
  })

  it('round-trips authored level data back into editor coordinates', () => {
    const authoredLevel: LevelData = {
      name: 'Round Trip',
      tileSize: 64,
      width: 12,
      height: 12,
      par: 1,
      objective: 'Test',
      playerSpawn: { x: 5, y: 6 },
      blocks: [{ x: 3, y: 4 }],
      enemies: [{ type: 'basic', x: 7, y: 2 }],
      goals: [{ x: 10, y: 9 }],
      walls: [{ x: 0, y: 0 }, { x: 11, y: 11 }, { x: 6, y: 7 }]
    }

    const editable = editableLevelFromLevel(4, authoredLevel)
    expect(editable.slot).toBe(4)
    expect(editable.playerSpawn).toEqual({ x: 4, y: 5 })
    expect(editable.exit).toEqual({ x: 9, y: 8 })
    expect(editable.blocks).toEqual([{ x: 2, y: 3 }])
    expect(editable.enemies).toEqual([{ x: 6, y: 1 }])
    expect(editable.columns).toEqual([{ x: 5, y: 6 }])
  })

  it('persists custom maps, keeps map 01 undeletable, and finds the next playable slot', () => {
    const storage = createMemoryStorage()
    const customMap02 = {
      ...createEmptyEditableLevel(2),
      playerSpawn: { x: 1, y: 1 },
      exit: { x: 8, y: 8 },
      enemies: [{ x: 4, y: 4 }]
    }
    const customMap05 = {
      ...createEmptyEditableLevel(5),
      playerSpawn: { x: 2, y: 2 },
      exit: { x: 7, y: 7 },
      blocks: [{ x: 3, y: 3 }]
    }

    saveEditableLevel(customMap02, storage)
    saveEditableLevel(customMap05, storage)

    expect(getLevel(2, storage)?.name).toBe('Ice Cavern 02')
    expect(listLevelSummaries(storage).map((summary) => summary.slot)).toEqual([1, 2, 5])
    expect(getNextLevelSlot(1, storage)).toBe(2)
    expect(getNextLevelSlot(2, storage)).toBe(5)
    expect(getFirstAvailableCustomSlot(storage)).toBe(3)
    expect(deleteLevel(1, storage)).toBe(false)
    expect(deleteLevel(5, storage)).toBe(true)
    expect(listLevelSummaries(storage).map((summary) => summary.slot)).toEqual([1, 2])
  })

  it('requires both a player start and an exit before a map can be saved', () => {
    const emptyMap = createEmptyEditableLevel(2)
    expect(validateEditableLevel(emptyMap)).toEqual([
      'Add one player start position before saving.',
      'Add one exit before saving.'
    ])

    expect(validateEditableLevel({
      ...emptyMap,
      playerSpawn: { x: 1, y: 1 }
    })).toEqual(['Add one exit before saving.'])

    expect(validateEditableLevel({
      ...emptyMap,
      exit: { x: 8, y: 8 }
    })).toEqual(['Add one player start position before saving.'])
  })
})
