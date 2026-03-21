import type { GridPoint } from './level'

/** Selectable tools available in the map editor UI. */
export type EditorTool = 'player' | 'block' | 'column' | 'enemy' | 'erase'

/**
 * Authoring-friendly editor shape for the canonical 10x10 playable area.
 *
 * Editor coordinates are expressed inside the open playable area rather than
 * the full runtime board with border walls.
 */
export interface EditableLevelData {
  slot: number
  name: string
  objective: string
  playerSpawn?: GridPoint
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
