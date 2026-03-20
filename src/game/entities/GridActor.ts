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
    this.syncToGrid(gridPosition)
  }

  setGridPosition(gridPosition: GridPoint): void {
    this.syncToGrid(gridPosition)
  }

  syncToGrid(gridPosition: GridPoint): void {
    this.gridPosition = { ...gridPosition }
    this.setPosition(
      this.boardOrigin.x + gridPosition.x * this.tileSize + this.tileSize / 2,
      this.boardOrigin.y + gridPosition.y * this.tileSize + this.tileSize / 2
    )
  }
}
