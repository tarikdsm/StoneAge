import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildLevelFromEditableLevel,
  buildMapSlotFileFromEditableLevel,
  createEmptyEditableLevel,
  createEmptyMapSlotFile,
  editableLevelFromLevel,
  getFirstAvailableCustomSlot,
  getMapPublishingMode,
  getNextLevelSlot,
  listLevelSummaries,
  parseMapSlotFileText,
  publishMapSlotFile,
  requiresGitHubTokenForMapPublishing,
  serializeMapSlotFile,
  validateEditableLevel,
  validateMapSlotFileData
} from '../data/levelRepository'
import type { EditableLevelData } from '../types/editor'
import type { LevelData } from '../types/level'
import type { FilledMapSlotFile, MapSlotFile } from '../types/mapFile'
import { PLAYABLE_AREA_LABEL, RUNTIME_BOARD_HEIGHT, RUNTIME_BOARD_WIDTH, createRuntimeBorderWalls } from '../utils/boardGeometry'

function createPublishedMap(slot: number, overrides: Partial<EditableLevelData> = {}): FilledMapSlotFile {
  return buildMapSlotFileFromEditableLevel({
    ...createEmptyEditableLevel(slot),
    playerSpawn: { x: 1, y: 1 },
    ...overrides
  })
}

function createFetchStub(overrides: Map<number, MapSlotFile>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    const match = url.match(/map(\d{2})\.json/i)

    if (!match) {
      return new Response('Not found', { status: 404 })
    }

    const slot = Number(match[1])
    const file = overrides.get(slot) ?? (slot === 1 ? createPublishedMap(1) : createEmptyMapSlotFile(slot))
    return new Response(JSON.stringify(file), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  })
}

