import Phaser from 'phaser'
import type { Direction, GridPoint } from '../../types/level'

const swipeThreshold = 30
const deadZone = 8

interface PointerSnapshot {
  screenX: number
  screenY: number
  isTouch: boolean
  button: number
}

export interface RealtimeInputSnapshot {
  moveDirection?: Direction
  pushDirection?: Direction
}

/**
 * Normalizes raw keyboard, mouse, and touch input into gameplay intent.
 *
 * This module deliberately stops at "player intention". It does not mutate the
 * simulation directly; `GameScene` forwards the resulting snapshot into the pure
 * core step function.
 */
export class InputController {
  private pointerStart?: PointerSnapshot
  private pointerMoveDirection?: Direction
  private queuedPushDirection?: Direction
  private getAnchor: () => GridPoint = () => ({ x: 0, y: 0 })
  private getFacing: () => Direction = () => 'right'
  private shouldPush: (direction: Direction) => boolean = () => false
  private movementKeys = new Set<string>()

  constructor(private readonly scene: Phaser.Scene, private readonly tileSize: number) {
    this.bindKeyboard()
    this.bindPointer()
  }

  setAnchorProvider(provider: () => GridPoint): void {
    this.getAnchor = provider
  }

  setFacingProvider(provider: () => Direction): void {
    this.getFacing = provider
  }

  setPushIntentProvider(provider: (direction: Direction) => boolean): void {
    this.shouldPush = provider
  }

  snapshot(): RealtimeInputSnapshot {
    return {
      moveDirection: this.getMovementDirection(),
      pushDirection: this.consumePushDirection()
    }
  }

  destroy(): void {
    this.scene.input.keyboard?.removeAllListeners('keydown')
    this.scene.input.keyboard?.removeAllListeners('keyup')
    this.scene.input.off('pointerdown')
    this.scene.input.off('pointerup')
  }

  private bindKeyboard(): void {
    this.scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const direction = this.directionFromKey(event.code)
      if (direction) {
        this.movementKeys.add(event.code)
        return
      }

      if (event.code === 'Space') {
        this.queuedPushDirection = this.getFacing()
      }
    })

    this.scene.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
      const direction = this.directionFromKey(event.code)
      if (direction) {
        this.movementKeys.delete(event.code)
      }
    })
  }

  private bindPointer(): void {
    this.scene.input.mouse?.disableContextMenu()

    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const pointerEvent = pointer.event as PointerEvent | MouseEvent | TouchEvent | undefined
      const button = pointerEvent && 'button' in pointerEvent ? pointerEvent.button : 0
      const isTouch = pointerEvent && 'pointerType' in pointerEvent
        ? pointerEvent.pointerType === 'touch'
        : pointer.wasTouch

      this.pointerStart = {
        screenX: pointer.x,
        screenY: pointer.y,
        isTouch,
        button
      }

      if (!isTouch && button === 2) {
        const direction = this.directionFromAnchor(pointer.worldX, pointer.worldY)
        if (direction) {
          this.queuedPushDirection = direction
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

      const deltaX = pointer.x - start.screenX
      const deltaY = pointer.y - start.screenY
      const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY))

      if (start.isTouch && distance >= swipeThreshold) {
        this.pointerMoveDirection = Math.abs(deltaX) > Math.abs(deltaY)
          ? (deltaX > 0 ? 'right' : 'left')
          : (deltaY > 0 ? 'down' : 'up')
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
          this.queuedPushDirection = direction
        } else {
          this.pointerMoveDirection = direction
        }
        return
      }

      this.pointerMoveDirection = direction
    })
  }

  private consumePushDirection(): Direction | undefined {
    const pushDirection = this.queuedPushDirection
    this.queuedPushDirection = undefined
    return pushDirection
  }

  private getMovementDirection(): Direction | undefined {
    const activeKeyboardCodes = [...this.movementKeys]
    const latestKeyboardCode = activeKeyboardCodes[activeKeyboardCodes.length - 1]
    if (latestKeyboardCode) {
      return this.directionFromKey(latestKeyboardCode)
    }

    return this.pointerMoveDirection
  }

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
