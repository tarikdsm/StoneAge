import { describe, expect, it } from 'vitest'
import { getRuntimeBoardPixelSize } from '../utils/boardGeometry'
import { getBoardViewportLayout } from '../utils/layout'

describe('responsive board layout helpers', () => {
  it('fits the board inside the target viewport budget on desktop', () => {
    const runtimeBoard = getRuntimeBoardPixelSize(64)
    const layout = getBoardViewportLayout(1280, 720, runtimeBoard.width + 48, runtimeBoard.height + 48)

    expect(layout.screenWidth).toBeLessThanOrEqual(1280 * 0.8)
    expect(layout.screenHeight).toBeLessThanOrEqual(720 * 0.8)
    expect(layout.screenCenterX).toBe(640)
    expect(layout.screenCenterY).toBe(360)
  })

  it('keeps large boards fully visible on narrow mobile viewports', () => {
    const runtimeBoard = getRuntimeBoardPixelSize(80)
    const layout = getBoardViewportLayout(390, 844, runtimeBoard.width + 48, runtimeBoard.height + 48)

    expect(layout.zoom).toBeGreaterThan(0)
    expect(layout.screenWidth).toBeLessThanOrEqual(390 * 0.8)
    expect(layout.screenHeight).toBeLessThanOrEqual(844 * 0.8)
    expect(layout.screenCenterX).toBe(195)
    expect(layout.screenCenterY).toBe(422)
  })
})
