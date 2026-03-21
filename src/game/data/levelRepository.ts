import type { EditableLevelData, LevelSummary } from '../types/editor'
import type { EnemyDefinition, GridPoint, LevelData } from '../types/level'
import type { FilledMapSlotFile, MapSlotFile } from '../types/mapFile'
import {
  PLAYABLE_AREA_LABEL,
  RUNTIME_BOARD_HEIGHT,
  RUNTIME_BOARD_LABEL,
  RUNTIME_BOARD_WIDTH,
  REQUIRED_RUNTIME_BORDER_WALL_KEYS,
  createRuntimeBorderWalls,
  isInsidePlayableArea,
  isInsideRuntimeBoard,
  isInsideRuntimePlayableArea,
  isRuntimeBorderWall,
  toPlayableAreaPoint,
  toRuntimeBoardPoint
} from '../utils/boardGeometry'

/**
 * Canonical level repository for campaign slots and editor publication.
 *
 * Responsibilities:
 * - load the 99 static map-slot files served from `public/maps`
 * - validate uploaded/downloaded slot-file JSON before it touches gameplay
 * - convert between editor-friendly 10x10 layouts and canonical 12x12 runtime `LevelData`
 * - write updated slot files locally during `localhost` development
 * - publish updated slot files back to the GitHub repository when authorized
 *
 * This module deliberately stays Phaser-free so slot rules, validation, and
 * conversion logic remain easy to test in isolation.
 */
export const MAP_MIN_SLOT = 1
export const MAP_MAX_SLOT = 99
export const DEFAULT_TILE_SIZE = 64
export const MAP_FILE_TYPE = 'stoneage-map-slot'
export const MAP_FILE_VERSION = 1
export const MAX_MAP_FILE_BYTES = 64 * 1024

const MAP_OWNER = 'tarikdsm'
const MAP_REPO = 'StoneAge'
const MAP_BRANCH = 'main'
const MAP_PUBLIC_DIR = 'maps'
const MAP_REPOSITORY_DIR = 'public/maps'
const LOCAL_MAPS_API_SEGMENT = '__stoneage_local_maps'
const LOCAL_MAP_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

const mapCache = new Map<number, MapSlotFile>()

interface GitHubContentResponse {
  sha?: string
  message?: string
}

interface LocalMapApiResponse {
  message?: string
}

interface ValidationResult<T> {
  value?: T
  errors: string[]
}

export type MapPublishingMode = 'local' | 'github'

