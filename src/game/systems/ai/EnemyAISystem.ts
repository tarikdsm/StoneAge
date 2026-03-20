import type { Enemy } from '../../entities/Enemy'
import type { Block } from '../../entities/Block'
import type { Direction, GridPoint } from '../../types/level'
import { GridPhysics } from '../physics/GridPhysics'
import { addPoints, directionVectors } from '../../utils/grid'

const directions: Direction[] = ['left', 'right', 'up', 'down']

export class EnemyAISystem {
  constructor(private readonly physics: GridPhysics) {}

  chooseMove(enemy: Enemy, playerPosition: GridPoint, blocks: Block[]): GridPoint {
    const ranked = [...directions].sort((a, b) => {
      const aPos = addPoints(enemy.gridPosition, directionVectors[a])
      const bPos = addPoints(enemy.gridPosition, directionVectors[b])
      const aDistance = Math.abs(aPos.x - playerPosition.x) + Math.abs(aPos.y - playerPosition.y)
      const bDistance = Math.abs(bPos.x - playerPosition.x) + Math.abs(bPos.y - playerPosition.y)
      return aDistance - bDistance
    })

    for (const direction of ranked) {
      const next = addPoints(enemy.gridPosition, directionVectors[direction])
      if (this.physics.canMoveTo(next, blocks)) {
        return next
      }
    }

    return enemy.gridPosition
  }
}
