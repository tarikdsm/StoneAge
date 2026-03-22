import type { EnemyDefinition, GridPoint, LevelData } from '../types/level'
import type { MapSlotFile } from '../types/mapFile'
import {
  PLAYABLE_AREA_LABEL,
  RUNTIME_BOARD_HEIGHT,
  RUNTIME_BOARD_LABEL,
  RUNTIME_BOARD_WIDTH,
  REQUIRED_RUNTIME_BORDER_WALL_KEYS,
  isInsideRuntimeBoard,
  isInsideRuntimePlayableArea
} from '../utils/boardGeometry'

export const MAP_MIN_SLOT = 1
export const MAP_MAX_SLOT = 99
export const DEFAULT_TILE_SIZE = 64
export const MAP_FILE_TYPE = 'stoneage-map-slot'
export const MAP_FILE_VERSION = 2
export const MAX_MAP_FILE_BYTES = 64 * 1024

export interface ValidationResult<T> {
  value?: T
  errors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(record: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(record).every((key) => allowedKeys.includes(key))
}

function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

function clonePoint(point: GridPoint): GridPoint {
  return { x: point.x, y: point.y }
}

function parseInteger(value: unknown, label: string, min: number, max: number, errors: string[]): number | undefined {
  if (!Number.isInteger(value)) {
    errors.push(`${label} must be an integer.`)
    return undefined
  }

  const safeValue = value as number
  if (safeValue < min || safeValue > max) {
    errors.push(min === max
      ? `${label} must be ${min}.`
      : `${label} must stay between ${min} and ${max}.`)
    return undefined
  }

  return safeValue
}

function parseString(value: unknown, label: string, maxLength: number, errors: string[]): string | undefined {
  if (typeof value !== 'string') {
    errors.push(`${label} must be a string.`)
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed) {
    errors.push(`${label} cannot be empty.`)
    return undefined
  }

  if (trimmed.length > maxLength) {
    errors.push(`${label} must stay under ${maxLength} characters.`)
    return undefined
  }

  return trimmed
}

function parseGridPoint(value: unknown, label: string, errors: string[]): GridPoint | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['x', 'y'])) {
    errors.push(`${label} must be a point with x and y integers.`)
    return undefined
  }

  const x = parseInteger(value.x, `${label}.x`, 0, RUNTIME_BOARD_WIDTH - 1, errors)
  const y = parseInteger(value.y, `${label}.y`, 0, RUNTIME_BOARD_HEIGHT - 1, errors)
  if (x === undefined || y === undefined) {
    return undefined
  }

  return { x, y }
}

