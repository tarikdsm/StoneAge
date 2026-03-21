import level01 from './levels/level01.json'
import type { EditableLevelData, LevelSummary } from '../types/editor'
import type { EnemyDefinition, GridPoint, LevelData } from '../types/level'

const STORAGE_KEY = 'stoneage:custom-levels:v1'
const DEFAULT_LEVELS: Record<number, LevelData> = {
  1: level01 as LevelData
}

export const MAP_MIN_SLOT = 1
export const MAP_MAX_SLOT = 99
export const PLAYABLE_GRID_SIZE = 10
export const BOARD_BORDER_SIZE = 1
export const AUTHORED_BOARD_SIZE = PLAYABLE_GRID_SIZE + BOARD_BORDER_SIZE * 2
export const DEFAULT_TILE_SIZE = 64

type StoredLevels = Record<string, LevelData>

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * Pure/browser-friendly level repository.
 *
 * - default content ships from JSON
 * - authored custom maps persist through localStorage
 * - gameplay scenes consume `LevelData`
 * - the editor consumes `EditableLevelData`
 */
export function listLevelSummaries(storage?: StorageLike): LevelSummary[] {
  const customLevels = readStoredLevels(storage)
  const slots = new Set<number>([...Object.keys(DEFAULT_LEVELS).map(Number), ...Object.keys(customLevels).map(Number)])

  return [...slots]
    .filter((slot) => Number.isFinite(slot))
    .sort((a, b) => a - b)
    .map((slot) => {
      const level = customLevels[String(slot)] ?? DEFAULT_LEVELS[slot]
      return {
        slot,
        name: level?.name ?? formatLevelName(slot),
        deletable: slot !== 1 && Boolean(customLevels[String(slot)]),
        existsInStorage: Boolean(customLevels[String(slot)])
      }
    })
}

export function getLevel(slot: number, storage?: StorageLike): LevelData | undefined {
  const safeSlot = sanitizeSlot(slot)
  const customLevels = readStoredLevels(storage)
  return customLevels[String(safeSlot)] ?? DEFAULT_LEVELS[safeSlot]
}

export function hasLevel(slot: number, storage?: StorageLike): boolean {
  return Boolean(getLevel(slot, storage))
}

export function getNextLevelSlot(slot: number, storage?: StorageLike): number | undefined {
  const currentSlot = sanitizeSlot(slot)
  return listLevelSummaries(storage)
    .map((summary) => summary.slot)
    .find((candidate) => candidate > currentSlot)
}

export function createEmptyEditableLevel(slot = 2): EditableLevelData {
  const safeSlot = sanitizeSlot(slot)
  return {
    slot: safeSlot,
    name: formatLevelName(safeSlot),
    objective: 'Crush every raider with the blocks, then reach the exit.',
    blocks: [],
    columns: [],
    enemies: []
  }
}

export function editableLevelFromLevel(slot: number, level: LevelData): EditableLevelData {
  return {
    slot: sanitizeSlot(slot),
    name: level.name,
    objective: level.objective,
    playerSpawn: toPlayablePoint(level.playerSpawn),
    exit: level.goals[0] ? toPlayablePoint(level.goals[0]) : undefined,
    blocks: level.blocks.map(toPlayablePoint),
    columns: (level.walls ?? []).filter((wall) => !isBorderWall(wall)).map(toPlayablePoint),
    enemies: level.enemies.map(toPlayablePoint)
  }
}

export function buildLevelFromEditableLevel(editable: EditableLevelData): LevelData {
  const validationError = validateEditableLevel(editable)[0]
  if (validationError) {
    throw new Error(validationError)
  }

  return {
    name: editable.name,
    tileSize: DEFAULT_TILE_SIZE,
    width: AUTHORED_BOARD_SIZE,
    height: AUTHORED_BOARD_SIZE,
    par: Math.max(1, Math.ceil((editable.enemies.length + editable.blocks.length) / 3)),
    objective: editable.objective,
    playerSpawn: toBoardPoint(editable.playerSpawn as GridPoint),
    blocks: editable.blocks.map(toBoardPoint),
    enemies: editable.enemies.map((enemy) => ({
      type: 'basic',
      ...toBoardPoint(enemy)
    })) as EnemyDefinition[],
    goals: [toBoardPoint(editable.exit as GridPoint)],
    walls: [...createBorderWalls(), ...editable.columns.map(toBoardPoint)]
  }
}

export function saveEditableLevel(editable: EditableLevelData, storage?: StorageLike): LevelData {
  const safeSlot = sanitizeSlot(editable.slot)
  const level = buildLevelFromEditableLevel({
    ...editable,
    slot: safeSlot,
    name: editable.name.trim() || formatLevelName(safeSlot),
    objective: editable.objective.trim() || 'Crush every raider with the blocks, then reach the exit.'
  })
  const customLevels = readStoredLevels(storage)
  customLevels[String(safeSlot)] = level
  writeStoredLevels(customLevels, storage)
  return level
}

