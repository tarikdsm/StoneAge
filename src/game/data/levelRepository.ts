import type { EditableLevelData, LevelSummary } from '../types/editor'
import type { EnemyDefinition, GridPoint, LevelData } from '../types/level'
import type { FilledMapSlotFile, MapSlotFile } from '../types/mapFile'
import {
  DEFAULT_TILE_SIZE,
  MAP_FILE_TYPE,
  MAP_FILE_VERSION,
  MAP_MAX_SLOT,
  MAP_MIN_SLOT,
  createEmptyMapSlotFile,
  formatLevelLabel,
  formatLevelName,
  sanitizeSlot,
  serializeMapSlotFile,
  validateMapSlotFileData
} from './mapSlotCodec'
import {
  PLAYABLE_AREA_LABEL,
  RUNTIME_BOARD_HEIGHT,
  RUNTIME_BOARD_WIDTH,
  createRuntimeBorderWalls,
  isInsidePlayableArea,
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

export type MapPublishingMode = 'local' | 'github'

export interface PublishMapOptions {
  token?: string
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
  return 'Crush every raider with the blocks.'
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

export {
  createEmptyMapSlotFile,
  DEFAULT_TILE_SIZE,
  formatLevelLabel,
  formatLevelName,
  MAX_MAP_FILE_BYTES,
  MAP_FILE_TYPE,
  MAP_FILE_VERSION,
  MAP_MAX_SLOT,
  MAP_MIN_SLOT,
  parseMapSlotFileText,
  sanitizeSlot,
  serializeMapSlotFile,
  validateMapSlotFileData
} from './mapSlotCodec'

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
    blocks: level.blocks.map(toPlayableAreaPoint),
    columns: (level.walls ?? []).filter((wall) => !isRuntimeBorderWall(wall)).map(toPlayableAreaPoint),
    enemies: level.enemies.map(toPlayableAreaPoint)
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

  if (editable.playerSpawn && !isInsidePlayableArea(editable.playerSpawn)) {
    errors.push(`Player start must stay inside the ${PLAYABLE_AREA_LABEL} playable area.`)
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
