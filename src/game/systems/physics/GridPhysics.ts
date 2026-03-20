import type { Block } from '../../entities/Block'
import type { Enemy } from '../../entities/Enemy'
import type { Direction, GridPoint, LevelData } from '../../types/level'
import { addPoints, directionVectors, samePoint } from '../../utils/grid'

export interface PushResult {
  moved: boolean
  crushedEnemy?: Enemy
}

export class GridPhysics {
  constructor(private readonly level: LevelData) {}

  isInside(point: GridPoint): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < this.level.width && point.y < this.level.height
  }

  isWall(point: GridPoint): boolean {
    return this.level.walls?.some((wall) => samePoint(wall, point)) ?? false
  }

  getBlockAt(blocks: Block[], point: GridPoint): Block | undefined {
    return blocks.find((block) => samePoint(block.gridPosition, point))
  }

  getEnemyAt(enemies: Enemy[], point: GridPoint): Enemy | undefined {
    return enemies.find((enemy) => enemy.alive && samePoint(enemy.gridPosition, point))
  }

  canMoveTo(point: GridPoint, blocks: Block[]): boolean {
    return this.isInside(point) && !this.isWall(point) && !this.getBlockAt(blocks, point)
  }

  attemptPush(origin: GridPoint, direction: Direction, blocks: Block[], enemies: Enemy[]): PushResult {
    const vector = directionVectors[direction]
    const target = addPoints(origin, vector)
    const block = this.getBlockAt(blocks, target)

    if (!block) {
      return { moved: false }
    }

    const destination = addPoints(block.gridPosition, vector)

    if (!this.isInside(destination) || this.isWall(destination) || this.getBlockAt(blocks, destination)) {
      return { moved: false }
    }

    const crushedEnemy = this.getEnemyAt(enemies, destination)
    if (crushedEnemy) {
      crushedEnemy.squash()
    }

    block.setGridPosition(destination)
    return { moved: true, crushedEnemy }
  }
}
