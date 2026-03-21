import Phaser from 'phaser'
import {
  MAP_MAX_SLOT,
  createBrowserStorage,
  createEmptyEditableLevel,
  deleteLevel,
  editableLevelFromLevel,
  formatLevelLabel,
  formatLevelName,
  getFirstAvailableCustomSlot,
  getLevel,
  listLevelSummaries,
  sanitizeSlot,
  saveEditableLevel,
  validateEditableLevel,
  PLAYABLE_GRID_SIZE
} from '../data/levelRepository'
import type { EditableLevelData, EditorTool, LevelSummary } from '../types/editor'
import type { GridPoint } from '../types/level'
import { samePoint } from '../utils/grid'
import { clamp } from '../utils/layout'

interface EditorButton {
  background: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  onClick: () => void
  active: boolean
  disabled: boolean
  hovered: boolean
}

const TOOL_ORDER: EditorTool[] = ['player', 'block', 'column', 'enemy', 'exit', 'erase']

const TOOL_LABELS: Record<EditorTool, string> = {
  player: 'Player',
  block: 'Blocks',
  column: 'Columns',
  enemy: 'NPCs',
  exit: 'Exit',
  erase: 'Eraser'
}

/**
 * Browser-side map editor scene for 10x10 playable layouts.
 *
 * The scene edits a simplified authoring representation and relies on the
 * level repository to convert that representation into runtime `LevelData`.
 */
export class MapEditorScene extends Phaser.Scene {
  private readonly storage = createBrowserStorage()
  private background?: Phaser.GameObjects.Rectangle
  private headerPanel?: Phaser.GameObjects.Rectangle
  private leftPanel?: Phaser.GameObjects.Rectangle
  private rightPanel?: Phaser.GameObjects.Rectangle
  private boardFrame?: Phaser.GameObjects.Rectangle
  private boardFill?: Phaser.GameObjects.Rectangle
  private titleText?: Phaser.GameObjects.Text
  private statusText?: Phaser.GameObjects.Text
  private leftTitleText?: Phaser.GameObjects.Text
  private rightTitleText?: Phaser.GameObjects.Text
  private editorTitleText?: Phaser.GameObjects.Text
  private countsText?: Phaser.GameObjects.Text
  private slotText?: Phaser.GameObjects.Text
  private toolHintText?: Phaser.GameObjects.Text
  private paginationText?: Phaser.GameObjects.Text
  private gridOrigin = { x: 0, y: 0 }
  private cellSize = 32
  private mapSummaries: LevelSummary[] = []
  private mapButtons: EditorButton[] = []
  private toolButtons = new Map<EditorTool, EditorButton>()
  private selectedTool: EditorTool = 'player'
  private editorState: EditableLevelData = createEmptyEditableLevel(2)
  private editorMode: 'new' | 'existing' = 'new'
  private listPage = 0
  private listPageSize = 8
  private gridCells: Phaser.GameObjects.Rectangle[][] = []
  private markerLayer?: Phaser.GameObjects.Container
  private backButton?: EditorButton
  private newButton?: EditorButton
  private previousPageButton?: EditorButton
  private nextPageButton?: EditorButton
  private saveButton?: EditorButton
  private deleteButton?: EditorButton
  private slotMinusButton?: EditorButton
  private slotPlusButton?: EditorButton

  constructor() {
    super('MapEditorScene')
  }

