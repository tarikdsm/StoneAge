import Phaser from 'phaser'
import type { GridPoint } from '../types/level'

export class GridActor extends Phaser.GameObjects.Container {
  gridPosition: GridPoint
  protected readonly tileSize: number
  private readonly boardOrigin: GridPoint

  constructor(scene: Phaser.Scene, tileSize: number, boardOrigin: GridPoint, gridPosition: GridPoint) {
    super(scene, 0, 0)
    this.tileSize = tileSize
    this.boardOrigin = boardOrigin
    this.gridPosition = { ...gridPosition }
    this.syncToGrid(true)
  }

  setGridPosition(next: GridPoint, immediate = false): void {
    this.gridPosition = { ...next }
    this.syncToGrid(immediate)
  }

  syncToGrid(immediate = false): void {
    const worldX = this.boardOrigin.x + this.gridPosition.x * this.tileSize + this.tileSize / 2
    const worldY = this.boardOrigin.y + this.gridPosition.y * this.tileSize + this.tileSize / 2

    if (immediate) {
      this.setPosition(worldX, worldY)
      return
    }

    this.scene.tweens.add({
      targets: this,
      x: worldX,
      y: worldY,
      duration: 90,
      ease: 'Quad.Out'
    })
  }
}
