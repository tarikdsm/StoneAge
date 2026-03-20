import Phaser from 'phaser'
import level01 from '../data/levels/level01.json'
import { createStageState, isGoal, resolveTurn, type StageState } from '../core/StageState'
import { Block } from '../entities/Block'
import { Enemy } from '../entities/Enemy'
import { Player } from '../entities/Player'
import { playPushSfx } from '../audio/playPushSfx'
import { GAME_HEIGHT, GAME_WIDTH } from '../config'
import { InputController, type InputCommand } from '../systems/input/InputController'
import type { Direction, LevelData } from '../types/level'
import { addPoints, directionVectors, samePoint } from '../utils/grid'

interface UIState {
  levelName: string
  enemiesRemaining: number
  objective: string
  status: string
  help: string
}

const levelData = level01 as LevelData

export class GameScene extends Phaser.Scene {
  private readonly level = levelData
  private readonly boardOffset = { x: 0, y: 0 }
  private player!: Player
  private blocks = new Map<string, Block>()
  private enemies = new Map<string, Enemy>()
  private inputController!: InputController
  private state!: StageState
  private isProcessingTurn = false
  private lastDirection: Direction = 'right'
  private statusPulse?: Phaser.GameObjects.Rectangle

  constructor() {
    super('GameScene')
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#08111d')
    this.state = createStageState(this.level)
    this.inputController = new InputController(this, this.level.tileSize)

    this.createBoard()
    this.spawnActors()
    this.bindInputProviders()
    this.syncActors(true)
    this.emitUiState(this.state.message)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.inputController.destroy())
  }

  update(): void {
    if (this.isProcessingTurn || this.state.status !== 'playing') {
      return
    }

    const command = this.inputController.popCommand()
    if (command) {
      void this.processCommand(command)
    }
  }

  private createBoard(): void {
    const boardPixelWidth = this.level.width * this.level.tileSize
    const boardPixelHeight = this.level.height * this.level.tileSize
    this.boardOffset.x = (GAME_WIDTH - boardPixelWidth) / 2
    this.boardOffset.y = (GAME_HEIGHT - boardPixelHeight) / 2 + 18

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 18, GAME_WIDTH, GAME_HEIGHT, 0x060d17, 1)
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 16, boardPixelWidth + 56, boardPixelHeight + 56, 0x0f1b2d, 0.95)
      .setStrokeStyle(4, 0x38bdf8, 0.22)

    this.statusPulse = this.add.rectangle(GAME_WIDTH / 2, this.boardOffset.y - 20, boardPixelWidth, 12, 0x38bdf8, 0.1)

    for (let y = 0; y < this.level.height; y += 1) {
      for (let x = 0; x < this.level.width; x += 1) {
        const isWall = this.level.walls?.some((wall) => wall.x === x && wall.y === y)
        const fill = isWall ? 0x334155 : (x + y) % 2 === 0 ? 0x16243a : 0x122036
        const tile = this.add.rectangle(
          this.boardOffset.x + x * this.level.tileSize + this.level.tileSize / 2,
          this.boardOffset.y + y * this.level.tileSize + this.level.tileSize / 2,
          this.level.tileSize - 2,
          this.level.tileSize - 2,
          fill
        )
        tile.setStrokeStyle(1, isWall ? 0x94a3b8 : 0x1e293b, isWall ? 0.45 : 0.75)

        if (!isWall && (x + y) % 3 === 0) {
          this.add.circle(tile.x, tile.y, 2, 0xffffff, 0.08)
        }
      }
    }

    for (const goal of this.level.goals) {
      const [worldX, worldY] = this.toWorld(goal)
      this.add.circle(worldX, worldY, this.level.tileSize * 0.28, 0xfacc15, 0.18)
      this.add.rectangle(worldX, worldY, this.level.tileSize * 0.72, this.level.tileSize * 0.72, 0xfacc15, 0.12)
        .setStrokeStyle(4, 0xfacc15, 0.9)
    }
  }

  private spawnActors(): void {
    this.player = new Player(this, this.level.tileSize, this.boardOffset, this.state.player)

    for (const block of this.state.blocks) {
      this.blocks.set(block.id, new Block(this, this.level.tileSize, this.boardOffset, block.position, block.id))
    }

    for (const enemy of this.state.enemies) {
      this.enemies.set(enemy.id, new Enemy(this, this.level.tileSize, this.boardOffset, enemy.position))
    }
  }

  private bindInputProviders(): void {
    this.inputController.setAnchorProvider(() => ({ x: this.player.x, y: this.player.y }))
    this.inputController.setFacingProvider(() => this.lastDirection)
    this.inputController.setPushIntentProvider((direction) => {
      const adjacent = addPoints(this.state.player, directionVectors[direction])
      return this.state.blocks.some((block) => samePoint(block.position, adjacent))
    })
  }

  private async processCommand(command: InputCommand): Promise<void> {
    this.isProcessingTurn = true
    if (command.type === 'move') {
      this.lastDirection = command.direction
    } else {
      this.lastDirection = command.direction
    }

    const outcome = resolveTurn(this.level, this.state, command)
    this.state = outcome.state
    this.syncActors()
    this.animateTurnFeedback(outcome)
    this.emitUiState(this.state.message)

    if (this.state.status !== 'playing') {
      this.bindRestartInputs()
    }

    await this.delay(130)
    this.isProcessingTurn = false
  }

  private syncActors(immediate = false): void {
    this.player.setGridPosition(this.state.player, immediate)

    for (const block of this.state.blocks) {
      this.blocks.get(block.id)?.setGridPosition(block.position, immediate)
    }

    for (const enemyState of this.state.enemies) {
      const enemyActor = this.enemies.get(enemyState.id)
      if (!enemyActor) {
        continue
      }

      if (!enemyState.alive) {
        enemyActor.squash()
        this.enemies.delete(enemyState.id)
        continue
      }

      enemyActor.setGridPosition(enemyState.position, immediate)
    }
  }

  private animateTurnFeedback(outcome: ReturnType<typeof resolveTurn>): void {
    if (outcome.pushedBlockId) {
      playPushSfx(this)
    }

    if (this.statusPulse) {
      this.statusPulse.setFillStyle(this.state.status === 'lost' ? 0xfb7185 : this.state.status === 'won' ? 0xfacc15 : 0x38bdf8, 0.22)
      this.tweens.add({
        targets: this.statusPulse,
        alpha: 0.05,
        yoyo: true,
        duration: 150
      })
    }

    if (outcome.crushedEnemyIds.length > 0) {
      this.cameras.main.shake(90, 0.002)
    }
  }

  private bindRestartInputs(): void {
    this.input.once('pointerdown', () => this.scene.restart())
    this.input.keyboard?.once('keydown-ENTER', () => this.scene.restart())
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.restart())
  }

  private emitUiState(status: string): void {
    const payload: UIState = {
      levelName: `${this.level.name}${isGoal(this.level, this.state.player) ? ' • Exit Ready' : ''}`,
      enemiesRemaining: this.state.enemies.filter((enemy) => enemy.alive).length,
      objective: this.level.objective,
      status,
      help: 'Desktop: arrows/WASD move, Space pushes, left click moves, right click pushes. Touch: swipe to move, tap an adjacent block to push.'
    }

    this.game.events.emit('ui:update', payload)
  }

  private toWorld(point: { x: number; y: number }): [number, number] {
    return [
      this.boardOffset.x + point.x * this.level.tileSize + this.level.tileSize / 2,
      this.boardOffset.y + point.y * this.level.tileSize + this.level.tileSize / 2
    ]
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, () => resolve())
    })
  }
}
