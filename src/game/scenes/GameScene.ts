import Phaser from 'phaser'
import level01 from '../data/levels/level01.json'
import { createStageState, isGoal, stepStageState, type StageState } from '../core/StageState'
import { playPushSfx } from '../audio/playPushSfx'
import { Block } from '../entities/Block'
import { Enemy } from '../entities/Enemy'
import { Player } from '../entities/Player'
import { InputController } from '../systems/input/InputController'
import type { Direction, LevelData } from '../types/level'
import { addPoints, directionVectors, samePoint } from '../utils/grid'
import { getBoardViewportLayout } from '../utils/layout'

interface UIState {
  levelName: string
  enemiesRemaining: number
  objective: string
  status: string
  help: string
}

const levelData = level01 as LevelData
const BOARD_FRAME_PADDING = 24

/**
 * Thin Phaser runtime scene responsible for:
 * - building the authored board visuals
 * - sampling normalized input
 * - advancing the pure `StageState` simulation
 * - fitting and centering the board inside the current browser viewport
 */
export class GameScene extends Phaser.Scene {
  private readonly level = levelData
  private readonly boardOffset = { x: BOARD_FRAME_PADDING, y: BOARD_FRAME_PADDING }
  private player!: Player
  private blocks = new Map<string, Block>()
  private enemies = new Map<string, Enemy>()
  private inputController!: InputController
  private state!: StageState
  private lastDirection: Direction = 'right'
  private statusPulse?: Phaser.GameObjects.Rectangle
  private enterKey?: Phaser.Input.Keyboard.Key
  private spaceKey?: Phaser.Input.Keyboard.Key