export function deleteLevel(slot: number, storage?: StorageLike): boolean {
  const safeSlot = sanitizeSlot(slot)
  if (safeSlot === 1) {
    return false
  }

  const customLevels = readStoredLevels(storage)
  if (!customLevels[String(safeSlot)]) {
    return false
  }

  delete customLevels[String(safeSlot)]
  writeStoredLevels(customLevels, storage)
  return true
}

export function getFirstAvailableCustomSlot(storage?: StorageLike): number {
  const taken = new Set(listLevelSummaries(storage).map((summary) => summary.slot))
  for (let slot = 2; slot <= MAP_MAX_SLOT; slot += 1) {
    if (!taken.has(slot)) {
      return slot
    }
  }

  return MAP_MAX_SLOT
}

export function validateEditableLevel(editable: EditableLevelData): string[] {
  const errors: string[] = []
  const slot = sanitizeSlot(editable.slot)

  if (slot < MAP_MIN_SLOT || slot > MAP_MAX_SLOT) {
    errors.push('Choose a map number between 1 and 99.')
  }

  if (!editable.playerSpawn) {
    errors.push('Add one player start position before saving.')
  }

  if (!editable.exit) {
    errors.push('Add one exit before saving.')
  }

  if (editable.playerSpawn && !isInsidePlayableGrid(editable.playerSpawn)) {
    errors.push('Player start must stay inside the 10x10 playable area.')
  }

  if (editable.exit && !isInsidePlayableGrid(editable.exit)) {
    errors.push('Exit must stay inside the 10x10 playable area.')
  }

  for (const list of [editable.blocks, editable.columns, editable.enemies]) {
    for (const point of list) {
      if (!isInsidePlayableGrid(point)) {
        errors.push('All placed tiles must stay inside the 10x10 playable area.')
        break
      }
    }
  }

  return errors
}

export function sanitizeSlot(slot: number): number {
  return Math.min(MAP_MAX_SLOT, Math.max(MAP_MIN_SLOT, Math.round(slot)))
}

export function formatLevelLabel(slot: number): string {
  return `Map ${String(sanitizeSlot(slot)).padStart(2, '0')}`
}

export function formatLevelName(slot: number): string {
  return `Ice Cavern ${String(sanitizeSlot(slot)).padStart(2, '0')}`
}

export function createBrowserStorage(): StorageLike | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
  } catch {
    return undefined
  }

  return undefined
}

function readStoredLevels(storage?: StorageLike): StoredLevels {
  const activeStorage = storage ?? createBrowserStorage()
  if (!activeStorage) {
    return {}
  }

  const raw = activeStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as StoredLevels
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function writeStoredLevels(levels: StoredLevels, storage?: StorageLike): void {
  const activeStorage = storage ?? createBrowserStorage()
  if (!activeStorage) {
    return
  }

  if (Object.keys(levels).length === 0) {
    activeStorage.removeItem(STORAGE_KEY)
    return
  }

  activeStorage.setItem(STORAGE_KEY, JSON.stringify(levels))
}

function createBorderWalls(): GridPoint[] {
  const walls: GridPoint[] = []

  for (let x = 0; x < AUTHORED_BOARD_SIZE; x += 1) {
    walls.push({ x, y: 0 })
    walls.push({ x, y: AUTHORED_BOARD_SIZE - 1 })
  }

  for (let y = 1; y < AUTHORED_BOARD_SIZE - 1; y += 1) {
    walls.push({ x: 0, y })
    walls.push({ x: AUTHORED_BOARD_SIZE - 1, y })
  }

  return walls
}

function isBorderWall(point: GridPoint): boolean {
  return point.x === 0
    || point.y === 0
    || point.x === AUTHORED_BOARD_SIZE - 1
    || point.y === AUTHORED_BOARD_SIZE - 1
}

function toPlayablePoint(point: GridPoint): GridPoint {
  return {
    x: point.x - BOARD_BORDER_SIZE,
    y: point.y - BOARD_BORDER_SIZE
  }
}

function toBoardPoint(point: GridPoint): GridPoint {
  return {
    x: point.x + BOARD_BORDER_SIZE,
    y: point.y + BOARD_BORDER_SIZE
  }
}

function isInsidePlayableGrid(point: GridPoint): boolean {
  return point.x >= 0
    && point.y >= 0
    && point.x < PLAYABLE_GRID_SIZE
    && point.y < PLAYABLE_GRID_SIZE
}