describe('levelRepository', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('builds canonical 12x12 runtime level data from the editor-friendly 10x10 layout', () => {
    const level = buildLevelFromEditableLevel({
      slot: 2,
      name: 'Ice Cavern 02',
      objective: 'Test',
      playerSpawn: { x: 1, y: 2 },
      blocks: [{ x: 3, y: 4 }],
      columns: [{ x: 5, y: 6 }],
      enemies: [{ x: 7, y: 1 }]
    })

    expect(level.width).toBe(RUNTIME_BOARD_WIDTH)
    expect(level.height).toBe(RUNTIME_BOARD_HEIGHT)
    expect(level.playerSpawn).toEqual({ x: 2, y: 3 })
    expect(level.blocks[0]).toEqual({ x: 4, y: 5 })
    expect(level.enemies[0]).toEqual({ type: 'basic', x: 8, y: 2 })
    expect(level.walls).toContainEqual({ x: 6, y: 7 })
    expect(level.walls).toContainEqual({ x: 0, y: 0 })
    expect(level.walls).toContainEqual({ x: 11, y: 11 })
  })

  it('round-trips canonical runtime level data back into editor coordinates', () => {
    const authoredLevel: LevelData = {
      name: 'Round Trip',
      tileSize: 64,
      width: RUNTIME_BOARD_WIDTH,
      height: RUNTIME_BOARD_HEIGHT,
      par: 1,
      objective: 'Test',
      playerSpawn: { x: 5, y: 6 },
      blocks: [{ x: 3, y: 4 }],
      enemies: [{ type: 'basic', x: 7, y: 2 }],
      walls: [...createRuntimeBorderWalls(), { x: 6, y: 7 }]
    }

    const editable = editableLevelFromLevel(4, authoredLevel)
    expect(editable.slot).toBe(4)
    expect(editable.playerSpawn).toEqual({ x: 4, y: 5 })
    expect(editable.blocks).toEqual([{ x: 2, y: 3 }])
    expect(editable.enemies).toEqual([{ x: 6, y: 1 }])
    expect(editable.columns).toEqual([{ x: 5, y: 6 }])
  })

  it('serializes and parses published map slot files safely', () => {
    const file = createPublishedMap(7, {
      blocks: [{ x: 3, y: 3 }],
      columns: [{ x: 5, y: 5 }],
      enemies: [{ x: 7, y: 2 }]
    })

    const serialized = serializeMapSlotFile(file)
    const parsed = parseMapSlotFileText(serialized)

    expect(parsed.errors).toEqual([])
    expect(parsed.value).toEqual(file)
  })

  it('rejects malformed slot files with unexpected fields or invalid slot content', () => {
    const extraFieldResult = validateMapSlotFileData({
      type: 'stoneage-map-slot',
      version: 2,
      slot: 2,
      empty: true,
      injected: 'nope'
    })
    expect(extraFieldResult.value).toBeUndefined()
    expect(extraFieldResult.errors[0]).toContain('expected slot-file fields')

    const emptyMap01Result = validateMapSlotFileData({
      type: 'stoneage-map-slot',
      version: 2,
      slot: 1,
      empty: true
    })
    expect(emptyMap01Result.value).toBeUndefined()
    expect(emptyMap01Result.errors).toContain('Map 01 cannot be an empty slot.')

    const invalidJsonResult = parseMapSlotFileText('{ not-json }')
    expect(invalidJsonResult.value).toBeUndefined()
    expect(invalidJsonResult.errors).toEqual(['The uploaded file is not valid JSON.'])
  })

  it('enforces the canonical runtime geometry on published slot files', () => {
    const baseFile = createPublishedMap(8)

    const wrongSizeResult = validateMapSlotFileData({
      ...baseFile,
      level: {
        ...baseFile.level,
        width: 11
      }
    })
    expect(wrongSizeResult.value).toBeUndefined()
    expect(wrongSizeResult.errors).toContain(`level.width must be ${RUNTIME_BOARD_WIDTH}.`)

    const borderSpawnResult = validateMapSlotFileData({
      ...baseFile,
      level: {
        ...baseFile.level,
        playerSpawn: { x: 0, y: 1 }
      }
    })
    expect(borderSpawnResult.value).toBeUndefined()
    expect(borderSpawnResult.errors).toContain(
      `level.playerSpawn must stay inside the ${PLAYABLE_AREA_LABEL} playable runtime interior.`
    )
  })

  it('loads published slots, lists non-empty maps, and finds the next available campaign slot', async () => {
    vi.stubGlobal('fetch', createFetchStub(new Map([
      [2, createPublishedMap(2, { enemies: [{ x: 4, y: 4 }] })],
      [5, createPublishedMap(5, { blocks: [{ x: 3, y: 3 }] })]
    ])))

    const summaries = await listLevelSummaries(true)
    expect(summaries.map((summary) => summary.slot)).toEqual([1, 2, 5])
    expect(summaries.map((summary) => summary.published)).toEqual([true, true, true])
    expect(await getNextLevelSlot(1, true)).toBe(2)
    expect(await getNextLevelSlot(2, true)).toBe(5)
    expect(await getFirstAvailableCustomSlot(true)).toBe(3)
  })

  it('writes map slot files locally on localhost without requiring a GitHub token', async () => {
    const file = createPublishedMap(4, {
      blocks: [{ x: 3, y: 3 }]
    })
    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost'
      }
    })
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

      expect(url).toContain('__stoneage_local_maps/map04.json')
      expect(init?.method).toBe('PUT')
      expect(init?.body).toContain('"slot": 4')

      return new Response(JSON.stringify(file), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    expect(getMapPublishingMode()).toBe('local')
    expect(requiresGitHubTokenForMapPublishing()).toBe(false)
    await expect(publishMapSlotFile(file)).resolves.toEqual(file)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('requires a GitHub token when publishing outside localhost mode', async () => {
    await expect(publishMapSlotFile(createPublishedMap(6))).rejects.toThrow(
      'Publishing on the hosted site requires a GitHub token with repository write access.'
    )
  })

  it('requires a player start before a map can be saved, but no longer requires an exit', () => {
    const emptyMap = createEmptyEditableLevel(2)
    expect(validateEditableLevel(emptyMap)).toEqual([
      'Add one player start position before saving.'
    ])

    expect(validateEditableLevel({
      ...emptyMap,
      playerSpawn: { x: 1, y: 1 }
    })).toEqual([])
  })

  it('keeps the published map catalog aligned to the canonical geometry contract', async () => {
    const layoutSignatures = new Set<string>()
    const enemyCounts: number[] = []
    const blockCounts: number[] = []
    const columnCounts: number[] = []
    const borderWallCount = createRuntimeBorderWalls().length

    for (let slot = 1; slot <= 99; slot += 1) {
      const fileName = `map${String(slot).padStart(2, '0')}.json`
      const fileUrl = new URL(`../../../public/maps/${fileName}`, import.meta.url)
      const parsed = parseMapSlotFileText(await readFile(fileUrl, 'utf8'))

      expect(parsed.errors).toEqual([])
      expect(parsed.value?.slot).toBe(slot)
      expect(parsed.value?.empty).toBe(false)

      if (parsed.value && !parsed.value.empty) {
        expect(parsed.value.level.width).toBe(RUNTIME_BOARD_WIDTH)
        expect(parsed.value.level.height).toBe(RUNTIME_BOARD_HEIGHT)
        expect(Object.prototype.hasOwnProperty.call(parsed.value.level, 'goals')).toBe(false)

        const signature = JSON.stringify({
          player: parsed.value.level.playerSpawn,
          blocks: parsed.value.level.blocks,
          enemies: parsed.value.level.enemies,
          walls: parsed.value.level.walls
        })
        expect(layoutSignatures.has(signature)).toBe(false)
        layoutSignatures.add(signature)

        enemyCounts.push(parsed.value.level.enemies.length)
        blockCounts.push(parsed.value.level.blocks.length)
        columnCounts.push((parsed.value.level.walls?.length ?? 0) - borderWallCount)
      }
    }

    expect(layoutSignatures.size).toBe(99)
    expect(Math.max(...enemyCounts.slice(0, 10))).toBeLessThanOrEqual(3)
    expect(Math.min(...enemyCounts.slice(85))).toBeGreaterThanOrEqual(7)
    expect(Math.max(...columnCounts.slice(0, 10))).toBeLessThanOrEqual(5)
    expect(Math.min(...columnCounts.slice(85))).toBeGreaterThanOrEqual(10)
    expect(Math.max(...blockCounts.slice(0, 10))).toBeLessThanOrEqual(7)
    expect(Math.min(...blockCounts.slice(85))).toBeGreaterThanOrEqual(10)
  })
})