  constructor() {
    super('GameScene')
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#08111d')
    this.state = createStageState(this.level)
    this.inputController = new InputController(this, this.level.tileSize)

    this.enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    this.createBoard()
    this.spawnActors()
    this.bindInputProviders()
    this.applyResponsiveLayout(this.scale.width, this.scale.height)
    this.syncActors()
    this.emitUiState(this.state.message)

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
      this.inputController.destroy()
    })
  }

  update(_: number, delta: number): void {
    if (this.state.status !== 'playing') {
      if ((this.enterKey ? Phaser.Input.Keyboard.JustDown(this.enterKey) : false)
        || (this.spaceKey ? Phaser.Input.Keyboard.JustDown(this.spaceKey) : false)
        || this.input.activePointer.leftButtonDown()
        || this.input.activePointer.rightButtonDown()) {
        this.scene.restart()
      }
      return
    }

    const input = this.inputController.snapshot()
    if (input.moveDirection) {
      this.lastDirection = input.moveDirection
    }
    if (input.pushDirection) {
      this.lastDirection = input.pushDirection
    }

    const outcome = stepStageState(this.level, this.state, input, delta)
    this.syncActors()
    this.animateFrameFeedback(outcome)
    this.emitUiState(this.state.message)
  }

  private createBoard(): void {
    const boardPixelWidth = this.getBoardPixelWidth()
    const boardPixelHeight = this.getBoardPixelHeight()
    const boardCenterX = this.getBoardCenterX()
    const boardCenterY = this.getBoardCenterY()

    this.add.rectangle(
      boardCenterX,
      boardCenterY,
      boardPixelWidth + BOARD_FRAME_PADDING * 2,
      boardPixelHeight + BOARD_FRAME_PADDING * 2,
      0x0f1b2d,
      0.96
    ).setStrokeStyle(4, 0x38bdf8, 0.22)

    this.add.rectangle(
      boardCenterX,
      boardCenterY,
      boardPixelWidth + 10,
      boardPixelHeight + 10,
      0x091423,
      1
    ).setStrokeStyle(2, 0x1e293b, 0.85)

    this.statusPulse = this.add.rectangle(
      boardCenterX,
      this.boardOffset.y + this.level.tileSize * 0.18,
      Math.max(boardPixelWidth - 18, 16),
      10,
      0x38bdf8,
      0.12
    )

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
    this.player = new Player(this, this.level.tileSize, this.boardOffset, this.state.player.gridPosition)

    for (const block of this.state.blocks) {
      this.blocks.set(block.id, new Block(this, this.level.tileSize, this.boardOffset, block.gridPosition, block.id))
    }

    for (const enemy of this.state.enemies) {
      this.enemies.set(enemy.id, new Enemy(this, this.level.tileSize, this.boardOffset, enemy.gridPosition))
    }
  }

  private bindInputProviders(): void {
    this.inputController.setAnchorProvider(() => this.player)
    this.inputController.setFacingProvider(() => this.lastDirection)
    this.inputController.setPushIntentProvider((direction) => {
      const adjacent = addPoints(this.state.player.gridPosition, directionVectors[direction])
      return this.state.blocks.some((block) => samePoint(block.gridPosition, adjacent) && !block.motion)
    })
  }

  private syncActors(): void {
    this.player.syncFromState(this.state.player)

    for (const block of this.state.blocks) {
      this.blocks.get(block.id)?.syncFromState(block)
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

      enemyActor.syncFromState(enemyState)
    }
  }

  private animateFrameFeedback(outcome: ReturnType<typeof stepStageState>): void {
    if (outcome.pushedBlockId) {
      playPushSfx(this)
    }

    if (this.statusPulse) {
      this.statusPulse.setFillStyle(this.state.status === 'lost' ? 0xfb7185 : this.state.status === 'won' ? 0xfacc15 : 0x38bdf8, 0.22)
      if (outcome.pushedBlockId || outcome.crushedEnemyIds.length > 0 || outcome.statusChanged) {
        this.tweens.add({
          targets: this.statusPulse,
          alpha: 0.05,
          yoyo: true,
          duration: 150
        })
      }
    }

    if (outcome.crushedEnemyIds.length > 0) {
      this.cameras.main.shake(90, 0.002)
    }
  }

  private emitUiState(status: string): void {
    const payload: UIState = {
      levelName: `${this.level.name}${isGoal(this.level, this.state.player.gridPosition) ? ' - Exit Ready' : ''}`,
      enemiesRemaining: this.state.enemies.filter((enemy) => enemy.alive).length,
      objective: this.level.objective,
      status,
      help: 'Desktop: hold arrows/WASD to move, Space pushes, left click steers, right click pushes. Touch: swipe to steer, tap an adjacent block to push.'
    }

    this.game.events.emit('ui:update', payload)
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.applyResponsiveLayout(gameSize.width, gameSize.height)
  }

  private applyResponsiveLayout(viewportWidth: number, viewportHeight: number): void {
    const camera = this.cameras.main
    const layout = getBoardViewportLayout(
      viewportWidth,
      viewportHeight,
      this.getBoardPixelWidth() + BOARD_FRAME_PADDING * 2,
      this.getBoardPixelHeight() + BOARD_FRAME_PADDING * 2
    )

    camera.setSize(viewportWidth, viewportHeight)
    camera.setZoom(layout.zoom)
    camera.centerOn(this.getBoardCenterX(), this.getBoardCenterY())
  }

  private getBoardPixelWidth(): number {
    return this.level.width * this.level.tileSize
  }

  private getBoardPixelHeight(): number {
    return this.level.height * this.level.tileSize
  }

  private getBoardCenterX(): number {
    return this.boardOffset.x + this.getBoardPixelWidth() / 2
  }

  private getBoardCenterY(): number {
    return this.boardOffset.y + this.getBoardPixelHeight() / 2
  }

  private toWorld(point: { x: number; y: number }): [number, number] {
    return [
      this.boardOffset.x + point.x * this.level.tileSize + this.level.tileSize / 2,
      this.boardOffset.y + point.y * this.level.tileSize + this.level.tileSize / 2
    ]
  }
}