  create(): void {
    this.scene.stop('UIScene')
    this.cameras.main.setBackgroundColor('#09111f')

    this.background = this.add.rectangle(0, 0, 10, 10, 0x09111f).setOrigin(0)
    this.headerPanel = this.add.rectangle(0, 0, 10, 10, 0x0f172a, 0.95).setOrigin(0)
      .setStrokeStyle(2, 0x38bdf8, 0.22)
    this.leftPanel = this.add.rectangle(0, 0, 10, 10, 0x111b2f, 0.96).setOrigin(0)
      .setStrokeStyle(2, 0x38bdf8, 0.2)
    this.rightPanel = this.add.rectangle(0, 0, 10, 10, 0x111b2f, 0.96).setOrigin(0)
      .setStrokeStyle(2, 0x38bdf8, 0.2)
    this.boardFrame = this.add.rectangle(0, 0, 10, 10, 0x0f1b2d, 0.98).setOrigin(0)
      .setStrokeStyle(3, 0x38bdf8, 0.24)
    this.boardFill = this.add.rectangle(0, 0, 10, 10, 0x08111d, 1).setOrigin(0)
      .setStrokeStyle(2, 0x1e293b, 0.8)

    this.titleText = this.add.text(0, 0, 'MAP GENERATOR', {
      fontFamily: 'Arial',
      color: '#f8fafc',
      fontStyle: 'bold'
    })

    this.statusText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#cbd5e1'
    })

    this.leftTitleText = this.add.text(0, 0, 'Maps', {
      fontFamily: 'Arial',
      color: '#f8fafc',
      fontStyle: 'bold'
    })

    this.rightTitleText = this.add.text(0, 0, 'Palette', {
      fontFamily: 'Arial',
      color: '#f8fafc',
      fontStyle: 'bold'
    })

    this.editorTitleText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#f8fafc',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5, 0)

    this.countsText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5, 0)

    this.slotText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#facc15',
      align: 'center'
    }).setOrigin(0.5, 0)

    this.toolHintText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#93c5fd',
      align: 'left'
    })

    this.paginationText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5)

    this.backButton = this.createButton('Back', () => this.scene.start('MenuScene'))
    this.newButton = this.createButton('New Map', () => this.resetToNewMap('New blank 10x10 map ready.'))
    this.previousPageButton = this.createButton('Prev', () => this.changePage(-1))
    this.nextPageButton = this.createButton('Next', () => this.changePage(1))
    this.saveButton = this.createButton('Save Map', () => this.saveCurrentMap())
    this.deleteButton = this.createButton('Delete Map', () => this.deleteCurrentMap())
    this.slotMinusButton = this.createButton('-', () => this.adjustNewSlot(-1))
    this.slotPlusButton = this.createButton('+', () => this.adjustNewSlot(1))

    for (const tool of TOOL_ORDER) {
      this.toolButtons.set(tool, this.createButton(TOOL_LABELS[tool], () => {
        this.selectedTool = tool
        this.updateButtonStates()
      }))
    }

    this.createGrid()
    this.refreshMapSummaries()
    this.resetToNewMap('New blank 10x10 map ready.')
    this.layoutScene(this.scale.width, this.scale.height)

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    })
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.layoutScene(gameSize.width, gameSize.height)
  }

  private layoutScene(width: number, height: number): void {
    const headerHeight = clamp(height * 0.11, 72, 92)
    const padding = clamp(Math.min(width, height) * 0.018, 10, 22)
    const narrow = width < 900
    const panelWidth = clamp(width * (narrow ? 0.21 : 0.2), narrow ? 84 : 170, narrow ? 132 : 250)
    const contentTop = headerHeight + padding
    const contentHeight = height - contentTop - padding
    const boardAreaLeft = padding + panelWidth + padding
    const boardAreaRight = width - padding - panelWidth - padding
    const boardAreaWidth = Math.max(160, boardAreaRight - boardAreaLeft)
    const boardSide = Math.max(160, Math.min(boardAreaWidth, contentHeight - padding * 2))
    const boardLeft = boardAreaLeft + (boardAreaWidth - boardSide) / 2
    const boardTop = contentTop + (contentHeight - boardSide) / 2
    const buttonHeight = clamp(height * 0.055, 34, 46)
    const listButtonGap = 8
    const editorInfoTop = contentTop + 44
    const mapListTop = contentTop + 152
    const listAvailableHeight = contentHeight - 238

    this.listPageSize = Math.max(4, Math.floor(listAvailableHeight / (buttonHeight + listButtonGap)))
    this.listPage = Math.min(this.listPage, Math.max(0, this.getPageCount() - 1))

    this.background?.setSize(width, height)
    this.headerPanel?.setSize(width, headerHeight)
    this.leftPanel?.setPosition(padding, contentTop).setSize(panelWidth, contentHeight)
    this.rightPanel?.setPosition(width - padding - panelWidth, contentTop).setSize(panelWidth, contentHeight)
    this.boardFrame?.setPosition(boardLeft - padding * 0.45, boardTop - padding * 0.45).setSize(boardSide + padding * 0.9, boardSide + padding * 0.9)
    this.boardFill?.setPosition(boardLeft, boardTop).setSize(boardSide, boardSide)

    this.titleText
      ?.setPosition(width / 2, 12)
      .setOrigin(0.5, 0)
      .setFontSize(clamp(width * 0.028, 24, 34))

    this.statusText
      ?.setPosition(width / 2, headerHeight - 28)
      .setOrigin(0.5, 0.5)
      .setFontSize(clamp(width * 0.013, 12, 16))
      .setWordWrapWidth(width * 0.74)

    this.leftTitleText
      ?.setPosition(padding + 14, contentTop + 12)
      .setFontSize(clamp(width * 0.018, 16, 22))

    this.rightTitleText
      ?.setPosition(width - padding - panelWidth + 14, contentTop + 12)
      .setFontSize(clamp(width * 0.018, 16, 22))

    this.editorTitleText
      ?.setPosition(padding + 14, editorInfoTop)
      .setOrigin(0, 0)
      .setFontSize(clamp(width * 0.014, 13, 18))
      .setWordWrapWidth(panelWidth - 28)

    this.countsText
      ?.setPosition(padding + 14, editorInfoTop + 28)
      .setOrigin(0, 0)
      .setFontSize(clamp(width * 0.0105, 10, 13))
      .setWordWrapWidth(panelWidth - 28)

    this.slotText
      ?.setPosition(width - padding - panelWidth / 2, contentTop + contentHeight - 112)
      .setFontSize(clamp(width * 0.013, 12, 16))

    this.toolHintText
      ?.setPosition(width - padding - panelWidth + 14, contentTop + 44)
      .setFontSize(clamp(width * 0.011, 11, 14))
      .setWordWrapWidth(panelWidth - 28)

    this.paginationText
      ?.setPosition(padding + panelWidth / 2, contentTop + contentHeight - 76)
      .setFontSize(clamp(width * 0.011, 11, 14))
      .setVisible(this.getPageCount() > 1)

    this.setButtonLayout(this.backButton, padding, 18, 88, 38, clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.newButton, padding + 14, contentTop + 100, panelWidth - 28, buttonHeight, clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.previousPageButton, padding + 14, contentTop + contentHeight - 54, (panelWidth - 36) / 2, 38, clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.nextPageButton, padding + 22 + (panelWidth - 36) / 2, contentTop + contentHeight - 54, (panelWidth - 36) / 2, 38, clamp(width * 0.0115, 11, 14))

    this.rebuildMapButtons()
    let mapButtonY = mapListTop
    for (const button of this.mapButtons) {
      this.setButtonLayout(button, padding + 14, mapButtonY, panelWidth - 28, buttonHeight, clamp(width * 0.011, 11, 14))
      mapButtonY += buttonHeight + listButtonGap
    }

    const toolButtonWidth = panelWidth - 28
    const toolButtonX = width - padding - panelWidth + 14
    let toolButtonY = contentTop + 124
    for (const tool of TOOL_ORDER) {
      this.setButtonLayout(this.toolButtons.get(tool), toolButtonX, toolButtonY, toolButtonWidth, buttonHeight, clamp(width * 0.0115, 11, 14))
      toolButtonY += buttonHeight + 8
    }

    const slotButtonY = contentTop + contentHeight - 144
    const slotButtonWidth = Math.max(34, (panelWidth - 92) / 2)
    this.setButtonLayout(this.slotMinusButton, toolButtonX, slotButtonY, slotButtonWidth, 38, 18)
    this.setButtonLayout(this.slotPlusButton, width - padding - 14 - slotButtonWidth, slotButtonY, slotButtonWidth, 38, 18)
    this.setButtonLayout(this.saveButton, toolButtonX, contentTop + contentHeight - 96, toolButtonWidth, 40, clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.deleteButton, toolButtonX, contentTop + contentHeight - 48, toolButtonWidth, 38, clamp(width * 0.0115, 11, 14))

    this.gridOrigin = {
      x: boardLeft,
      y: boardTop
    }
    this.cellSize = boardSide / PLAYABLE_GRID_SIZE

    for (let y = 0; y < PLAYABLE_GRID_SIZE; y += 1) {
      for (let x = 0; x < PLAYABLE_GRID_SIZE; x += 1) {
        this.gridCells[y]?.[x]
          ?.setPosition(this.gridOrigin.x + x * this.cellSize, this.gridOrigin.y + y * this.cellSize)
          .setSize(this.cellSize - 2, this.cellSize - 2)
      }
    }

    this.renderEditor()
  }

  private createGrid(): void {
    this.markerLayer = this.add.container(0, 0)
    this.markerLayer.setDepth(2)

    for (let y = 0; y < PLAYABLE_GRID_SIZE; y += 1) {
      const row: Phaser.GameObjects.Rectangle[] = []
      for (let x = 0; x < PLAYABLE_GRID_SIZE; x += 1) {
        const cell = this.add.rectangle(0, 0, 10, 10, 0x16243a, 1).setOrigin(0)
        cell.setStrokeStyle(1, 0x1e293b, 0.85)
        cell.setInteractive({ useHandCursor: true })
        cell.on('pointerdown', () => this.handleGridClick({ x, y }))
        row.push(cell)
      }
      this.gridCells.push(row)
    }
  }

  private handleGridClick(point: GridPoint): void {
    this.applySelectedTool(point)
    this.renderEditor()
  }

  private applySelectedTool(point: GridPoint): void {
    switch (this.selectedTool) {
      case 'player':
        if (this.editorState.playerSpawn && samePoint(this.editorState.playerSpawn, point)) {
          this.editorState.playerSpawn = undefined
          return
        }
        this.clearOccupants(point)
        this.editorState.playerSpawn = { ...point }
        return
      case 'exit':
        if (this.editorState.exit && samePoint(this.editorState.exit, point)) {
          this.editorState.exit = undefined
          return
        }
        this.clearOccupants(point)
        this.editorState.exit = { ...point }
        return
      case 'block':
        this.togglePointList(this.editorState.blocks, point)
        return
      case 'column':
        this.togglePointList(this.editorState.columns, point)
        return
      case 'enemy':
        this.togglePointList(this.editorState.enemies, point)
        return
      case 'erase':
        this.clearOccupants(point)
        return
      default:
        return
    }
  }

  private togglePointList(list: GridPoint[], point: GridPoint): void {
    const existingIndex = list.findIndex((candidate) => samePoint(candidate, point))
    if (existingIndex >= 0) {
      list.splice(existingIndex, 1)
      return
    }

    this.clearOccupants(point)
    list.push({ ...point })
  }

  private clearOccupants(point: GridPoint): void {
    if (this.editorState.playerSpawn && samePoint(this.editorState.playerSpawn, point)) {
      this.editorState.playerSpawn = undefined
    }

    if (this.editorState.exit && samePoint(this.editorState.exit, point)) {
      this.editorState.exit = undefined
    }

    for (const list of [this.editorState.blocks, this.editorState.columns, this.editorState.enemies]) {
      const index = list.findIndex((candidate) => samePoint(candidate, point))
      if (index >= 0) {
        list.splice(index, 1)
      }
    }
  }

  private refreshMapSummaries(): void {
    this.mapSummaries = listLevelSummaries(this.storage)
    this.listPage = Math.min(this.listPage, Math.max(0, this.getPageCount() - 1))
  }

  private resetToNewMap(status: string): void {
    const slot = getFirstAvailableCustomSlot(this.storage)
    this.editorMode = 'new'
    this.editorState = createEmptyEditableLevel(slot)
    this.selectedTool = 'player'
    this.setStatus(status)
    this.layoutScene(this.scale.width, this.scale.height)
  }

  private loadMap(slot: number, status = `${formatLevelLabel(slot)} loaded.`): void {
    const level = getLevel(slot, this.storage)
    if (!level) {
      this.setStatus(`${formatLevelLabel(slot)} does not exist.`, true)
      return
    }

    this.editorMode = 'existing'
    this.editorState = editableLevelFromLevel(slot, level)
    this.selectedTool = 'player'
    this.setStatus(status)
    this.layoutScene(this.scale.width, this.scale.height)
  }

  private changePage(delta: number): void {
    this.listPage = Phaser.Math.Clamp(this.listPage + delta, 0, Math.max(0, this.getPageCount() - 1))
    this.layoutScene(this.scale.width, this.scale.height)
  }

  private adjustNewSlot(delta: number): void {
    if (this.editorMode !== 'new') {
      return
    }

    this.editorState.slot = Phaser.Math.Clamp(this.editorState.slot + delta, 2, MAP_MAX_SLOT)
    this.editorState.name = formatLevelName(this.editorState.slot)
    this.renderEditor()
  }

  private saveCurrentMap(): void {
    const errors = validateEditableLevel(this.editorState)
    if (errors.length > 0) {
      this.setStatus(errors[0] as string, true)
      return
    }

    const slot = this.editorMode === 'new'
      ? Phaser.Math.Clamp(sanitizeSlot(this.editorState.slot), 2, MAP_MAX_SLOT)
      : this.editorState.slot

    this.editorState.slot = slot
    this.editorState.name = slot === 1 ? this.editorState.name : formatLevelName(slot)
    saveEditableLevel(this.editorState, this.storage)
    this.refreshMapSummaries()
    this.loadMap(slot, `${formatLevelLabel(slot)} saved.`)
  }

  private deleteCurrentMap(): void {
    if (this.editorState.slot === 1) {
      this.setStatus('Map 01 can be modified, but never deleted.', true)
      return
    }

    if (!deleteLevel(this.editorState.slot, this.storage)) {
      this.setStatus('Only saved maps can be deleted.', true)
      return
    }

    this.refreshMapSummaries()
    this.resetToNewMap(`${formatLevelLabel(this.editorState.slot)} deleted. New blank map ready.`)
  }

  private renderEditor(): void {
    const title = this.editorMode === 'new'
      ? `NEW MAP - SAVE AS ${formatLevelLabel(this.editorState.slot)}`
      : `EDITING ${formatLevelLabel(this.editorState.slot)}`

    this.editorTitleText?.setText(title)
    this.countsText?.setText(
      `Player ${this.editorState.playerSpawn ? '1' : '0'} | Blocks ${this.editorState.blocks.length} | Columns ${this.editorState.columns.length} | NPCs ${this.editorState.enemies.length} | Exit ${this.editorState.exit ? '1' : '0'}`
    )
    this.slotText?.setText(
      this.editorMode === 'new'
        ? `Save Slot: ${String(this.editorState.slot).padStart(2, '0')}`
        : `Fixed Slot: ${String(this.editorState.slot).padStart(2, '0')}`
    )
    this.toolHintText?.setText(
      [
        `Selected: ${TOOL_LABELS[this.selectedTool]}`,
        'Click a tile to place.',
        this.selectedTool === 'erase' ? 'Click a tile to erase its current item.' : 'Click the same tile again to remove.',
        'Player and Exit are limited to one each.'
      ].join('\n')
    )

    for (let y = 0; y < PLAYABLE_GRID_SIZE; y += 1) {
      for (let x = 0; x < PLAYABLE_GRID_SIZE; x += 1) {
        const point = { x, y }
        const occupant = this.getOccupantType(point)
        const fill = occupant === 'column'
          ? 0x334155
          : (x + y) % 2 === 0
            ? 0x16243a
            : 0x122036
        const isHighlighted = occupant === this.selectedTool || (this.selectedTool === 'erase' && occupant !== undefined)
        this.gridCells[y]?.[x]
          ?.setFillStyle(fill, 1)
          .setStrokeStyle(
            isHighlighted ? 2 : 1,
            isHighlighted ? 0xfacc15 : 0x1e293b,
            isHighlighted ? 0.95 : 0.85
          )
      }
    }

    this.markerLayer?.removeAll(true)
    this.renderMarker(this.editorState.playerSpawn, 0x38bdf8, 'P', 'player')
    this.renderMarkers(this.editorState.blocks, 0xa5f3fc, 'B', 'block')
    this.renderMarkers(this.editorState.columns, 0x64748b, 'C', 'column')
    this.renderMarkers(this.editorState.enemies, 0xfb7185, 'N', 'enemy')
    this.renderMarker(this.editorState.exit, 0xfacc15, 'S', 'exit')
    this.updateButtonStates()
  }

  private renderMarkers(points: GridPoint[], color: number, label: string, type: EditorTool): void {
    for (const point of points) {
      this.renderMarker(point, color, label, type)
    }
  }

  private renderMarker(point: GridPoint | undefined, color: number, label: string, type: EditorTool): void {
    if (!point || !this.markerLayer) {
      return
    }

    const centerX = this.gridOrigin.x + point.x * this.cellSize + this.cellSize / 2
    const centerY = this.gridOrigin.y + point.y * this.cellSize + this.cellSize / 2
    const marker = this.add.container(centerX, centerY)
    let shape: Phaser.GameObjects.Shape | Phaser.GameObjects.Image

    if (type === 'player') {
      shape = this.add.image(0, 0, 'player')
      shape.setDisplaySize(this.cellSize * 0.72, this.cellSize * 0.72)
    } else if (type === 'block') {
      shape = this.add.image(0, 0, 'block')
      shape.setDisplaySize(this.cellSize * 0.78, this.cellSize * 0.78)
    } else if (type === 'enemy') {
      shape = this.add.image(0, 0, 'enemy')
      shape.setDisplaySize(this.cellSize * 0.72, this.cellSize * 0.72)
    } else if (type === 'exit') {
      shape = this.add.rectangle(0, 0, this.cellSize * 0.56, this.cellSize * 0.56, color, 0.35)
      shape.setAngle(45)
      shape.setStrokeStyle(3, color, 0.95)
    } else {
      shape = this.add.rectangle(0, 0, this.cellSize * 0.62, this.cellSize * 0.62, color, 0.95)
      shape.setStrokeStyle(2, 0xe2e8f0, 0.35)
    }

    const text = this.add.text(0, 0, label, {
      fontFamily: 'Arial',
      fontSize: `${Math.max(10, this.cellSize * 0.3)}px`,
      color: type === 'block' ? '#0f172a' : '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    marker.add([shape, text])
    this.markerLayer.add(marker)
  }

  private getOccupantType(point: GridPoint): EditorTool | undefined {
    if (this.editorState.playerSpawn && samePoint(this.editorState.playerSpawn, point)) {
      return 'player'
    }
    if (this.editorState.exit && samePoint(this.editorState.exit, point)) {
      return 'exit'
    }
    if (this.editorState.blocks.some((candidate) => samePoint(candidate, point))) {
      return 'block'
    }
    if (this.editorState.columns.some((candidate) => samePoint(candidate, point))) {
      return 'column'
    }
    if (this.editorState.enemies.some((candidate) => samePoint(candidate, point))) {
      return 'enemy'
    }
    return undefined
  }

  private rebuildMapButtons(): void {
    for (const button of this.mapButtons) {
      this.destroyButton(button)
    }
    this.mapButtons = []

    const start = this.listPage * this.listPageSize
    const visibleSummaries = this.mapSummaries.slice(start, start + this.listPageSize)
    for (const summary of visibleSummaries) {
      const button = this.createButton(
        formatLevelLabel(summary.slot),
        () => this.loadMap(summary.slot)
      )
      this.mapButtons.push(button)
    }

    this.paginationText?.setText(`Page ${this.listPage + 1} / ${Math.max(1, this.getPageCount())}`)
  }

  private updateButtonStates(): void {
    this.setButtonState(this.newButton, { active: this.editorMode === 'new' })
    this.setButtonState(this.previousPageButton, { disabled: this.listPage <= 0 })
    this.setButtonState(this.nextPageButton, { disabled: this.listPage >= this.getPageCount() - 1 })
    this.setButtonState(this.slotMinusButton, { disabled: this.editorMode !== 'new' || this.editorState.slot <= 2 })
    this.setButtonState(this.slotPlusButton, { disabled: this.editorMode !== 'new' || this.editorState.slot >= MAP_MAX_SLOT })
    this.setButtonState(this.deleteButton, { disabled: this.editorState.slot === 1 || this.editorMode !== 'existing' })

    for (const tool of TOOL_ORDER) {
      this.setButtonState(this.toolButtons.get(tool), { active: this.selectedTool === tool })
    }

    const start = this.listPage * this.listPageSize
    const visibleSummaries = this.mapSummaries.slice(start, start + this.listPageSize)
    visibleSummaries.forEach((summary, index) => {
      this.setButtonState(this.mapButtons[index], {
        active: this.editorMode === 'existing' && summary.slot === this.editorState.slot
      })
      this.mapButtons[index]?.label.setText(formatLevelLabel(summary.slot))
    })
  }

  private createButton(label: string, onClick: () => void): EditorButton {
    const button: EditorButton = {
      background: this.add.rectangle(0, 0, 10, 10, 0x1e293b, 1).setOrigin(0),
      label: this.add.text(0, 0, label, {
        fontFamily: 'Arial',
        color: '#e2e8f0',
        align: 'center'
      }).setOrigin(0.5),
      onClick,
      active: false,
      disabled: false,
      hovered: false
    }

    button.background.setStrokeStyle(2, 0x38bdf8, 0.24)
    button.background.setInteractive({ useHandCursor: true })
    button.background.on('pointerdown', () => {
      if (!button.disabled) {
        button.onClick()
      }
    })
    button.background.on('pointerover', () => {
      button.hovered = true
      this.applyButtonStyle(button)
    })
    button.background.on('pointerout', () => {
      button.hovered = false
      this.applyButtonStyle(button)
    })

    return button
  }

  private setButtonLayout(button: EditorButton | undefined, x: number, y: number, width: number, height: number, fontSize: number): void {
    if (!button) {
      return
    }

    button.background.setPosition(x, y).setSize(width, height)
    button.label.setPosition(x + width / 2, y + height / 2).setFontSize(fontSize).setWordWrapWidth(width - 14)
    this.applyButtonStyle(button)
  }

  private setButtonState(button: EditorButton | undefined, state: Partial<Pick<EditorButton, 'active' | 'disabled'>>): void {
    if (!button) {
      return
    }

    if (typeof state.active === 'boolean') {
      button.active = state.active
    }
    if (typeof state.disabled === 'boolean') {
      button.disabled = state.disabled
    }

    this.applyButtonStyle(button)
  }

  private applyButtonStyle(button: EditorButton): void {
    if (button.disabled) {
      button.background.setFillStyle(0x1f2937, 0.55).setStrokeStyle(2, 0x475569, 0.2)
      button.label.setColor('#64748b')
      return
    }

    if (button.active) {
      button.background.setFillStyle(0x0ea5e9, 0.82).setStrokeStyle(2, 0xf8fafc, 0.35)
      button.label.setColor('#f8fafc')
      return
    }

    if (button.hovered) {
      button.background.setFillStyle(0x2563eb, 0.72).setStrokeStyle(2, 0x93c5fd, 0.35)
      button.label.setColor('#f8fafc')
      return
    }

    button.background.setFillStyle(0x1e293b, 1).setStrokeStyle(2, 0x38bdf8, 0.24)
    button.label.setColor('#e2e8f0')
  }

  private destroyButton(button: EditorButton): void {
    button.background.destroy()
    button.label.destroy()
  }

  private setStatus(message: string, isError = false): void {
    this.statusText?.setColor(isError ? '#fda4af' : '#cbd5e1')
    this.statusText?.setText(message)
  }

  private getPageCount(): number {
    return Math.max(1, Math.ceil(this.mapSummaries.length / this.listPageSize))
  }
}
