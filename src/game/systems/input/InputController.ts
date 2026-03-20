import Phaser from 'phaser'
import type { Direction, GridPoint } from '../../types/level'

/** Normalized gameplay command consumed by the pure turn resolver. */
export type InputCommand =
  | { type: 'move'; direction: Direction }
  | { type: 'push'; direction: Direction }

const swipeThreshold = 30
const deadZone = 8

/** Minimal pointer state used to disambiguate clicks, taps, and swipes. */
interface PointerSnapshot {
  x: number
  y: number
  isTouch: boolean
  button: number
}

/**
 * Translates device-specific input into queueable game commands.
 *
 * Responsibilities:
 * - normalize keyboard, mouse, and touch input into `InputCommand`s
 * - preserve the control contract documented in the README/gameplay docs
 * - avoid mutating gameplay state directly
 */
export class InputController {
  private readonly queue: InputCommand[] = []
  private pointerStart?: PointerSnapshot
  private getAnchor: () => GridPoint = () => ({ x: 0, y: 0 })
  private getFacing: () => Direction = () => 'right'
  private shouldPush: (direction: Direction) => boolean = () => false

  constructor(private readonly scene: Phaser.Scene, private readonly tileSize: number) {
    this.bindKeyboard()
    this.bindPointer()
  }

  /** Supplies the current player world position used for directional pointer intent. */
  setAnchorProvider(provider: () => GridPoint): void {
    this.getAnchor = provider
  }

  /** Supplies the last facing direction used when Space triggers a push. */
  setFacingProvider(provider: () => Direction): void {
    this.getFacing = provider
  }

  /** Supplies adjacency logic so touch taps only become pushes when appropriate. */
  setPushIntentProvider(provider: (direction: Direction) => boolean): void {
    this.shouldPush = provider
  }

  /** Returns the next queued command, if any. */
  popCommand(): InputCommand | undefined {
    return this.queue.shift()
  }

  /** Unregisters DOM/input listeners owned by this controller. */
  destroy(): void {
    this.scene.input.keyboard?.removeAllListeners('keydown')
    this.scene.input.off('pointerdown')
    this.scene.input.off('pointerup')
  }

  private enqueue(command: InputCommand): void {
    this.queue.push(command)
  }

  private bindKeyboard(): void {
    this.scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const direction = this.directionFromKey(event.code)
      if (direction) {
        this.enqueue({ type: 'move', direction })
        return
      }

      if (event.code === 'Space') {
        this.enqueue({ type: 'push', direction: this.getFacing() })
      }
    })
  }

  /**
   * Pointer interpretation rules:
   * - desktop left click => movement intent
   * - desktop right click => push intent
   * - touch swipe => movement intent
   * - touch tap near the player + adjacent block => push intent
   * - other touch taps => movement intent
   */
  private bindPointer(): void {
    this.scene.input.mouse?.disableContextMenu()

    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const pointerEvent = pointer.event as PointerEvent | MouseEvent | TouchEvent | undefined
      const button = pointerEvent && 'button' in pointerEvent ? pointerEvent.button : 0
      const isTouch = pointerEvent && 'pointerType' in pointerEvent
        ? pointerEvent.pointerType === 'touch'
        : pointer.wasTouch
      this.pointerStart = {
        x: pointer.worldX,
        y: pointer.worldY,
        isTouch,
        button
      }

      if (!this.pointerStart.isTouch && button === 2) {
        const direction = this.directionFromAnchor(pointer.worldX, pointer.worldY)
        if (direction) {
          this.enqueue({ type: 'push', direction })
        }
      }
    })

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.pointerStart) {
        return
      }

      const start = this.pointerStart
      this.pointerStart = undefined

      if (!start.isTouch && start.button === 2) {
        return
      }

      const deltaX = pointer.worldX - start.x
      const deltaY = pointer.worldY - start.y
      const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY))

      if (start.isTouch && distance >= swipeThreshold) {
        const direction = Math.abs(deltaX) > Math.abs(deltaY)
          ? (deltaX > 0 ? 'right' : 'left')
          : (deltaY > 0 ? 'down' : 'up')
        this.enqueue({ type: 'move', direction })
        return
      }

      const direction = this.directionFromAnchor(pointer.worldX, pointer.worldY)
      if (!direction) {
        return
      }

      if (start.isTouch) {
        const anchor = this.getAnchor()
        const closeToPlayer = Math.max(Math.abs(pointer.worldX - anchor.x), Math.abs(pointer.worldY - anchor.y)) <= this.tileSize * 1.1
        if (closeToPlayer && this.shouldPush(direction)) {
          this.enqueue({ type: 'push', direction })
        } else {
          this.enqueue({ type: 'move', direction })
        }
        return
      }

      this.enqueue({ type: 'move', direction })
    })
  }

  /** Maps supported keyboard bindings to directional commands. */
  private directionFromKey(code: string): Direction | undefined {
    const keyMap: Record<string, Direction> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down'
    }

    return keyMap[code]
  }

  /** Converts pointer position relative to the player anchor into a direction. */
  private directionFromAnchor(worldX: number, worldY: number): Direction | undefined {
    const anchor = this.getAnchor()
    const dx = worldX - anchor.x
    const dy = worldY - anchor.y

    if (Math.abs(dx) < deadZone && Math.abs(dy) < deadZone) {
      return undefined
    }

    return Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up')
  }
}