function parseGridPointList(value: unknown, label: string, errors: string[]): GridPoint[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`)
    return undefined
  }

  const points: GridPoint[] = []
  const seen = new Set<string>()
  for (const [index, item] of value.entries()) {
    const point = parseGridPoint(item, `${label}[${index}]`, errors)
    if (!point) {
      continue
    }

    const key = pointKey(point)
    if (seen.has(key)) {
      errors.push(`${label} cannot contain duplicate positions.`)
      continue
    }

    seen.add(key)
    points.push(point)
  }

  return points
}

function parseEnemyDefinitions(value: unknown, errors: string[]): EnemyDefinition[] | undefined {
  if (!Array.isArray(value)) {
    errors.push('level.enemies must be an array.')
    return undefined
  }

  const enemies: EnemyDefinition[] = []
  const seen = new Set<string>()
  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || !hasOnlyKeys(item, ['type', 'x', 'y'])) {
      errors.push(`level.enemies[${index}] must contain type, x, and y.`)
      continue
    }

    if (item.type !== 'basic') {
      errors.push(`level.enemies[${index}].type must be "basic".`)
      continue
    }

    const x = parseInteger(item.x, `level.enemies[${index}].x`, 0, RUNTIME_BOARD_WIDTH - 1, errors)
    const y = parseInteger(item.y, `level.enemies[${index}].y`, 0, RUNTIME_BOARD_HEIGHT - 1, errors)
    if (x === undefined || y === undefined) {
      continue
    }

    const point = { x, y }
    const key = pointKey(point)
    if (seen.has(key)) {
      errors.push('level.enemies cannot contain duplicate positions.')
      continue
    }

    seen.add(key)
    enemies.push({
      type: 'basic',
      ...point
    })
  }

  return enemies
}

function validateLevelCollisions(level: LevelData, errors: string[]): void {
  const wallKeys = new Set((level.walls ?? []).map(pointKey))
  const blockKeys = new Set(level.blocks.map(pointKey))
  const enemyKeys = new Set(level.enemies.map(pointKey))
  const playerKey = pointKey(level.playerSpawn)

  if (wallKeys.has(playerKey)) {
    errors.push('level.playerSpawn cannot overlap a wall.')
  }

  if (blockKeys.has(playerKey)) {
    errors.push('level.playerSpawn cannot overlap a block.')
  }

  if (enemyKeys.has(playerKey)) {
    errors.push('level.playerSpawn cannot overlap an enemy.')
  }

  for (const key of blockKeys) {
    if (wallKeys.has(key)) {
      errors.push('level.blocks cannot overlap walls.')
      break
    }
  }

  for (const key of enemyKeys) {
    if (wallKeys.has(key)) {
      errors.push('level.enemies cannot overlap walls.')
      break
    }
    if (blockKeys.has(key)) {
      errors.push('level.enemies cannot overlap blocks.')
      break
    }
  }
}

function validateLevelDataRecord(value: unknown): ValidationResult<LevelData> {
  const errors: string[] = []
  if (!isRecord(value) || !hasOnlyKeys(value, ['name', 'tileSize', 'width', 'height', 'par', 'objective', 'playerSpawn', 'blocks', 'enemies', 'walls'])) {
    errors.push('level must contain only the expected level fields.')
    return { errors }
  }

  const name = parseString(value.name, 'level.name', 80, errors)
  const objective = parseString(value.objective, 'level.objective', 240, errors)
  const tileSize = parseInteger(value.tileSize, 'level.tileSize', DEFAULT_TILE_SIZE, DEFAULT_TILE_SIZE, errors)
  const width = parseInteger(value.width, 'level.width', RUNTIME_BOARD_WIDTH, RUNTIME_BOARD_WIDTH, errors)
  const height = parseInteger(value.height, 'level.height', RUNTIME_BOARD_HEIGHT, RUNTIME_BOARD_HEIGHT, errors)
  const par = parseInteger(value.par, 'level.par', 1, 999, errors)
  const playerSpawn = parseGridPoint(value.playerSpawn, 'level.playerSpawn', errors)
  const blocks = parseGridPointList(value.blocks, 'level.blocks', errors)
  const enemies = parseEnemyDefinitions(value.enemies, errors)
  const walls = value.walls === undefined ? [] : parseGridPointList(value.walls, 'level.walls', errors)

  if (walls) {
    const wallKeys = new Set(walls.map(pointKey))
    for (const borderKey of REQUIRED_RUNTIME_BORDER_WALL_KEYS) {
      if (!wallKeys.has(borderKey)) {
        errors.push('level.walls must contain the full border wall ring.')
        break
      }
    }
  }

  if (playerSpawn && !isInsideRuntimePlayableArea(playerSpawn)) {
    errors.push(`level.playerSpawn must stay inside the ${PLAYABLE_AREA_LABEL} playable runtime interior.`)
  }

  for (const pointList of [blocks]) {
    if (!pointList) {
      continue
    }

    for (const point of pointList) {
      if (!isInsideRuntimePlayableArea(point)) {
        errors.push(`All non-wall level points must stay inside the ${PLAYABLE_AREA_LABEL} playable runtime interior.`)
        break
      }
    }
  }

  if (enemies) {
    for (const enemy of enemies) {
      if (!isInsideRuntimePlayableArea(enemy)) {
        errors.push(`All level enemies must stay inside the ${PLAYABLE_AREA_LABEL} playable runtime interior.`)
        break
      }
    }
  }

  if (walls) {
    for (const wall of walls) {
      if (!isInsideRuntimeBoard(wall)) {
        errors.push(`All level walls must stay inside the ${RUNTIME_BOARD_LABEL} runtime board.`)
        break
      }
    }
  }

  if (errors.length > 0 || !name || !objective || tileSize === undefined || width === undefined || height === undefined || par === undefined || !playerSpawn || !blocks || !enemies || !walls) {
    return { errors }
  }

  const level: LevelData = {
    name,
    tileSize,
    width,
    height,
    par,
    objective,
    playerSpawn,
    blocks,
    enemies,
    walls
  }

  validateLevelCollisions(level, errors)
  return errors.length > 0 ? { errors } : { value: level, errors }
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

export function createEmptyMapSlotFile(slot: number): MapSlotFile {
  return {
    type: MAP_FILE_TYPE,
    version: MAP_FILE_VERSION,
    slot: sanitizeSlot(slot),
    empty: true
  }
}

export function validateMapSlotFileData(value: unknown): ValidationResult<MapSlotFile> {
  const errors: string[] = []

  if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'version', 'slot', 'empty', 'level'])) {
    errors.push('Map file must contain only the expected slot-file fields.')
    return { errors }
  }

  if (value.type !== MAP_FILE_TYPE) {
    errors.push(`Map file type must be "${MAP_FILE_TYPE}".`)
  }

  const version = parseInteger(value.version, 'version', MAP_FILE_VERSION, MAP_FILE_VERSION, errors)
  const slot = parseInteger(value.slot, 'slot', MAP_MIN_SLOT, MAP_MAX_SLOT, errors)

  if (typeof value.empty !== 'boolean') {
    errors.push('empty must be a boolean.')
  }

  if (errors.length > 0 || version === undefined || slot === undefined || typeof value.empty !== 'boolean') {
    return { errors }
  }

  if (value.empty) {
    if (value.level !== undefined) {
      errors.push('Empty slots cannot include level data.')
    }

    if (slot === 1) {
      errors.push('Map 01 cannot be an empty slot.')
    }

    return errors.length > 0 ? { errors } : { value: createEmptyMapSlotFile(slot), errors }
  }

  const levelResult = validateLevelDataRecord(value.level)
  errors.push(...levelResult.errors)
  if (errors.length > 0 || !levelResult.value) {
    return { errors }
  }

  return {
    value: {
      type: MAP_FILE_TYPE,
      version: MAP_FILE_VERSION,
      slot,
      empty: false,
      level: {
        name: levelResult.value.name,
        tileSize: levelResult.value.tileSize,
        width: levelResult.value.width,
        height: levelResult.value.height,
        par: levelResult.value.par,
        objective: levelResult.value.objective,
        playerSpawn: clonePoint(levelResult.value.playerSpawn),
        blocks: levelResult.value.blocks.map(clonePoint),
        enemies: levelResult.value.enemies.map((enemy) => ({ ...enemy })),
        walls: levelResult.value.walls?.map(clonePoint)
      }
    },
    errors
  }
}

export function parseMapSlotFileText(text: string): ValidationResult<MapSlotFile> {
  if (text.length > MAX_MAP_FILE_BYTES) {
    return {
      errors: [`Map files must stay under ${MAX_MAP_FILE_BYTES / 1024} KB.`]
    }
  }

  try {
    const parsed = JSON.parse(text) as unknown
    return validateMapSlotFileData(parsed)
  } catch {
    return {
      errors: ['The uploaded file is not valid JSON.']
    }
  }
}

export function serializeMapSlotFile(file: MapSlotFile): string {
  const result = validateMapSlotFileData(file)
  if (!result.value) {
    throw new Error(result.errors[0] ?? 'Map file is invalid.')
  }

  return `${JSON.stringify(result.value, null, 2)}\n`
}
