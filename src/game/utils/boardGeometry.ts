import type { GridPoint } from '../types/level'

export const PLAYABLE_AREA_WIDTH = 10
export const PLAYABLE_AREA_HEIGHT = 10
export const PLAYABLE_AREA_LABEL = `${PLAYABLE_AREA_WIDTH}x${PLAYABLE_AREA_HEIGHT}`

export const RUNTIME_BOARD_BORDER_THICKNESS = 1
export const RUNTIME_BOARD_WIDTH = PLAYABLE_AREA_WIDTH + RUNTIME_BOARD_BORDER_THICKNESS * 2
export const RUNTIME_BOARD_HEIGHT = PLAYABLE_AREA_HEIGHT + RUNTIME_BOARD_BORDER_THICKNESS * 2
export const RUNTIME_BOARD_LABEL = `${RUNTIME_BOARD_WIDTH}x${RUNTIME_BOARD_HEIGHT}`

export interface BoardDimensions {
  width: number
  height: number
}

export function hasCanonicalRuntimeBoardSize(width: number, height: number): boolean {
  return width === RUNTIME_BOARD_WIDTH && height === RUNTIME_BOARD_HEIGHT
}

export function getRuntimeBoardPixelSize(tileSize: number): BoardDimensions {
  return {
    width: RUNTIME_BOARD_WIDTH * tileSize,
    height: RUNTIME_BOARD_HEIGHT * tileSize
  }
}

export function isInsidePlayableArea(point: GridPoint): boolean {
  return point.x >= 0
    && point.y >= 0
    && point.x < PLAYABLE_AREA_WIDTH
    && point.y < PLAYABLE_AREA_HEIGHT
}

export function isInsideRuntimeBoard(point: GridPoint): boolean {
  return point.x >= 0
    && point.y >= 0
    && point.x < RUNTIME_BOARD_WIDTH
    && point.y < RUNTIME_BOARD_HEIGHT
}

export function isInsideRuntimePlayableArea(point: GridPoint): boolean {
  return point.x >= RUNTIME_BOARD_BORDER_THICKNESS
    && point.y >= RUNTIME_BOARD_BORDER_THICKNESS
    && point.x < RUNTIME_BOARD_WIDTH - RUNTIME_BOARD_BORDER_THICKNESS
    && point.y < RUNTIME_BOARD_HEIGHT - RUNTIME_BOARD_BORDER_THICKNESS
}

export function toRuntimeBoardPoint(point: GridPoint): GridPoint {
  return {
    x: point.x + RUNTIME_BOARD_BORDER_THICKNESS,
    y: point.y + RUNTIME_BOARD_BORDER_THICKNESS
  }
}

export function toPlayableAreaPoint(point: GridPoint): GridPoint {
  return {
    x: point.x - RUNTIME_BOARD_BORDER_THICKNESS,
    y: point.y - RUNTIME_BOARD_BORDER_THICKNESS
  }
}

export function isRuntimeBorderWall(point: GridPoint): boolean {
  return point.x === 0
    || point.y === 0
    || point.x === RUNTIME_BOARD_WIDTH - 1
    || point.y === RUNTIME_BOARD_HEIGHT - 1
}

export function createRuntimeBorderWalls(): GridPoint[] {
  const walls: GridPoint[] = []

  for (let x = 0; x < RUNTIME_BOARD_WIDTH; x += 1) {
    walls.push({ x, y: 0 })
    walls.push({ x, y: RUNTIME_BOARD_HEIGHT - 1 })
  }

  for (let y = 1; y < RUNTIME_BOARD_HEIGHT - 1; y += 1) {
    walls.push({ x: 0, y })
    walls.push({ x: RUNTIME_BOARD_WIDTH - 1, y })
  }

  return walls
}

export const REQUIRED_RUNTIME_BORDER_WALL_KEYS = new Set(createRuntimeBorderWalls().map((point) => `${point.x},${point.y}`))
