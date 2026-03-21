import Phaser from 'phaser'
import {
  MAP_MAX_SLOT,
  MAX_MAP_FILE_BYTES,
  buildMapSlotFileFromEditableLevel,
  clearMapSlot,
  createEmptyEditableLevel,
  createEmptyMapSlotFile,
  editableLevelFromMapSlotFile,
  formatLevelLabel,
  formatLevelName,
  getFirstAvailableCustomSlot,
  getMapSlotFile,
  getMapPublishingMode,
  listLevelSummaries,
  parseMapSlotFileText,
  publishEditableLevel,
  publishMapSlotFile,
  requiresGitHubTokenForMapPublishing,
  sanitizeSlot,
  serializeMapSlotFile,
  validateEditableLevel
} from '../data/levelRepository'
import type { EditableLevelData, EditorTool, LevelSummary } from '../types/editor'
import type { MapSlotFile } from '../types/mapFile'
import type { GridPoint } from '../types/level'
import { samePoint } from '../utils/grid'
import { PLAYABLE_AREA_HEIGHT, PLAYABLE_AREA_LABEL, PLAYABLE_AREA_WIDTH } from '../utils/boardGeometry'
import { clamp } from '../utils/layout'

interface EditorButton {
  background: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  onClick: () => void
  active: boolean
  disabled: boolean
  hovered: boolean
}

const TOOL_ORDER: EditorTool[] = ['player', 'block', 'column', 'enemy', 'erase']

const TOOL_LABELS: Record<EditorTool, string> = {
  player: 'Player',
  block: 'Blocks',
  column: 'Columns',
  enemy: 'NPCs',
  erase: 'Eraser'
}

const GITHUB_TOKEN_SESSION_KEY = 'stoneage:github-token:session'

/**
 * Browser-side map editor scene for the canonical 10x10 playable layout.
 *
 * The editor now treats `public/maps/mapNN.json` as the canonical published
 * source of truth. Uploads, saves, deletes, and downloads all operate on that
 * slot-file format. On `localhost`, writes go straight into the project files;
 * on GitHub Pages, writes use the GitHub API. The gameplay runtime still
 * consumes converted `LevelData`.
 */
