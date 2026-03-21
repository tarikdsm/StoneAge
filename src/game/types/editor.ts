import type { GridPoint } from './level'

/** Selectable tools available in the map editor UI. */
export type EditorTool = 'player' | 'block' | 'column' | 'enemy' | 'exit' | 'erase'

/**
 * Authoring-friendly editor shape for the 10x10 playable area.
 *
 * Editor coordinates are expressed inside the open playable area rather than
 * the full authored board with border walls.
 */
export interface EditableLevelData {
  slot: number
  name: string
  objective: string
  playerSpawn?: GridPoint
  exit?: GridPoint
  blocks: GridPoint[]
  columns: GridPoint[]
  enemies: GridPoint[]
}

/** Summary payload used by menus and editor-side map lists. */
export interface LevelSummary {
  slot: number
  name: string
  deletable: boolean
  published: boolean
}
