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
 * - `width` and `height` define the total legal board bounds.
 * - editor-authored 10x10 playable maps are converted into this total-board
 *   shape by adding a border wall ring around the playable area.
 * - `playerSpawn`, `blocks`, `enemies`, `goals`, and `walls` are all expressed
 *   in grid coordinates inside that total board.
 * - if border walls are authored, they reduce the open interior play area.
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