export class MapEditorScene extends Phaser.Scene {
  private readonly sectionDividerColor = 0x38bdf8
  private background?: Phaser.GameObjects.Rectangle
  private headerPanel?: Phaser.GameObjects.Rectangle
  private leftPanel?: Phaser.GameObjects.Rectangle
  private rightPanel?: Phaser.GameObjects.Rectangle
  private boardFrame?: Phaser.GameObjects.Rectangle
  private boardFill?: Phaser.GameObjects.Rectangle
  private leftTitleDivider?: Phaser.GameObjects.Rectangle
  private leftCountsDivider?: Phaser.GameObjects.Rectangle
  private leftMapsDivider?: Phaser.GameObjects.Rectangle
  private rightHintDivider?: Phaser.GameObjects.Rectangle
  private rightActionDivider?: Phaser.GameObjects.Rectangle
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
  private busy = false
  private gridCells: Phaser.GameObjects.Rectangle[][] = []
  private markerLayer?: Phaser.GameObjects.Container
  private backButton?: EditorButton
  private newButton?: EditorButton
  private previousPageButton?: EditorButton
  private nextPageButton?: EditorButton
  private saveButton?: EditorButton
  private deleteButton?: EditorButton
  private downloadButton?: EditorButton
  private uploadButton?: EditorButton
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
    this.leftTitleDivider = this.createDivider()
    this.leftCountsDivider = this.createDivider()
    this.leftMapsDivider = this.createDivider()
    this.rightHintDivider = this.createDivider()
    this.rightActionDivider = this.createDivider()

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
    }).setOrigin(0.5, 0).setDepth(5)

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
    this.newButton = this.createButton('New Map', () => { void this.resetToNewMap(`New blank ${PLAYABLE_AREA_LABEL} map ready.`) })
    this.previousPageButton = this.createButton('Prev', () => this.changePage(-1))
    this.nextPageButton = this.createButton('Next', () => this.changePage(1))
    this.saveButton = this.createButton('Save Map', () => { void this.saveCurrentMap() })
    this.deleteButton = this.createButton('Delete Map', () => { void this.deleteCurrentMap() })
    this.downloadButton = this.createButton('Download', () => this.downloadCurrentMap())
    this.uploadButton = this.createButton('Upload', () => { void this.uploadMapFile() })
    this.slotMinusButton = this.createButton('-', () => this.adjustNewSlot(-1))
    this.slotPlusButton = this.createButton('+', () => this.adjustNewSlot(1))

    for (const tool of TOOL_ORDER) {
      this.toolButtons.set(tool, this.createButton(TOOL_LABELS[tool], () => {
        if (this.busy) {
          return
        }

        this.selectedTool = tool
        this.updateButtonStates()
      }))
    }

    this.createGrid()
    this.layoutScene(this.scale.width, this.scale.height)
    this.setStatus('Loading published maps...')

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    })

    void this.initializePublishedMaps()
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.layoutScene(gameSize.width, gameSize.height)
  }

  private layoutScene(width: number, height: number): void {
    if (width < 700) {
      this.layoutStackedScene(width, height)
      return
    }

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
    const smallButtonHeight = clamp(height * 0.048, 32, 40)
    const listButtonGap = 8
    const dividerInset = 14
    const dividerWidth = panelWidth - dividerInset * 2
    const dividerHeight = 2
    const leftSectionTop = contentTop + 44
    const leftTitleSectionHeight = clamp(height * 0.095, 44, 58)
    const leftCountsSectionHeight = clamp(height * 0.13, 58, 86)
    const leftTitleDividerY = leftSectionTop + leftTitleSectionHeight
    const leftCountsTop = leftTitleDividerY + 14
    const leftCountsDividerY = leftCountsTop + leftCountsSectionHeight
    const leftButtonTop = leftCountsDividerY + 14
    const leftMapsDividerY = leftButtonTop + buttonHeight + 16
    const pageButtonY = contentTop + contentHeight - 54
    const paginationY = pageButtonY - 22
    const mapListTitleY = leftMapsDividerY + 14
    const mapListTop = mapListTitleY + 28
    const listAvailableHeight = Math.max(72, paginationY - 16 - mapListTop)
    const rightSectionTop = contentTop + 44
    const hintSectionHeight = clamp(height * 0.12, 74, 96)
    const rightHintDividerY = rightSectionTop + hintSectionHeight
    const actionSectionHeight = 250
    const actionSectionTop = contentTop + contentHeight - actionSectionHeight
    const toolAreaTop = rightHintDividerY + 18
    const toolAreaBottom = actionSectionTop - 24
    const toolGap = 8
    const toolButtonHeight = clamp(
      (toolAreaBottom - toolAreaTop - toolGap * (TOOL_ORDER.length - 1)) / TOOL_ORDER.length,
      30,
      buttonHeight
    )

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
      ?.setPosition(padding + 14, mapListTitleY)
      .setFontSize(clamp(width * 0.016, 15, 20))

    this.rightTitleText
      ?.setPosition(width - padding - panelWidth + 14, contentTop + 12)
      .setFontSize(clamp(width * 0.018, 16, 22))

    this.editorTitleText
      ?.setPosition(padding + 14, leftSectionTop)
      .setOrigin(0, 0)
      .setFontSize(clamp(width * 0.014, 13, 18))
      .setWordWrapWidth(panelWidth - 28)

    this.countsText
      ?.setPosition(padding + 14, leftCountsTop)
      .setOrigin(0, 0)
      .setFontSize(clamp(width * 0.0105, 10, 13))
      .setWordWrapWidth(panelWidth - 28)

    this.slotText
      ?.setPosition(width - padding - panelWidth / 2, actionSectionTop + 18)
      .setFontSize(clamp(width * 0.013, 12, 16))

    this.toolHintText
      ?.setPosition(width - padding - panelWidth + 14, rightSectionTop)
      .setFontSize(clamp(width * 0.011, 11, 14))
      .setWordWrapWidth(panelWidth - 28)

    this.paginationText
      ?.setPosition(padding + panelWidth / 2, paginationY)
      .setFontSize(clamp(width * 0.011, 11, 14))
      .setVisible(this.getPageCount() > 1)

    this.leftTitleDivider
      ?.setPosition(padding + dividerInset, leftTitleDividerY)
      .setSize(dividerWidth, dividerHeight)

    this.leftCountsDivider
      ?.setPosition(padding + dividerInset, leftCountsDividerY)
      .setSize(dividerWidth, dividerHeight)

    this.leftMapsDivider
      ?.setPosition(padding + dividerInset, leftMapsDividerY)
      .setSize(dividerWidth, dividerHeight)

    this.rightHintDivider
      ?.setPosition(width - padding - panelWidth + dividerInset, rightHintDividerY)
      .setSize(dividerWidth, dividerHeight)

    this.rightActionDivider
      ?.setPosition(width - padding - panelWidth + dividerInset, actionSectionTop)
      .setSize(dividerWidth, dividerHeight)

    this.setButtonLayout(this.backButton, padding, 18, 88, 38, clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.newButton, padding + 14, leftButtonTop, panelWidth - 28, buttonHeight, clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.previousPageButton, padding + 14, pageButtonY, (panelWidth - 36) / 2, 38, clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.nextPageButton, padding + 22 + (panelWidth - 36) / 2, pageButtonY, (panelWidth - 36) / 2, 38, clamp(width * 0.0115, 11, 14))

    this.rebuildMapButtons()
    let mapButtonY = mapListTop
    for (const button of this.mapButtons) {
      this.setButtonLayout(button, padding + 14, mapButtonY, panelWidth - 28, buttonHeight, clamp(width * 0.011, 11, 14))
      mapButtonY += buttonHeight + listButtonGap
    }

    const toolButtonWidth = panelWidth - 28
    const toolButtonX = width - padding - panelWidth + 14
    let toolButtonY = toolAreaTop
    for (const tool of TOOL_ORDER) {
      this.setButtonLayout(this.toolButtons.get(tool), toolButtonX, toolButtonY, toolButtonWidth, toolButtonHeight, clamp(width * 0.0115, 11, 14))
      toolButtonY += toolButtonHeight + toolGap
    }

    const slotButtonY = actionSectionTop + 52
    const slotButtonWidth = Math.max(34, (panelWidth - 92) / 2)
    const saveY = slotButtonY + smallButtonHeight + 12
    const deleteY = saveY + 48
    const downloadY = deleteY + 46
    const uploadY = downloadY + 46

    this.setButtonLayout(this.slotMinusButton, toolButtonX, slotButtonY, slotButtonWidth, smallButtonHeight, 18)
    this.setButtonLayout(this.slotPlusButton, width - padding - 14 - slotButtonWidth, slotButtonY, slotButtonWidth, smallButtonHeight, 18)
    this.setButtonLayout(this.saveButton, toolButtonX, saveY, toolButtonWidth, 40, clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.deleteButton, toolButtonX, deleteY, toolButtonWidth, 38, clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.downloadButton, toolButtonX, downloadY, toolButtonWidth, 38, clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.uploadButton, toolButtonX, uploadY, toolButtonWidth, 38, clamp(width * 0.0115, 11, 14))

    this.gridOrigin = {
      x: boardLeft,
      y: boardTop
    }
    this.cellSize = Math.min(boardSide / PLAYABLE_AREA_WIDTH, boardSide / PLAYABLE_AREA_HEIGHT)

    for (let y = 0; y < PLAYABLE_AREA_HEIGHT; y += 1) {
      for (let x = 0; x < PLAYABLE_AREA_WIDTH; x += 1) {
        this.gridCells[y]?.[x]
          ?.setPosition(this.gridOrigin.x + x * this.cellSize, this.gridOrigin.y + y * this.cellSize)
          .setSize(this.cellSize - 2, this.cellSize - 2)
      }
    }

    this.renderEditor()
  }

  private layoutStackedScene(width: number, height: number): void {
    const headerHeight = clamp(height * 0.145, 90, 120)
    const padding = clamp(Math.min(width, height) * 0.02, 10, 16)
    const buttonHeight = 36
    const smallButtonHeight = 30
    const listButtonGap = 8
    const dividerInset = 12
    const dividerHeight = 2
    const boardSide = clamp(Math.min(width - padding * 2, height * 0.28), 220, 260)
    const boardLeft = (width - boardSide) / 2
    const boardTop = headerHeight + padding
    const panelsTop = boardTop + boardSide + padding
    const panelWidth = Math.max(164, (width - padding * 3) / 2)
    const panelHeight = Math.max(280, height - panelsTop - padding)
    const leftPanelX = padding
    const rightPanelX = padding * 2 + panelWidth
    const panelInnerWidth = panelWidth - 28
    const dividerWidth = panelWidth - dividerInset * 2
    const leftSectionTop = panelsTop + 16
    const leftTitleDividerY = panelsTop + 102
    const leftCountsTop = leftTitleDividerY + 12
    const leftCountsDividerY = leftCountsTop + 82
    const leftButtonTop = leftCountsDividerY + 12
    const leftMapsDividerY = leftButtonTop + buttonHeight + 12
    const pageButtonY = panelsTop + panelHeight - 46
    const paginationY = pageButtonY - 18
    const mapListTitleY = leftMapsDividerY + 12
    const mapListTop = mapListTitleY + 24
    const listAvailableHeight = Math.max(72, paginationY - 12 - mapListTop)
    const rightSectionTop = panelsTop + 18
    const rightHintDividerY = rightSectionTop + 102
    const toolGridTop = rightHintDividerY + 12
    const toolGap = 6
    const toolButtonWidth = (panelInnerWidth - toolGap) / 2
    const toolButtonHeight = 30
    const toolRows = 3
    const toolGridHeight = toolRows * toolButtonHeight + (toolRows - 1) * toolGap
    const actionSectionTop = toolGridTop + toolGridHeight + 16
    const actionDividerY = actionSectionTop
    const slotTextY = actionDividerY + 10
    const slotButtonY = slotTextY + 30
    const actionButtonWidth = toolButtonWidth
    const actionButtonHeight = 32
    const saveRowY = slotButtonY + smallButtonHeight + 10
    const secondRowY = saveRowY + actionButtonHeight + 8
    const backButtonWidth = 72

    this.listPageSize = Math.max(2, Math.floor(listAvailableHeight / (buttonHeight + listButtonGap)))
    this.listPage = Math.min(this.listPage, Math.max(0, this.getPageCount() - 1))

    this.background?.setSize(width, height)
    this.headerPanel?.setSize(width, headerHeight)
    this.leftPanel?.setPosition(leftPanelX, panelsTop).setSize(panelWidth, panelHeight)
    this.rightPanel?.setPosition(rightPanelX, panelsTop).setSize(panelWidth, panelHeight)
    this.boardFrame?.setPosition(boardLeft - padding * 0.35, boardTop - padding * 0.35).setSize(boardSide + padding * 0.7, boardSide + padding * 0.7)
    this.boardFill?.setPosition(boardLeft, boardTop).setSize(boardSide, boardSide)

    this.titleText
      ?.setPosition(width / 2 + 24, 14)
      .setOrigin(0.5, 0)
      .setFontSize(clamp(width * 0.055, 22, 30))

    this.statusText
      ?.setPosition(width / 2, headerHeight - 30)
      .setOrigin(0.5, 0.5)
      .setFontSize(12)
      .setWordWrapWidth(width - padding * 2)

    this.leftTitleText
      ?.setPosition(leftPanelX + 14, mapListTitleY)
      .setFontSize(12)

    this.rightTitleText
      ?.setPosition(rightPanelX + 14, panelsTop + 14)
      .setFontSize(12)

    this.editorTitleText
      ?.setPosition(leftPanelX + 14, leftSectionTop)
      .setOrigin(0, 0)
      .setFontSize(10)
      .setWordWrapWidth(panelInnerWidth)

    this.countsText
      ?.setPosition(leftPanelX + 14, leftCountsTop)
      .setOrigin(0, 0)
      .setFontSize(11)
      .setWordWrapWidth(panelInnerWidth)

    this.slotText
      ?.setPosition(rightPanelX + panelWidth / 2, slotTextY)
      .setFontSize(10)

    this.toolHintText
      ?.setPosition(rightPanelX + 14, rightSectionTop)
      .setFontSize(10)
      .setWordWrapWidth(panelInnerWidth)

    this.paginationText
      ?.setPosition(leftPanelX + panelWidth / 2, paginationY)
      .setFontSize(10)
      .setVisible(this.getPageCount() > 1)

    this.leftTitleDivider
      ?.setPosition(leftPanelX + dividerInset, leftTitleDividerY)
      .setSize(dividerWidth, dividerHeight)

    this.leftCountsDivider
      ?.setPosition(leftPanelX + dividerInset, leftCountsDividerY)
      .setSize(dividerWidth, dividerHeight)

    this.leftMapsDivider
      ?.setPosition(leftPanelX + dividerInset, leftMapsDividerY)
      .setSize(dividerWidth, dividerHeight)

    this.rightHintDivider
      ?.setPosition(rightPanelX + dividerInset, rightHintDividerY)
      .setSize(dividerWidth, dividerHeight)

    this.rightActionDivider
      ?.setPosition(rightPanelX + dividerInset, actionDividerY)
      .setSize(dividerWidth, dividerHeight)

    this.setButtonLayout(this.backButton, padding, 18, backButtonWidth, 34, 11)
    this.setButtonLayout(this.newButton, leftPanelX + 14, leftButtonTop, panelInnerWidth, buttonHeight, 11)
    this.setButtonLayout(this.previousPageButton, leftPanelX + 14, pageButtonY, (panelInnerWidth - 8) / 2, 32, 10)
    this.setButtonLayout(this.nextPageButton, leftPanelX + 14 + (panelInnerWidth - 8) / 2 + 8, pageButtonY, (panelInnerWidth - 8) / 2, 32, 10)

    this.rebuildMapButtons()
    let mapButtonY = mapListTop
    for (const button of this.mapButtons) {
      this.setButtonLayout(button, leftPanelX + 14, mapButtonY, panelInnerWidth, buttonHeight, 10)
      mapButtonY += buttonHeight + listButtonGap
    }

    TOOL_ORDER.forEach((tool, index) => {
      const row = Math.floor(index / 2)
      const column = index % 2
      const buttonX = rightPanelX + 14 + column * (toolButtonWidth + toolGap)
      const buttonY = toolGridTop + row * (toolButtonHeight + toolGap)
      this.setButtonLayout(this.toolButtons.get(tool), buttonX, buttonY, toolButtonWidth, toolButtonHeight, 10)
    })

    this.setButtonLayout(this.slotMinusButton, rightPanelX + 14, slotButtonY, actionButtonWidth, smallButtonHeight, 16)
    this.setButtonLayout(this.slotPlusButton, rightPanelX + 14 + actionButtonWidth + toolGap, slotButtonY, actionButtonWidth, smallButtonHeight, 16)
    this.setButtonLayout(this.saveButton, rightPanelX + 14, saveRowY, actionButtonWidth, actionButtonHeight, 10)
    this.setButtonLayout(this.deleteButton, rightPanelX + 14 + actionButtonWidth + toolGap, saveRowY, actionButtonWidth, actionButtonHeight, 10)
    this.setButtonLayout(this.downloadButton, rightPanelX + 14, secondRowY, actionButtonWidth, actionButtonHeight, 10)
    this.setButtonLayout(this.uploadButton, rightPanelX + 14 + actionButtonWidth + toolGap, secondRowY, actionButtonWidth, actionButtonHeight, 10)

    this.gridOrigin = {
      x: boardLeft,
      y: boardTop
    }
    this.cellSize = Math.min(boardSide / PLAYABLE_AREA_WIDTH, boardSide / PLAYABLE_AREA_HEIGHT)

    for (let y = 0; y < PLAYABLE_AREA_HEIGHT; y += 1) {
      for (let x = 0; x < PLAYABLE_AREA_WIDTH; x += 1) {
        this.gridCells[y]?.[x]
          ?.setPosition(this.gridOrigin.x + x * this.cellSize, this.gridOrigin.y + y * this.cellSize)
          .setSize(this.cellSize - 1.5, this.cellSize - 1.5)
      }
    }

    this.renderEditor()
  }

  private createGrid(): void {
    this.markerLayer = this.add.container(0, 0)
    this.markerLayer.setDepth(2)

    for (let y = 0; y < PLAYABLE_AREA_HEIGHT; y += 1) {
      const row: Phaser.GameObjects.Rectangle[] = []
      for (let x = 0; x < PLAYABLE_AREA_WIDTH; x += 1) {
        const cell = this.add.rectangle(0, 0, 10, 10, 0x16243a, 1).setOrigin(0)
        cell.setStrokeStyle(1, 0x1e293b, 0.85)
        cell.setInteractive({ useHandCursor: true })
        cell.on('pointerdown', () => {
          if (!this.busy) {
            this.handleGridClick({ x, y })
          }
        })
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

    for (const list of [this.editorState.blocks, this.editorState.columns, this.editorState.enemies]) {
      const index = list.findIndex((candidate) => samePoint(candidate, point))
      if (index >= 0) {
        list.splice(index, 1)
      }
    }
  }

  private createDivider(): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(0, 0, 10, 2, this.sectionDividerColor, 0.28).setOrigin(0)
  }

  private async initializePublishedMaps(): Promise<void> {
    this.setBusy(true, 'Loading published maps...')
    try {
      await this.refreshMapSummaries()
      await this.resetToNewMap(this.getCatalogReadyMessage())
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Unable to load the map catalog.', true)
    } finally {
      this.setBusy(false)
    }
  }

  private async refreshMapSummaries(): Promise<void> {
    this.mapSummaries = await listLevelSummaries()
    this.listPage = Math.min(this.listPage, Math.max(0, this.getPageCount() - 1))
  }

  private async resetToNewMap(status: string): Promise<void> {
    const slot = await getFirstAvailableCustomSlot()
    this.editorMode = 'new'
    this.editorState = createEmptyEditableLevel(slot)
    this.selectedTool = 'player'
    this.setStatus(status)
    this.layoutScene(this.scale.width, this.scale.height)
  }

  private async loadMap(slot: number, status = `${formatLevelLabel(slot)} loaded.`): Promise<void> {
    const file = await getMapSlotFile(slot)
    if (file.empty) {
      this.setStatus(`${formatLevelLabel(slot)} is currently empty.`, true)
      return
    }

    this.applyLoadedMapFile(file, status)
  }

  private applyLoadedMapFile(file: MapSlotFile, status: string): void {
    this.editorMode = file.empty ? 'new' : 'existing'
    this.editorState = editableLevelFromMapSlotFile(file)
    if (file.empty) {
      this.editorState.name = formatLevelName(file.slot)
    }
    this.selectedTool = 'player'
    this.setStatus(status)
    this.layoutScene(this.scale.width, this.scale.height)
  }

  private changePage(delta: number): void {
    this.listPage = Phaser.Math.Clamp(this.listPage + delta, 0, Math.max(0, this.getPageCount() - 1))
    this.layoutScene(this.scale.width, this.scale.height)
  }

  private adjustNewSlot(delta: number): void {
    if (this.editorMode !== 'new' || this.busy) {
      return
    }

    this.editorState.slot = Phaser.Math.Clamp(this.editorState.slot + delta, 2, MAP_MAX_SLOT)
    this.editorState.name = formatLevelName(this.editorState.slot)
    this.renderEditor()
  }

  private async saveCurrentMap(): Promise<void> {
    const errors = validateEditableLevel(this.editorState)
    if (errors.length > 0) {
      this.setStatus(errors[0] as string, true)
      return
    }

    const token = await this.getPublishTokenIfNeeded('Saving a map on the hosted site requires write access to the GitHub repository.')
    if (requiresGitHubTokenForMapPublishing() && !token) {
      return
    }

    const slot = this.editorMode === 'new'
      ? Phaser.Math.Clamp(sanitizeSlot(this.editorState.slot), 2, MAP_MAX_SLOT)
      : this.editorState.slot

    this.editorState.slot = slot
    this.editorState.name = slot === 1 ? this.editorState.name : formatLevelName(slot)

    this.setBusy(true, this.getSaveProgressMessage(slot))
    try {
      const publishedFile = await publishEditableLevel(this.editorState, { token })
      await this.refreshMapSummaries()
      this.applyLoadedMapFile(publishedFile, this.getSaveSuccessMessage(slot))
    } catch (error) {
      this.handleGitHubError(error, this.getSaveFailureMessage(slot))
    } finally {
      this.setBusy(false)
    }
  }

  private async deleteCurrentMap(): Promise<void> {
    if (this.editorState.slot === 1) {
      this.setStatus('Map 01 can be modified, but never cleared.', true)
      return
    }

    const token = await this.getPublishTokenIfNeeded('Clearing a map on the hosted site requires write access to the GitHub repository.')
    if (requiresGitHubTokenForMapPublishing() && !token) {
      return
    }

    const slot = this.editorState.slot
    this.setBusy(true, this.getDeleteProgressMessage(slot))
    try {
      await clearMapSlot(slot, { token })
      await this.refreshMapSummaries()
      await this.resetToNewMap(this.getDeleteSuccessMessage(slot))
    } catch (error) {
      this.handleGitHubError(error, this.getDeleteFailureMessage(slot))
    } finally {
      this.setBusy(false)
    }
  }

  private downloadCurrentMap(): void {
    try {
      const hasPlacedAnything = Boolean(this.editorState.playerSpawn)
        || this.editorState.blocks.length > 0
        || this.editorState.columns.length > 0
        || this.editorState.enemies.length > 0

      const mapFile = hasPlacedAnything
        ? buildMapSlotFileFromEditableLevel(this.editorState)
        : createEmptyMapSlotFile(this.editorState.slot)

      this.triggerJsonDownload(serializeMapSlotFile(mapFile), `map${String(mapFile.slot).padStart(2, '0')}.json`)
      this.setStatus(`${formatLevelLabel(mapFile.slot)} downloaded.`)
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Unable to download the current map.', true)
    }
  }

  private async uploadMapFile(): Promise<void> {
    const file = await this.pickJsonFile()
    if (!file) {
      return
    }

    if (file.size > MAX_MAP_FILE_BYTES) {
      this.setStatus(`Map files must stay under ${MAX_MAP_FILE_BYTES / 1024} KB.`, true)
      return
    }

    const parsed = parseMapSlotFileText(await file.text())
    if (!parsed.value) {
      this.setStatus(parsed.errors[0] as string, true)
      return
    }

    const token = await this.getPublishTokenIfNeeded('Uploading a map file on the hosted site requires write access to the GitHub repository.')
    if (requiresGitHubTokenForMapPublishing() && !token) {
      return
    }

    this.setBusy(true, this.getUploadProgressMessage(parsed.value.slot))
    try {
      const published = await publishMapSlotFile(parsed.value, { token })
      await this.refreshMapSummaries()
      this.applyLoadedMapFile(published, this.getUploadSuccessMessage(published.slot))
    } catch (error) {
      this.handleGitHubError(error, this.getUploadFailureMessage(parsed.value.slot))
    } finally {
      this.setBusy(false)
    }
  }

  private renderEditor(): void {
    const title = this.editorMode === 'new'
      ? ['NEW MAP', `Save as ${formatLevelLabel(this.editorState.slot)}`].join('\n')
      : ['EDITING', formatLevelLabel(this.editorState.slot)].join('\n')

    this.editorTitleText?.setText(title)
    this.countsText?.setText(
      [
        `Player ${this.editorState.playerSpawn ? '1' : '0'}`,
        `Blocks ${this.editorState.blocks.length} | Columns ${this.editorState.columns.length}`,
        `NPCs ${this.editorState.enemies.length}`
      ].join('\n')
    )
    this.slotText?.setText(
      this.editorMode === 'new'
        ? `Save Slot: ${String(this.editorState.slot).padStart(2, '0')}`
        : `Published Slot: ${String(this.editorState.slot).padStart(2, '0')}`
    )
    this.toolHintText?.setText(
      [
        `Selected: ${TOOL_LABELS[this.selectedTool]}`,
        'Click a tile to place.',
        this.selectedTool === 'erase' ? 'Click a tile to erase its current item.' : 'Click the same tile again to remove.',
        'Player is limited to one.'
      ].join('\n')
    )

    for (let y = 0; y < PLAYABLE_AREA_HEIGHT; y += 1) {
      for (let x = 0; x < PLAYABLE_AREA_WIDTH; x += 1) {
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
        () => { void this.loadMap(summary.slot) }
      )
      this.mapButtons.push(button)
    }

    this.paginationText?.setText(`Page ${this.listPage + 1} / ${Math.max(1, this.getPageCount())}`)
  }

  private updateButtonStates(): void {
    this.setButtonState(this.newButton, { active: this.editorMode === 'new', disabled: this.busy })
    this.setButtonState(this.previousPageButton, { disabled: this.busy || this.listPage <= 0 })
    this.setButtonState(this.nextPageButton, { disabled: this.busy || this.listPage >= this.getPageCount() - 1 })
    this.setButtonState(this.slotMinusButton, { disabled: this.busy || this.editorMode !== 'new' || this.editorState.slot <= 2 })
    this.setButtonState(this.slotPlusButton, { disabled: this.busy || this.editorMode !== 'new' || this.editorState.slot >= MAP_MAX_SLOT })
    this.setButtonState(this.saveButton, { disabled: this.busy })
    this.setButtonState(this.downloadButton, { disabled: this.busy })
    this.setButtonState(this.uploadButton, { disabled: this.busy })
    this.setButtonState(this.deleteButton, { disabled: this.busy || this.editorState.slot === 1 || this.editorMode !== 'existing' })

    for (const tool of TOOL_ORDER) {
      this.setButtonState(this.toolButtons.get(tool), { active: this.selectedTool === tool, disabled: this.busy })
    }

    const start = this.listPage * this.listPageSize
    const visibleSummaries = this.mapSummaries.slice(start, start + this.listPageSize)
    visibleSummaries.forEach((summary, index) => {
      this.setButtonState(this.mapButtons[index], {
        active: this.editorMode === 'existing' && summary.slot === this.editorState.slot,
        disabled: this.busy
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

  private setBusy(nextBusy: boolean, message?: string): void {
    this.busy = nextBusy
    if (message) {
      this.setStatus(message)
    }
    this.updateButtonStates()
  }

  private getPageCount(): number {
    return Math.max(1, Math.ceil(this.mapSummaries.length / this.listPageSize))
  }

  private isLocalPublishingMode(): boolean {
    return getMapPublishingMode() === 'local'
  }

  private getCatalogReadyMessage(): string {
    return this.isLocalPublishingMode()
      ? 'Local map mode active. Saves write directly to public/maps. Commit and push when you want to publish permanently.'
      : 'Published map catalog loaded.'
  }

  private getSaveProgressMessage(slot: number): string {
    return this.isLocalPublishingMode()
      ? `Saving ${formatLevelLabel(slot)} to local project files...`
      : `Publishing ${formatLevelLabel(slot)} to GitHub...`
  }

  private getSaveSuccessMessage(slot: number): string {
    return this.isLocalPublishingMode()
      ? `${formatLevelLabel(slot)} saved locally to public/maps. Commit and push when you want it on GitHub Pages.`
      : `${formatLevelLabel(slot)} published. GitHub Pages may take a minute to refresh.`
  }

  private getSaveFailureMessage(slot: number): string {
    return this.isLocalPublishingMode()
      ? `Unable to save ${formatLevelLabel(slot)} to local project files.`
      : `Unable to publish ${formatLevelLabel(slot)}.`
  }

  private getDeleteProgressMessage(slot: number): string {
    return this.isLocalPublishingMode()
      ? `Clearing ${formatLevelLabel(slot)} from local project files...`
      : `Clearing ${formatLevelLabel(slot)} on GitHub...`
  }

  private getDeleteSuccessMessage(slot: number): string {
    return this.isLocalPublishingMode()
      ? `${formatLevelLabel(slot)} cleared locally. Commit and push when you want that change on GitHub Pages.`
      : `${formatLevelLabel(slot)} cleared. GitHub Pages may take a minute to refresh.`
  }

  private getDeleteFailureMessage(slot: number): string {
    return this.isLocalPublishingMode()
      ? `Unable to clear ${formatLevelLabel(slot)} from local project files.`
      : `Unable to clear ${formatLevelLabel(slot)}.`
  }

  private getUploadProgressMessage(slot: number): string {
    return this.isLocalPublishingMode()
      ? `Uploading ${formatLevelLabel(slot)} into local project files...`
      : `Uploading ${formatLevelLabel(slot)} to GitHub...`
  }

  private getUploadSuccessMessage(slot: number): string {
    return this.isLocalPublishingMode()
      ? `${formatLevelLabel(slot)} uploaded locally to public/maps. Commit and push when you want it on GitHub Pages.`
      : `${formatLevelLabel(slot)} uploaded and published. GitHub Pages may take a minute to refresh.`
  }

  private getUploadFailureMessage(slot: number): string {
    return this.isLocalPublishingMode()
      ? `Unable to upload ${formatLevelLabel(slot)} into local project files.`
      : `Unable to upload ${formatLevelLabel(slot)} to GitHub.`
  }

  private async getPublishTokenIfNeeded(reason: string): Promise<string | undefined> {
    if (this.isLocalPublishingMode()) {
      return undefined
    }

    return this.ensureGitHubToken(reason)
  }

  private async ensureGitHubToken(reason: string): Promise<string | undefined> {
    const storedToken = this.readStoredGitHubToken()
    if (storedToken) {
      return storedToken
    }

    if (typeof window === 'undefined') {
      this.setStatus('GitHub publishing requires a browser environment.', true)
      return undefined
    }

    const token = window.prompt(
      `${reason}\n\nPaste a GitHub Personal Access Token with contents write permission for tarikdsm/StoneAge.\nThe token will be kept only in this browser tab.`,
      ''
    )?.trim()

    if (!token) {
      this.setStatus('Publishing was canceled because no GitHub token was provided.', true)
      return undefined
    }

    window.sessionStorage.setItem(GITHUB_TOKEN_SESSION_KEY, token)
    return token
  }

  private readStoredGitHubToken(): string | undefined {
    try {
      if (typeof window === 'undefined') {
        return undefined
      }

      const token = window.sessionStorage.getItem(GITHUB_TOKEN_SESSION_KEY)?.trim()
      return token || undefined
    } catch {
      return undefined
    }
  }

  private clearStoredGitHubToken(): void {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(GITHUB_TOKEN_SESSION_KEY)
      }
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  private handleGitHubError(error: unknown, fallbackMessage: string): void {
    const message = error instanceof Error ? error.message : fallbackMessage
    if (message.includes('GitHub token rejected') || message.includes('GitHub denied access')) {
      this.clearStoredGitHubToken()
    }
    this.setStatus(message || fallbackMessage, true)
  }

  private async pickJsonFile(): Promise<File | undefined> {
    if (typeof document === 'undefined') {
      this.setStatus('File upload is only available in a browser.', true)
      return undefined
    }

    return await new Promise<File | undefined>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,application/json'
      input.addEventListener('change', () => {
        resolve(input.files?.[0] ?? undefined)
      }, { once: true })
      input.click()
    })
  }

  private triggerJsonDownload(contents: string, fileName: string): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      this.setStatus('Downloads are only available in a browser.', true)
      return
    }

    const blob = new Blob([contents], { type: 'application/json;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    window.URL.revokeObjectURL(url)
  }
}
