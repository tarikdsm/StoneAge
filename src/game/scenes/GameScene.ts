import Phaser from 'phaser'
import {
  applyRunProgressUpdate,
  cloneRunProgressState,
  createRunProgressState,
  formatRunStats,
  type RunProgressState
} from '../core/RunProgress'
import { formatLevelLabel, getLevel, getNextLevelSlot } from '../data/levelRepository'
import { createStageState, stepStageState, type SimulationInput, type SimulationOutcome, type StageState } from '../core/StageState'
import { playPushSfx } from '../audio/playPushSfx'
import { Block } from '../entities/Block'
import { Enemy } from '../entities/Enemy'
import { Player } from '../entities/Player'
import { RuleBasedPlayerPolicy } from '../systems/ai/RuleBasedPlayerPolicy'
import { SimulationController } from '../systems/ai/SimulationController'
import { InputController } from '../systems/input/InputController'
import type { Direction, LevelData } from '../types/level'
import { RUNTIME_BOARD_HEIGHT, RUNTIME_BOARD_LABEL, RUNTIME_BOARD_WIDTH, hasCanonicalRuntimeBoardSize } from '../utils/boardGeometry'
import { addPoints, directionVectors, samePoint } from '../utils/grid'
import { getBoardViewportLayout } from '../utils/layout'

type ControlMode = 'human' | 'simulation'

interface GameSceneData {
  levelSlot?: number
  controlMode?: ControlMode
  runProgress?: RunProgressState
}

interface UIState {
  levelName: string
  enemiesRemaining: number
  objective: string
  status: string
  help: string
  score: number
  runStats: string
  simulatorPolicyLabel?: string
}

const BOARD_FRAME_PADDING = 24
const AUTO_ADVANCE_DELAY_MS = 900
const PLAYER_CAUGHT_ANIMATION_MS = 700

/**
 * Thin Phaser runtime scene responsible for:
 * - building the canonical 12x12 runtime board visuals
 * - sampling normalized input
 * - advancing the pure `StageState` simulation
 * - fitting and centering the board inside the current browser viewport
 * - loading campaign levels through the browser-friendly level repository
 */
export class GameScene extends Phaser.Scene {
  private readonly boardOffset = { x: BOARD_FRAME_PADDING, y: BOARD_FRAME_PADDING }
  private level!: LevelData
  private levelSlot = 1
  private player!: Player
  private blocks = new Map<string, Block>()
  private enemies = new Map<string, Enemy>()
  private inputController?: InputController
  private simulationController?: SimulationController
  private state!: StageState
  private lastDirection: Direction = 'right'
  private statusPulse?: Phaser.GameObjects.Rectangle
  private enterKey?: Phaser.Input.Keyboard.Key
  private spaceKey?: Phaser.Input.Keyboard.Key
  private pendingStatusMessage?: string
  private pendingAdvance?: Phaser.Time.TimerEvent
  private playerCaughtAnimationStarted = false
  private continueLockedUntilMs = 0
  private transientStatusMessage?: string
  private transientStatusUntilMs = 0
  private loadingText?: Phaser.GameObjects.Text
  private ready = false
  private launchCombos = new Map<string, number>()
  private runProgress = createRunProgressState()
  private controlMode: ControlMode = 'human'

  constructor() {
    super('GameScene')
  }

  create(data: GameSceneData = {}): void {
    this.controlMode = data.controlMode ?? 'human'
    this.cameras.main.setBackgroundColor('#08111d')
    this.blocks.clear()
    this.enemies.clear()
    this.pendingStatusMessage = undefined
    this.pendingAdvance = undefined
    this.playerCaughtAnimationStarted = false
    this.continueLockedUntilMs = 0
    this.transientStatusMessage = undefined
    this.transientStatusUntilMs = 0
    this.lastDirection = 'right'
    this.ready = false
    this.launchCombos.clear()
    this.runProgress = createRunProgressState(data.runProgress)
    this.inputController = undefined
    this.simulationController = undefined
    this.loadingText = this.add.text(this.scale.width / 2, this.scale.height / 2, this.controlMode === 'simulation' ? 'Loading simulator...' : 'Loading map...', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#e2e8f0',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5)

    this.enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.game.events.on('ui:toggle-simulator-player-policy', this.handleSimulatorPolicyToggle, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
      this.pendingAdvance?.remove(false)
      this.inputController?.destroy()
      this.game.events.off('ui:toggle-simulator-player-policy', this.handleSimulatorPolicyToggle, this)
    })

    void this.initializeScene(data)
  }

