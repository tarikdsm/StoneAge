/**
 * Pure viewport/layout helpers shared by the Phaser scenes.
 *
 * These calculations intentionally stay separate from `StageState` so the
 * simulation remains Phaser-free while scene layout still has a deterministic,
 * testable source of truth.
 */

const BOARD_VIEWPORT_FILL_RATIO = 0.8

export interface HudMetrics {
  narrow: boolean
  topBandHeight: number
  bottomBandHeight: number
  topPanelHeight: number
  bottomPanelHeight: number
  panelPadding: number
}

export interface BoardViewportLayout {
  zoom: number
  screenCenterX: number
  screenCenterY: number
  screenWidth: number
  screenHeight: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Fits the entire logical board inside 80% of the available browser viewport
 * and keeps it centered on screen.
 */
export function getBoardViewportLayout(
  viewportWidth: number,
  viewportHeight: number,
  boardPixelWidth: number,
  boardPixelHeight: number
): BoardViewportLayout {
  const zoom = Math.max(
    0.1,
    Math.min(
      (viewportWidth * BOARD_VIEWPORT_FILL_RATIO) / boardPixelWidth,
      (viewportHeight * BOARD_VIEWPORT_FILL_RATIO) / boardPixelHeight
    )
  )

  return {
    zoom,
    screenCenterX: viewportWidth / 2,
    screenCenterY: viewportHeight / 2,
    screenWidth: boardPixelWidth * zoom,
    screenHeight: boardPixelHeight * zoom
  }
}

/**
 * Sizes HUD panels so they live in the free margins left by the 80% board-fit
 * rule while staying readable on touch devices.
 */
export function getHudMetrics(viewportWidth: number, viewportHeight: number): HudMetrics {
  const narrow = viewportWidth < 720
  const topBandHeight = viewportHeight * 0.1
  const bottomBandHeight = viewportHeight * (narrow ? 0.12 : 0.1)

  return {
    narrow,
    topBandHeight,
    bottomBandHeight,
    topPanelHeight: clamp(topBandHeight * 0.72, 46, 70),
    bottomPanelHeight: clamp(bottomBandHeight * 0.78, 52, narrow ? 92 : 76),
    panelPadding: clamp(Math.min(viewportWidth, viewportHeight) * 0.018, 10, 18)
  }
}