export interface PublishMapOptions {
  token?: string
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

function createRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function getMapFileName(slot: number): string {
  return `map${String(sanitizeSlot(slot)).padStart(2, '0')}.json`
}

function getMapPublicUrl(slot: number): string {
  return `${import.meta.env.BASE_URL}${MAP_PUBLIC_DIR}/${getMapFileName(slot)}`
}

function getRepositoryMapPath(slot: number): string {
  return `${MAP_REPOSITORY_DIR}/${getMapFileName(slot)}`
}

function getGitHubContentsUrl(slot: number): string {
  return `https://api.github.com/repos/${MAP_OWNER}/${MAP_REPO}/contents/${getRepositoryMapPath(slot)}`
}

function getLocalMapsApiUrl(slot: number): string {
  return `${import.meta.env.BASE_URL}${LOCAL_MAPS_API_SEGMENT}/${getMapFileName(slot)}`
}

function getWindowHostname(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.location.hostname?.toLowerCase()
}

export function getMapPublishingMode(): MapPublishingMode {
  const hostname = getWindowHostname()
  return hostname && LOCAL_MAP_HOSTNAMES.has(hostname) ? 'local' : 'github'
}

export function requiresGitHubTokenForMapPublishing(): boolean {
  return getMapPublishingMode() === 'github'
}

function defaultObjective(): string {
  return 'Crush every raider with the blocks, then reach the exit.'
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
  const goalKeys = new Set(level.goals.map(pointKey))
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

  if (wallKeys.has(pointKey(level.goals[0] as GridPoint))) {
    errors.push('level.goals[0] cannot overlap a wall.')
  }

  for (const key of blockKeys) {
    if (wallKeys.has(key)) {
      errors.push('level.blocks cannot overlap walls.')
      break
    }
    if (goalKeys.has(key)) {
      errors.push('level.blocks cannot overlap the exit.')
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
    if (goalKeys.has(key)) {
      errors.push('level.enemies cannot overlap the exit.')
      break
    }
  }
}

function validateLevelDataRecord(value: unknown): ValidationResult<LevelData> {
  const errors: string[] = []
  if (!isRecord(value) || !hasOnlyKeys(value, ['name', 'tileSize', 'width', 'height', 'par', 'objective', 'playerSpawn', 'blocks', 'enemies', 'goals', 'walls'])) {
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
  const goals = parseGridPointList(value.goals, 'level.goals', errors)
  const walls = value.walls === undefined ? [] : parseGridPointList(value.walls, 'level.walls', errors)

  if (goals && goals.length !== 1) {
    errors.push('level.goals must contain exactly one exit.')
  }

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

  for (const pointList of [blocks, goals]) {
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

  if (errors.length > 0 || !name || !objective || tileSize === undefined || width === undefined || height === undefined || par === undefined || !playerSpawn || !blocks || !enemies || !goals || !walls) {
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
    goals,
    walls
  }

  validateLevelCollisions(level, errors)
  return errors.length > 0 ? { errors } : { value: level, errors }
}

function sanitizeMapSlotFile(file: MapSlotFile): MapSlotFile {
  if (file.empty) {
    return createEmptyMapSlotFile(file.slot)
  }

  return {
    type: MAP_FILE_TYPE,
    version: MAP_FILE_VERSION,
    slot: sanitizeSlot(file.slot),
    empty: false,
    level: {
      name: file.level.name,
      tileSize: file.level.tileSize,
      width: file.level.width,
      height: file.level.height,
      par: file.level.par,
      objective: file.level.objective,
      playerSpawn: clonePoint(file.level.playerSpawn),
      blocks: file.level.blocks.map(clonePoint),
      enemies: file.level.enemies.map((enemy) => ({ ...enemy })),
      goals: file.level.goals.map(clonePoint),
      walls: file.level.walls?.map(clonePoint)
    }
  }
}

function setCachedMapSlotFile(file: MapSlotFile): MapSlotFile {
  const sanitized = sanitizeMapSlotFile(file)
  mapCache.set(sanitized.slot, sanitized)
  return sanitized
}

function toPublishMessage(file: MapSlotFile): string {
  return file.empty
    ? `Clear ${formatLevelLabel(file.slot)}`
    : `Update ${formatLevelLabel(file.slot)}`
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function describeGitHubError(status: number, message?: string): string {
  if (status === 401) {
    return 'GitHub token rejected. Check the token and try again.'
  }

  if (status === 403) {
    return 'GitHub denied access. The token needs permission to write repository contents.'
  }

  if (status === 404) {
    return 'GitHub repository path not found while publishing the map.'
  }

  return message ?? `GitHub request failed with status ${status}.`
}

function describeLocalMapApiError(status: number, message?: string): string {
  if (status === 404) {
    return 'Local map saving endpoint not found. If localhost is already open, restart `npm run dev` or `npm run preview` so Vite picks up the new local map-writing endpoint.'
  }

  return message ?? `Local map save failed with status ${status}.`
}

async function fetchGitHubFileSha(slot: number, token: string): Promise<string | undefined> {
  const response = await fetch(`${getGitHubContentsUrl(slot)}?ref=${encodeURIComponent(MAP_BRANCH)}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (response.status === 404) {
    return undefined
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as GitHubContentResponse
    throw new Error(describeGitHubError(response.status, payload.message))
  }

  const payload = await response.json() as GitHubContentResponse
  return payload.sha
}

async function loadAllMapSlotFiles(forceRefresh = false): Promise<MapSlotFile[]> {
  return Promise.all(createRange(MAP_MIN_SLOT, MAP_MAX_SLOT).map((slot) => getMapSlotFile(slot, forceRefresh)))
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

export function createEmptyEditableLevel(slot = 2): EditableLevelData {
  const safeSlot = sanitizeSlot(slot)
  return {
    slot: safeSlot,
    name: formatLevelName(safeSlot),
    objective: defaultObjective(),
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
    playerSpawn: toPlayableAreaPoint(level.playerSpawn),
    exit: level.goals[0] ? toPlayableAreaPoint(level.goals[0]) : undefined,
    blocks: level.blocks.map(toPlayableAreaPoint),
    columns: (level.walls ?? []).filter((wall) => !isRuntimeBorderWall(wall)).map(toPlayableAreaPoint),
    enemies: level.enemies.map(toPlayableAreaPoint)
  }
}

export function createEmptyMapSlotFile(slot: number): MapSlotFile {
  return {
    type: MAP_FILE_TYPE,
    version: MAP_FILE_VERSION,
    slot: sanitizeSlot(slot),
    empty: true
  }
}

export function editableLevelFromMapSlotFile(file: MapSlotFile): EditableLevelData {
  return file.empty
    ? createEmptyEditableLevel(file.slot)
    : editableLevelFromLevel(file.slot, file.level)
}

export function buildLevelFromEditableLevel(editable: EditableLevelData): LevelData {
  const validationError = validateEditableLevel(editable)[0]
  if (validationError) {
    throw new Error(validationError)
  }

  return {
    name: editable.name.trim() || formatLevelName(editable.slot),
    tileSize: DEFAULT_TILE_SIZE,
    width: RUNTIME_BOARD_WIDTH,
    height: RUNTIME_BOARD_HEIGHT,
    par: Math.max(1, Math.ceil((editable.enemies.length + editable.blocks.length) / 3)),
    objective: editable.objective.trim() || defaultObjective(),
    playerSpawn: toRuntimeBoardPoint(editable.playerSpawn as GridPoint),
    blocks: editable.blocks.map(toRuntimeBoardPoint),
    enemies: editable.enemies.map((enemy) => ({
      type: 'basic',
      ...toRuntimeBoardPoint(enemy)
    })) as EnemyDefinition[],
    goals: [toRuntimeBoardPoint(editable.exit as GridPoint)],
    walls: [...createRuntimeBorderWalls(), ...editable.columns.map(toRuntimeBoardPoint)]
  }
}

export function buildMapSlotFileFromEditableLevel(editable: EditableLevelData): FilledMapSlotFile {
  return {
    type: MAP_FILE_TYPE,
    version: MAP_FILE_VERSION,
    slot: sanitizeSlot(editable.slot),
    empty: false,
    level: buildLevelFromEditableLevel({
      ...editable,
      name: editable.name.trim() || formatLevelName(editable.slot),
      objective: editable.objective.trim() || defaultObjective()
    })
  }
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

  if (editable.playerSpawn && !isInsidePlayableArea(editable.playerSpawn)) {
    errors.push(`Player start must stay inside the ${PLAYABLE_AREA_LABEL} playable area.`)
  }

  if (editable.exit && !isInsidePlayableArea(editable.exit)) {
    errors.push(`Exit must stay inside the ${PLAYABLE_AREA_LABEL} playable area.`)
  }

  for (const list of [editable.blocks, editable.columns, editable.enemies]) {
    const seen = new Set<string>()
    for (const point of list) {
      if (!isInsidePlayableArea(point)) {
        errors.push(`All placed tiles must stay inside the ${PLAYABLE_AREA_LABEL} playable area.`)
        break
      }

      const key = pointKey(point)
      if (seen.has(key)) {
        errors.push('A map cannot contain duplicate placements of the same item type.')
        break
      }

      seen.add(key)
    }
  }

  return errors
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
      level: levelResult.value
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

export async function getMapSlotFile(slot: number, forceRefresh = false): Promise<MapSlotFile> {
  const safeSlot = sanitizeSlot(slot)
  if (!forceRefresh) {
    const cached = mapCache.get(safeSlot)
    if (cached) {
      return sanitizeMapSlotFile(cached)
    }
  }

  const response = await fetch(getMapPublicUrl(safeSlot), {
    cache: forceRefresh ? 'reload' : 'default'
  })

  if (!response.ok) {
    throw new Error(`Unable to load ${formatLevelLabel(safeSlot)} from ${MAP_PUBLIC_DIR}.`)
  }

  const result = validateMapSlotFileData(await response.json() as unknown)
  if (!result.value) {
    throw new Error(result.errors[0] ?? `Map file ${getMapFileName(safeSlot)} is invalid.`)
  }

  return setCachedMapSlotFile(result.value)
}

export async function getLevel(slot: number, forceRefresh = false): Promise<LevelData | undefined> {
  const file = await getMapSlotFile(slot, forceRefresh)
  return file.empty ? undefined : file.level
}

export async function hasLevel(slot: number, forceRefresh = false): Promise<boolean> {
  return Boolean(await getLevel(slot, forceRefresh))
}

export async function listLevelSummaries(forceRefresh = false): Promise<LevelSummary[]> {
  const files = await loadAllMapSlotFiles(forceRefresh)
  return files
    .filter((file) => !file.empty)
    .map((file) => ({
      slot: file.slot,
      name: file.level.name,
      deletable: file.slot !== 1,
      published: true
    }))
}

export async function getNextLevelSlot(slot: number, forceRefresh = false): Promise<number | undefined> {
  const currentSlot = sanitizeSlot(slot)
  const files = await loadAllMapSlotFiles(forceRefresh)
  return files
    .filter((file) => !file.empty)
    .map((file) => file.slot)
    .find((candidate) => candidate > currentSlot)
}

export async function getFirstAvailableCustomSlot(forceRefresh = false): Promise<number> {
  const files = await loadAllMapSlotFiles(forceRefresh)
  for (let slot = 2; slot <= MAP_MAX_SLOT; slot += 1) {
    const file = files.find((candidate) => candidate.slot === slot)
    if (file?.empty) {
      return slot
    }
  }

  return MAP_MAX_SLOT
}

async function publishMapSlotFileLocally(file: MapSlotFile): Promise<MapSlotFile> {
  const response = await fetch(getLocalMapsApiUrl(file.slot), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: serializeMapSlotFile(file)
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as LocalMapApiResponse
    throw new Error(describeLocalMapApiError(response.status, payload.message))
  }

  const result = validateMapSlotFileData(await response.json() as unknown)
  if (!result.value) {
    throw new Error(result.errors[0] ?? `Local response for ${getMapFileName(file.slot)} is invalid.`)
  }

  return setCachedMapSlotFile(result.value)
}

async function publishMapSlotFileToGitHub(file: MapSlotFile, token: string): Promise<MapSlotFile> {
  const result = validateMapSlotFileData(file)
  if (!result.value) {
    throw new Error(result.errors[0] ?? 'Map file is invalid.')
  }

  const validatedFile = result.value
  const sha = await fetchGitHubFileSha(validatedFile.slot, token)
  const response = await fetch(getGitHubContentsUrl(validatedFile.slot), {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      message: toPublishMessage(validatedFile),
      branch: MAP_BRANCH,
      sha,
      content: toBase64(serializeMapSlotFile(validatedFile))
    })
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as GitHubContentResponse
    throw new Error(describeGitHubError(response.status, payload.message))
  }

  return setCachedMapSlotFile(validatedFile)
}

export async function publishMapSlotFile(file: MapSlotFile, options: PublishMapOptions = {}): Promise<MapSlotFile> {
  const result = validateMapSlotFileData(file)
  if (!result.value) {
    throw new Error(result.errors[0] ?? 'Map file is invalid.')
  }

  if (getMapPublishingMode() === 'local') {
    return publishMapSlotFileLocally(result.value)
  }

  if (!options.token) {
    throw new Error('Publishing on the hosted site requires a GitHub token with repository write access.')
  }

  return publishMapSlotFileToGitHub(result.value, options.token)
}

export async function publishEditableLevel(editable: EditableLevelData, options: PublishMapOptions = {}): Promise<MapSlotFile> {
  return publishMapSlotFile(buildMapSlotFileFromEditableLevel(editable), options)
}

export async function clearMapSlot(slot: number, options: PublishMapOptions = {}): Promise<MapSlotFile> {
  const safeSlot = sanitizeSlot(slot)
  if (safeSlot === 1) {
    throw new Error('Map 01 can be modified, but never cleared.')
  }

  return publishMapSlotFile(createEmptyMapSlotFile(safeSlot), options)
}
