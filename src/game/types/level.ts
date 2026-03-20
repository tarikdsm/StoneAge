/** A grid-space coordinate expressed in tile units rather than pixels. */
export interface GridPoint {
  x: number
  y: number
}

/**
 * Serialized enemy content authored inside level JSON.
 *
 * The current prototype supports one enemy behavior (`basic`), but the type is
 * intentionally structured for future expansion.
 */
export interface EnemyDefinition extends GridPoint {
  type: 'basic'
}

/**
 * Authoritative level schema for JSON-authored stage data.
 *
 * Runtime assumptions:
 * - `width` and `height` define the legal board bounds.
 * - `playerSpawn`, `blocks`, `enemies`, `goals`, and `walls` are all expressed
 *   in grid coordinates.
 * - `walls` are impassable to both the player and blocks.
 * - reaching a `goal` tile only wins the stage after all enemies are defeated.
 */
export interface LevelData {
  name: string
  tileSize: number
  width: number
  height: number
  par: number
  objective: string
  playerSpawn: GridPoint
  blocks: GridPoint[]
  enemies: EnemyDefinition[]
  goals: GridPoint[]
  walls?: GridPoint[]
}

/** Allowed movement and push directions used by runtime commands. */
export type Direction = 'up' | 'down' | 'left' | 'right'