  update(_: number, delta: number): void {
    if (!this.ready) {
      return
    }

    if (this.state.status !== 'playing') {
      this.emitRuntimeUiState(this.resolveStatusMessage())

      if (this.controlMode === 'human' && !this.pendingAdvance && this.time.now >= this.continueLockedUntilMs && this.didPressContinue()) {
        if (this.state.status === 'lost') {
          this.scene.restart({
            levelSlot: this.levelSlot,
            controlMode: this.controlMode,
            runProgress: cloneRunProgressState(this.runProgress)
          })
        } else {
          this.returnToMenu()
        }
      }
      return
    }

    const input = this.getStepInput()
    if (input.moveDirection) {
      this.lastDirection = input.moveDirection
    }
    if (input.pushDirection) {
      this.lastDirection = input.pushDirection
    }

    const outcome = stepStageState(this.level, this.state, input, delta)
    this.applyRunProgress(outcome)
    if (outcome.statusChanged) {
      void this.handleStatusChange()
    }

    this.syncActors()
    this.animateFrameFeedback(outcome)
    this.emitRuntimeUiState(this.resolveStatusMessage())
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

    for (let y = 0; y < RUNTIME_BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < RUNTIME_BOARD_WIDTH; x += 1) {
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
    if (!this.inputController) {
      return
    }

    this.inputController.setAnchorProvider(() => this.player)
    this.inputController.setFacingProvider(() => this.lastDirection)
    this.inputController.setPushIntentProvider((direction) => {
      const adjacent = addPoints(this.state.player.gridPosition, directionVectors[direction])
      return this.state.blocks.some((block) => samePoint(block.gridPosition, adjacent) && !block.motion)
    })
  }

  private syncActors(): void {
    const activeBlockIds = new Set(this.state.blocks.map((block) => block.id))
    for (const [blockId, blockActor] of this.blocks) {
      if (activeBlockIds.has(blockId)) {
        continue
      }

      blockActor.explode()
      this.launchCombos.delete(blockId)
      this.blocks.delete(blockId)
    }

    this.player.syncFromState(this.state.player)

    for (const block of this.state.blocks) {
      if (!this.blocks.has(block.id)) {
        this.blocks.set(block.id, new Block(this, this.level.tileSize, this.boardOffset, block.gridPosition, block.id))
      }

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

  private animateFrameFeedback(outcome: SimulationOutcome): void {
    if (outcome.pushedBlockId) {
      playPushSfx(this)
      const blockActor = this.blocks.get(outcome.pushedBlockId)
      blockActor?.pulseLaunch()

      if (outcome.crushedEnemyIds.length > 0) {
        const nextCombo = (this.launchCombos.get(outcome.pushedBlockId) ?? 0) + outcome.crushedEnemyIds.length
        this.launchCombos.set(outcome.pushedBlockId, nextCombo)
        blockActor?.playCombo(nextCombo)
      } else if (this.state.blocks.find((block) => block.id === outcome.pushedBlockId)?.slideDirection) {
        this.launchCombos.set(outcome.pushedBlockId, 0)
      }
    }

    for (const pushedEnemyId of outcome.pushedEnemyIds) {
      this.enemies.get(pushedEnemyId)?.playBlockPushReaction()
    }

    for (const hatchedEnemyId of outcome.hatchedEnemyIds) {
      this.enemies.get(hatchedEnemyId)?.playHatchBurst()
    }

    if (this.statusPulse) {
      this.statusPulse.setFillStyle(this.state.status === 'lost' ? 0xfb7185 : this.state.status === 'won' ? 0xfacc15 : 0x38bdf8, 0.22)
      if (outcome.pushedBlockId || outcome.destroyedBlockIds.length > 0 || outcome.crushedEnemyIds.length > 0 || outcome.hatchedEnemyIds.length > 0 || outcome.spawnedBlockIds.length > 0 || outcome.statusChanged) {
        this.tweens.add({
          targets: this.statusPulse,
          alpha: 0.05,
          yoyo: true,
          duration: 150
        })
      }
    }

    if (outcome.crushedEnemyIds.length > 0) {
      this.cameras.main.shake(90 + outcome.crushedEnemyIds.length * 35, 0.0022 + outcome.crushedEnemyIds.length * 0.0004)
    }

    if (outcome.destroyedBlockIds.length > 0) {
      this.cameras.main.shake(120, 0.003)
    }

    if (outcome.statusChanged && this.state.status === 'lost') {
      this.cameras.main.shake(220, 0.004)
      this.playPlayerCaughtAnimation()
    }
  }

  private applyRunProgress(outcome: SimulationOutcome): void {
    const result = applyRunProgressUpdate(this.runProgress, {
      stageElapsedMs: this.state.elapsedMs,
      crushedEnemyCount: outcome.crushedEnemyIds.length,
      stageStatus: this.state.status,
      statusChanged: outcome.statusChanged
    })

    this.runProgress = result.progress
    for (const scoreDelta of result.scoreDeltas) {
      this.game.events.emit('ui:score-delta', scoreDelta)
    }
  }

  private emitUiState(status: string): void {
    const payload: UIState = {
      levelName: `${this.controlMode === 'simulation' ? 'Simulator' : 'Campaign'} • ${formatLevelLabel(this.levelSlot)} - ${this.level.name}`,
      enemiesRemaining: this.state.enemies.filter((enemy) => enemy.alive).length,
      objective: this.level.objective,
      status,
      help: this.controlMode === 'simulation'
        ? `Simulator: ${this.simulationController?.label ?? 'Rule-based bot'} controls the player, NPCs keep using the core AI, losses auto-retry, and clears auto-advance.`
        : 'Desktop: hold arrows/WASD to move or auto-push, Space + direction launches a block, left click steers, right click pushes. Touch: swipe to move or push, tap an adjacent block to push, forceful tap launches.',
      score: this.runProgress.score,
      runStats: formatRunStats(this.runProgress, this.state.elapsedMs)
    }

    this.game.events.emit('ui:update', payload)
  }

  private emitRuntimeUiState(status: string): void {
    this.game.events.emit('ui:update', {
      levelName: `${this.controlMode === 'simulation' ? 'Simulator' : 'Campaign'} - ${formatLevelLabel(this.levelSlot)} - ${this.level.name}`,
      enemiesRemaining: this.state.enemies.filter((enemy) => enemy.alive).length,
      objective: this.level.objective,
      status,
      help: this.controlMode === 'simulation'
        ? `Simulator: ${this.simulationController?.label ?? 'Heuristic bot'} controls the player, the HUD toggle swaps between Heuristico and IA when a trained model is available, NPCs keep using the core AI, losses auto-retry, and clears auto-advance.`
        : 'Desktop: hold arrows/WASD to move or auto-push, Space + direction launches a block, left click steers, right click pushes. Touch: swipe to move or push, tap an adjacent block to push, forceful tap launches.',
      score: this.runProgress.score,
      runStats: formatRunStats(this.runProgress, this.state.elapsedMs),
      simulatorPolicyLabel: this.controlMode === 'simulation'
        ? this.simulationController?.toggleLabel
        : undefined
    } satisfies UIState)
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    if (!this.ready) {
      this.loadingText?.setPosition(gameSize.width / 2, gameSize.height / 2)
      return
    }

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

  private async handleStatusChange(): Promise<void> {
    if (this.state.status === 'lost') {
      this.pendingAdvance?.remove(false)
      this.pendingStatusMessage = this.controlMode === 'simulation'
        ? 'Simulator lost the run. Auto-retrying...'
        : undefined
      this.continueLockedUntilMs = this.time.now + PLAYER_CAUGHT_ANIMATION_MS
      if (this.controlMode === 'simulation') {
        this.pendingAdvance = this.time.delayedCall(PLAYER_CAUGHT_ANIMATION_MS + AUTO_ADVANCE_DELAY_MS, () => {
          this.scene.restart({
            levelSlot: this.levelSlot,
            controlMode: this.controlMode,
            runProgress: cloneRunProgressState(this.runProgress)
          })
        })
      }
      return
    }

    if (this.state.status !== 'won') {
      this.pendingStatusMessage = undefined
      return
    }

    const nextSlot = await getNextLevelSlot(this.levelSlot)
    if (!nextSlot) {
      if (this.controlMode === 'simulation') {
        this.pendingStatusMessage = 'Simulation campaign clear! Returning to the menu...'
        this.pendingAdvance = this.time.delayedCall(AUTO_ADVANCE_DELAY_MS * 2, () => {
          this.returnToMenu()
        })
      } else {
        this.pendingStatusMessage = 'Campaign clear! Tap, click, Enter, or Space to return to the menu.'
      }
      return
    }

    this.pendingAdvance?.remove(false)
    this.pendingStatusMessage = this.controlMode === 'simulation'
      ? `Simulator cleared ${formatLevelLabel(this.levelSlot)}. Loading ${formatLevelLabel(nextSlot)}...`
      : `${formatLevelLabel(this.levelSlot)} clear. Loading ${formatLevelLabel(nextSlot)}...`
    this.pendingAdvance = this.time.delayedCall(AUTO_ADVANCE_DELAY_MS, () => {
      this.scene.restart({
        levelSlot: nextSlot,
        controlMode: this.controlMode,
        runProgress: cloneRunProgressState(this.runProgress)
      })
    })
  }

  private didPressContinue(): boolean {
    return (this.enterKey ? Phaser.Input.Keyboard.JustDown(this.enterKey) : false)
      || (this.spaceKey ? Phaser.Input.Keyboard.JustDown(this.spaceKey) : false)
      || this.input.activePointer.leftButtonDown()
      || this.input.activePointer.rightButtonDown()
  }

  private async resolveLevel(slot: number): Promise<{ slot: number; level: LevelData }> {
    const resolvedLevel = await getLevel(slot)
    if (resolvedLevel) {
      return { slot, level: resolvedLevel }
    }

    return {
      slot: 1,
      level: await getLevel(1) as LevelData
    }
  }

  private returnToMenu(): void {
    this.scene.stop('UIScene')
    this.scene.start('MenuScene')
  }

  private playPlayerCaughtAnimation(): void {
    if (this.playerCaughtAnimationStarted) {
      return
    }

    this.playerCaughtAnimationStarted = true
    const predator = this.findClosestLivingEnemy()
    predator?.playDevourReaction()
    this.player.playConsumedBy(predator ?? this.player)
  }

  private findClosestLivingEnemy(): Enemy | undefined {
    let closestEnemy: Enemy | undefined
    let closestDistance = Number.POSITIVE_INFINITY

    for (const enemyState of this.state.enemies) {
      if (!enemyState.alive) {
        continue
      }

      const enemyActor = this.enemies.get(enemyState.id)
      if (!enemyActor) {
        continue
      }

      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemyActor.x, enemyActor.y)
      if (distance < closestDistance) {
        closestDistance = distance
        closestEnemy = enemyActor
      }
    }

    return closestEnemy
  }

  private getBoardPixelWidth(): number {
    return RUNTIME_BOARD_WIDTH * this.level.tileSize
  }

  private getBoardPixelHeight(): number {
    return RUNTIME_BOARD_HEIGHT * this.level.tileSize
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

  private async initializeScene(data: GameSceneData): Promise<void> {
    try {
      const resolved = await this.resolveLevel(data.levelSlot ?? 1)
      this.levelSlot = resolved.slot
      this.level = resolved.level
      if (!hasCanonicalRuntimeBoardSize(this.level.width, this.level.height)) {
        throw new Error(`Loaded level must use the canonical ${RUNTIME_BOARD_LABEL} runtime board.`)
      }
      this.state = createStageState(this.level)
      if (this.controlMode === 'simulation') {
        this.simulationController = new SimulationController(new RuleBasedPlayerPolicy())
      } else {
        this.inputController = new InputController(this, this.level.tileSize)
      }

      if (!this.scene.isActive('UIScene')) {
        this.scene.launch('UIScene')
      }

      this.createBoard()
      this.spawnActors()
      this.bindInputProviders()
      this.applyResponsiveLayout(this.scale.width, this.scale.height)
      this.syncActors()
      this.emitRuntimeUiState(this.state.message)
      this.ready = true
      this.loadingText?.destroy()
      this.loadingText = undefined
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load the selected map.'
      this.loadingText
        ?.setText(message)
        .setColor('#fda4af')
        .setWordWrapWidth(Math.max(this.scale.width * 0.7, 220))
    }
  }

  private async handleSimulatorPolicyToggle(): Promise<void> {
    if (!this.ready || this.controlMode !== 'simulation' || !this.simulationController) {
      return
    }

    const result = await this.simulationController.toggleMode()
    this.setTransientStatus(result.message)
    this.emitRuntimeUiState(this.resolveStatusMessage())
  }

  private setTransientStatus(message: string, durationMs = 1800): void {
    this.transientStatusMessage = message
    this.transientStatusUntilMs = this.time.now + durationMs
  }

  private resolveStatusMessage(): string {
    if (this.transientStatusMessage && this.time.now <= this.transientStatusUntilMs) {
      return this.transientStatusMessage
    }

    this.transientStatusMessage = undefined
    return this.pendingStatusMessage ?? this.state.message
  }

  private getStepInput(): SimulationInput {
    if (this.controlMode === 'simulation') {
      return this.simulationController?.snapshot(this.level, this.state) ?? {}
    }

    return this.inputController?.snapshot() ?? {}
  }
}
