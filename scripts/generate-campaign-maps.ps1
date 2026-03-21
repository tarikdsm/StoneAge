[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$mapsDirectory = Join-Path $projectRoot 'public\maps'

$playableWidth = 10
$playableHeight = 10
$borderThickness = 1
$runtimeWidth = $playableWidth + ($borderThickness * 2)
$runtimeHeight = $playableHeight + ($borderThickness * 2)
$defaultTileSize = 64
$objectiveText = 'Crush every raider with the blocks.'

function New-Point {
  param(
    [int]$X,
    [int]$Y
  )

  [pscustomobject][ordered]@{
    x = $X
    y = $Y
  }
}

function Get-PointKey {
  param(
    $Point
  )

  '{0},{1}' -f $Point.x, $Point.y
}

function Test-InsidePlayableArea {
  param(
    $Point
  )

  return $Point.x -ge 0 -and $Point.x -lt $playableWidth -and $Point.y -ge 0 -and $Point.y -lt $playableHeight
}

function Convert-ToRuntimePoint {
  param(
    $Point
  )

  New-Point -X ($Point.x + $borderThickness) -Y ($Point.y + $borderThickness)
}

function Get-ManhattanDistance {
  param(
    $Left,
    $Right
  )

  return [Math]::Abs($Left.x - $Right.x) + [Math]::Abs($Left.y - $Right.y)
}

function Get-CenterDistance {
  param(
    $Point
  )

  return [Math]::Abs($Point.x - 4.5) + [Math]::Abs($Point.y - 4.5)
}

function Get-PoolPointsByMode {
  param(
    [object[]]$Points,
    [ValidateSet('forward', 'reverse', 'pingpong', 'center')]
    [string]$Mode
  )

  switch ($Mode) {
    'forward' {
      return @($Points)
    }
    'reverse' {
      $copy = @($Points)
      [array]::Reverse($copy)
      return $copy
    }
    'pingpong' {
      $ordered = @()
      $left = 0
      $right = $Points.Count - 1
      while ($left -le $right) {
        $ordered += $Points[$left]
        if ($right -ne $left) {
          $ordered += $Points[$right]
        }

        $left += 1
        $right -= 1
      }

      return $ordered
    }
    'center' {
      return @(
        $Points |
          Sort-Object `
            @{ Expression = { Get-CenterDistance -Point $_ } }, `
            @{ Expression = { [Math]::Abs($_.y - 4.5) } }, `
            @{ Expression = { [Math]::Abs($_.x - 4.5) } }, `
            y, `
            x
      )
    }
  }
}

function Get-TransformedPoint {
  param(
    $Point,
    [ValidateSet('identity', 'mirrorX', 'mirrorY', 'rotate90', 'rotate180', 'rotate270')]
    [string]$Transform
  )

  switch ($Transform) {
    'identity' {
      return New-Point -X $Point.x -Y $Point.y
    }
    'mirrorX' {
      return New-Point -X (9 - $Point.x) -Y $Point.y
    }
    'mirrorY' {
      return New-Point -X $Point.x -Y (9 - $Point.y)
    }
    'rotate90' {
      return New-Point -X (9 - $Point.y) -Y $Point.x
    }
    'rotate180' {
      return New-Point -X (9 - $Point.x) -Y (9 - $Point.y)
    }
    'rotate270' {
      return New-Point -X $Point.y -Y (9 - $Point.x)
    }
  }
}

function Get-TransformedPoints {
  param(
    [object[]]$Points,
    [string]$Transform
  )

  $result = @()
  foreach ($point in @($Points)) {
    if ($null -eq $point -or $null -eq $point.PSObject.Properties['x'] -or $null -eq $point.PSObject.Properties['y']) {
      $pointType = if ($null -eq $point) { 'null' } else { $point.GetType().FullName }
      throw "Cannot transform a non-point object of type '$pointType'."
    }

    $result += Get-TransformedPoint -Point $point -Transform $Transform
  }

  return $result
}

function Parse-LayoutTemplate {
  param(
    [string]$FamilyName,
    [string[]]$Lines
  )

  if ($Lines.Count -ne $playableHeight) {
    throw "Family '$FamilyName' must contain exactly $playableHeight rows."
  }

  $player = $null
  $blocks = @()
  $enemies = @()
  $columns = @()

  for ($y = 0; $y -lt $Lines.Count; $y += 1) {
    $line = $Lines[$y]
    if ($line.Length -ne $playableWidth) {
      throw "Family '$FamilyName' row $y must be exactly $playableWidth characters wide."
    }

    for ($x = 0; $x -lt $playableWidth; $x += 1) {
      $symbol = [string]$line[$x]
      switch ($symbol) {
        '.' { continue }
        'P' {
          if ($null -ne $player) {
            throw "Family '$FamilyName' defines more than one player."
          }

          $player = New-Point -X $x -Y $y
        }
        'b' {
          $blocks += New-Point -X $x -Y $y
        }
        'e' {
          $enemies += New-Point -X $x -Y $y
        }
        'c' {
          $columns += New-Point -X $x -Y $y
        }
        default {
          throw "Family '$FamilyName' uses an unsupported layout symbol '$symbol'."
        }
      }
    }
  }

  if ($null -eq $player) {
    throw "Family '$FamilyName' must contain one player marker."
  }

  return [pscustomobject][ordered]@{
    player = $player
    blocks = $blocks
    enemies = $enemies
    columns = $columns
  }
}

function Select-PoolPoints {
  param(
    [object[]]$Points,
    [int]$Count,
    [string]$Mode,
    [string]$Label
  )

  if ($Count -lt 0) {
    throw "$Label count cannot be negative."
  }

  if ($Count -gt $Points.Count) {
    throw "$Label count $Count exceeds the available pool size of $($Points.Count)."
  }

  return @(Get-PoolPointsByMode -Points $Points -Mode $Mode | Select-Object -First $Count)
}

function Get-BorderWalls {
  $walls = @()

  for ($x = 0; $x -lt $runtimeWidth; $x += 1) {
    $walls += New-Point -X $x -Y 0
    $walls += New-Point -X $x -Y ($runtimeHeight - 1)
  }

  for ($y = 1; $y -lt ($runtimeHeight - 1); $y += 1) {
    $walls += New-Point -X 0 -Y $y
    $walls += New-Point -X ($runtimeWidth - 1) -Y $y
  }

  return $walls
}

function Get-FreeNeighborCount {
  param(
    $Player,
    [System.Collections.Generic.HashSet[string]]$SolidKeys
  )

  $directions = @(
    @{ x = 0; y = -1 },
    @{ x = 1; y = 0 },
    @{ x = 0; y = 1 },
    @{ x = -1; y = 0 }
  )

  $count = 0
  foreach ($direction in $directions) {
    $candidate = New-Point -X ($Player.x + $direction.x) -Y ($Player.y + $direction.y)
    if ((Test-InsidePlayableArea -Point $candidate) -and -not $SolidKeys.Contains((Get-PointKey -Point $candidate))) {
      $count += 1
    }
  }

  return $count
}

function Get-LaunchOpportunityCount {
  param(
    [object[]]$Blocks,
    [object[]]$Columns
  )

  $columnKeys = [System.Collections.Generic.HashSet[string]]::new()
  foreach ($column in $Columns) {
    [void]$columnKeys.Add((Get-PointKey -Point $column))
  }

  $blockKeys = [System.Collections.Generic.HashSet[string]]::new()
  foreach ($block in $Blocks) {
    [void]$blockKeys.Add((Get-PointKey -Point $block))
  }

  $directions = @(
    @{ x = 0; y = -1 },
    @{ x = 1; y = 0 },
    @{ x = 0; y = 1 },
    @{ x = -1; y = 0 }
  )

  $launchable = 0
  foreach ($block in $Blocks) {
    $blockKey = Get-PointKey -Point $block
    foreach ($direction in $directions) {
      $steps = 0
      $cursor = New-Point -X $block.x -Y $block.y
      while ($true) {
        $cursor = New-Point -X ($cursor.x + $direction.x) -Y ($cursor.y + $direction.y)
        if (-not (Test-InsidePlayableArea -Point $cursor)) {
          if ($steps -ge 1) {
            $launchable += 1
          }

          break
        }

        $cursorKey = Get-PointKey -Point $cursor
        if ($columnKeys.Contains($cursorKey)) {
          if ($steps -ge 1) {
            $launchable += 1
          }

          break
        }

        if ($cursorKey -ne $blockKey -and $blockKeys.Contains($cursorKey)) {
          if ($steps -ge 1) {
            $launchable += 1
          }

          break
        }

        $steps += 1
      }
    }
  }

  return $launchable
}

function Get-LayoutSignature {
  param(
    $AuthoredLevel
  )

  $blocks = @($AuthoredLevel.blocks | ForEach-Object { Get-PointKey -Point $_ } | Sort-Object) -join ';'
  $enemies = @($AuthoredLevel.enemies | ForEach-Object { Get-PointKey -Point $_ } | Sort-Object) -join ';'
  $columns = @($AuthoredLevel.columns | ForEach-Object { Get-PointKey -Point $_ } | Sort-Object) -join ';'
  $player = Get-PointKey -Point $AuthoredLevel.player
  return "$player|$blocks|$enemies|$columns"
}

function New-AuthoredLevel {
  param(
    $Recipe,
    $Template
  )

  $resolvedBlockCount = [Math]::Min($Recipe.blockCount, $Template.blocks.Count)
  $resolvedEnemyCount = [Math]::Min($Recipe.enemyCount, $Template.enemies.Count)
  $resolvedColumnCount = [Math]::Min($Recipe.columnCount, $Template.columns.Count)

  $selectedBlocks = Select-PoolPoints -Points $Template.blocks -Count $resolvedBlockCount -Mode $Recipe.pickMode -Label "Block pool for slot $($Recipe.slot)"
  $selectedEnemies = Select-PoolPoints -Points $Template.enemies -Count $resolvedEnemyCount -Mode $Recipe.pickMode -Label "Enemy pool for slot $($Recipe.slot)"
  $selectedColumns = Select-PoolPoints -Points $Template.columns -Count $resolvedColumnCount -Mode $Recipe.pickMode -Label "Column pool for slot $($Recipe.slot)"

  $authored = [pscustomobject][ordered]@{
    slot = $Recipe.slot
    name = $Recipe.name
    player = Get-TransformedPoint -Point $Template.player -Transform $Recipe.transform
    blocks = @(Get-TransformedPoints -Points $selectedBlocks -Transform $Recipe.transform)
    enemies = @(Get-TransformedPoints -Points $selectedEnemies -Transform $Recipe.transform)
    columns = @(Get-TransformedPoints -Points $selectedColumns -Transform $Recipe.transform)
  }

  return $authored
}

function Assert-ValidAuthoredLevel {
  param(
    $AuthoredLevel,
    [int]$Slot
  )

  $occupied = [System.Collections.Generic.Dictionary[string, string]]::new()
  foreach ($entry in @(
    @{ label = 'player'; points = @($AuthoredLevel.player) },
    @{ label = 'block'; points = $AuthoredLevel.blocks },
    @{ label = 'enemy'; points = $AuthoredLevel.enemies },
    @{ label = 'column'; points = $AuthoredLevel.columns }
  )) {
    foreach ($point in $entry.points) {
      if (-not (Test-InsidePlayableArea -Point $point)) {
        throw "Slot $Slot places a $($entry.label) outside the playable area."
      }

      $key = Get-PointKey -Point $point
      if ($occupied.ContainsKey($key)) {
        throw "Slot $Slot overlaps $($entry.label) with $($occupied[$key]) at $key."
      }

      $occupied[$key] = $entry.label
    }
  }

  $solidKeys = [System.Collections.Generic.HashSet[string]]::new()
  foreach ($point in @($AuthoredLevel.blocks + $AuthoredLevel.columns + @($AuthoredLevel.player))) {
    [void]$solidKeys.Add((Get-PointKey -Point $point))
  }

  $requiredNeighborCount = if ($Slot -le 20) { 2 } elseif ($Slot -le 70) { 1 } else { 1 }
  $freeNeighborCount = Get-FreeNeighborCount -Player $AuthoredLevel.player -SolidKeys $solidKeys
  if ($freeNeighborCount -lt $requiredNeighborCount) {
    throw "Slot $Slot spawns the player too tightly (only $freeNeighborCount free neighbors)."
  }

  $minimumEnemyDistance = if ($Slot -le 10) { 4 } elseif ($Slot -le 70) { 3 } else { 2 }
  foreach ($enemy in $AuthoredLevel.enemies) {
    if ((Get-ManhattanDistance -Left $AuthoredLevel.player -Right $enemy) -lt $minimumEnemyDistance) {
      throw "Slot $Slot spawns an enemy too close to the player."
    }
  }

  $launchOpportunityCount = Get-LaunchOpportunityCount -Blocks $AuthoredLevel.blocks -Columns $AuthoredLevel.columns
  $requiredLaunchOpportunities = if ($Slot -le 20) { 2 } elseif ($Slot -le 70) { 3 } else { 4 }
  if ($launchOpportunityCount -lt $requiredLaunchOpportunities) {
    throw "Slot $Slot does not provide enough clean launch lanes."
  }
}

function Convert-ToRuntimeLevel {
  param(
    $AuthoredLevel
  )

  $runtimeWalls = @(
    (Get-BorderWalls) +
    @($AuthoredLevel.columns | ForEach-Object { Convert-ToRuntimePoint -Point $_ })
  )

  return [ordered]@{
    name = $AuthoredLevel.name
    tileSize = $defaultTileSize
    width = $runtimeWidth
    height = $runtimeHeight
    par = [Math]::Max(1, [Math]::Ceiling(($AuthoredLevel.enemies.Count + $AuthoredLevel.blocks.Count) / 3))
    objective = $objectiveText
    playerSpawn = Convert-ToRuntimePoint -Point $AuthoredLevel.player
    blocks = @($AuthoredLevel.blocks | ForEach-Object { Convert-ToRuntimePoint -Point $_ })
    enemies = @(
      $AuthoredLevel.enemies |
        ForEach-Object {
          $runtimePoint = Convert-ToRuntimePoint -Point $_
          [ordered]@{
            type = 'basic'
            x = $runtimePoint.x
            y = $runtimePoint.y
          }
        }
    )
    walls = $runtimeWalls
  }
}

function New-MapSlotFile {
  param(
    $AuthoredLevel
  )

  return [ordered]@{
    type = 'stoneage-map-slot'
    version = 2
    slot = $AuthoredLevel.slot
    empty = $false
    level = Convert-ToRuntimeLevel -AuthoredLevel $AuthoredLevel
  }
}

function Resolve-CampaignLayout {
  param(
    $Recipe,
    $Family,
    [System.Collections.Generic.HashSet[string]]$SeenSignatures
  )

  $transformCandidates = @(
    $Recipe.transform,
    'identity',
    'mirrorX',
    'mirrorY',
    'rotate90',
    'rotate180',
    'rotate270'
  ) | Select-Object -Unique

  $pickModeCandidates = @(
    $Recipe.pickMode,
    'forward',
    'reverse',
    'pingpong',
    'center'
  ) | Select-Object -Unique

  foreach ($transform in $transformCandidates) {
    foreach ($pickMode in $pickModeCandidates) {
      $candidateRecipe = [pscustomobject][ordered]@{
        slot = $Recipe.slot
        name = $Recipe.name
        blockCount = $Recipe.blockCount
        enemyCount = $Recipe.enemyCount
        columnCount = $Recipe.columnCount
        transform = $transform
        pickMode = $pickMode
      }

      try {
        $candidateLevel = New-AuthoredLevel -Recipe $candidateRecipe -Template $Family.template
        Assert-ValidAuthoredLevel -AuthoredLevel $candidateLevel -Slot $candidateRecipe.slot
        $signature = Get-LayoutSignature -AuthoredLevel $candidateLevel
        if (-not $SeenSignatures.Contains($signature)) {
          return [pscustomobject][ordered]@{
            authoredLevel = $candidateLevel
            signature = $signature
            transform = $transform
            pickMode = $pickMode
          }
        }
      } catch {
        continue
      }
    }
  }

  throw "Unable to resolve a unique valid layout for slot $($Recipe.slot)."
}

$familyDefinitions = [ordered]@{
  openLane = @{
    title = 'Clear Lane'
    lines = @(
      '..........',
      '.e.e.e.e..',
      '..bb.bb...',
      '....c.....',
      '...bb.bb..',
      '..c...c...',
      '...bb.bb..',
      '....P.....',
      '..c...c...',
      '.e......e.'
    )
  }
  twinGates = @{
    title = 'Twin Gates'
    lines = @(
      '..........',
      '.e...e...e',
      '..bcbcbb..',
      '...c.c....',
      '.b......b.',
      '..bb.bb...',
      '...c.c....',
      '..bbcbcb..',
      '.P......e.',
      '.....e....'
    )
  }
  sidePockets = @{
    title = 'Side Pockets'
    lines = @(
      'e..c..c..e',
      '.bb....bb.',
      '.c......c.',
      '...bb.bb..',
      '..e.c.e...',
      '....P.....',
      '...bb.bb..',
      '.c......c.',
      '.bb....bb.',
      'e..c..c..e'
    )
  }
  arenaCross = @{
    title = 'Cross Arena'
    lines = @(
      '...e..e...',
      '..........',
      '..c.bb.c..',
      '...c..c...',
      '.bb....bb.',
      '....P.....',
      '.bb....bb.',
      '...c..c...',
      '..c.ee.c..',
      '...e..e...'
    )
  }
  hourglass = @{
    title = 'Hourglass'
    lines = @(
      '.e......e.',
      '..c....c..',
      '...bbbbb..',
      '....c.....',
      '.b......b.',
      '....P.....',
      '.b......b.',
      '....c.....',
      '..c.ee.c..',
      '.e......e.'
    )
  }
  brokenRing = @{
    title = 'Broken Ring'
    lines = @(
      '..e....e..',
      '.ccc..ccc.',
      '.b......b.',
      'c..bbbb..c',
      '....P.....',
      'c..bbbb..c',
      '.b......b.',
      '.ccc..ccc.',
      '..e.e..e..',
      '.....e....'
    )
  }
  serpentine = @{
    title = 'Serpentine'
    lines = @(
      'e........e',
      '.cbb......',
      '.c..bb....',
      '.c....bb..',
      '.c..e...c.',
      '.bb....c..',
      '...bb..c..',
      '.....bbc..',
      '..P.....e.',
      'e........e'
    )
  }
  threeLanes = @{
    title = 'Three Lanes'
    lines = @(
      '.e..e..e..',
      '..c..c..c.',
      '.bb..bb..b',
      '..c..c..c.',
      '.bb..bb..b',
      '....P.....',
      '.bb..bb..b',
      '..c..c..c.',
      '.b...b...b',
      '.e..e..e..'
    )
  }
  splitIslands = @{
    title = 'Split Islands'
    lines = @(
      'e.cc..cc.e',
      '.bb....bb.',
      '.c......c.',
      '....bb....',
      '..c....c..',
      '....P.....',
      '..c....c..',
      '....bb....',
      '.c.e..e.c.',
      '.bb....bb.'
    )
  }
  pinwheel = @{
    title = 'Pinwheel'
    lines = @(
      '...e..e...',
      '..bb..c...',
      '.c..bb....',
      '....c..bb.',
      '..bb..c...',
      '....P.....',
      '...c..bb..',
      '.bb..c....',
      '....bb..c.',
      '...e..e...'
    )
  }
  gauntlet = @{
    title = 'Ice Gauntlet'
    lines = @(
      '.e......e.',
      '..bb..c...',
      '....c.....',
      '..bb..bb..',
      '.....c....',
      '....P.....',
      '..bb..bb..',
      '....c.....',
      '...c..bb..',
      '.e..e...e.'
    )
  }
  checker = @{
    title = 'Broken Checker'
    lines = @(
      'e...e...e.',
      '.c.b.c.b..',
      '..b.c.b.c.',
      '.c.b.c.b..',
      '..b...b...',
      '....P.....',
      '...b...b..',
      '..c.b.c.b.',
      '.b.c.b.c.e',
      'e...e...e.'
    )
  }
  crucible = @{
    title = 'Frozen Crucible'
    lines = @(
      '..e.e.e...',
      '.c.c.c.c..',
      '..bbbbb...',
      '.c.b.b.c..',
      '..bb.Pbb..',
      '.c.b.b.c..',
      '..bbbbb...',
      '.c.c.c.c..',
      '..e.e.e...',
      '.....e....'
    )
  }
  mirrorHalls = @{
    title = 'Mirror Halls'
    lines = @(
      '.e..cc..e.',
      '..bb..bb..',
      '.c......c.',
      '...bb.bb..',
      '....c.....',
      '..P...c...',
      '...bb.bb..',
      '.c......c.',
      '..bb..bb..',
      '.e..cc..e.'
    )
  }
  crossfire = @{
    title = 'Crossfire'
    lines = @(
      '.e.e..e.e.',
      '..c....c..',
      '.bb.c.c.bb',
      '...bbbb...',
      '.c......c.',
      '....P.....',
      '.c......c.',
      '...bbbb...',
      '.bb.c.c.bb',
      '.e.e..e.e.'
    )
  }
}

$parsedFamilies = @{}
foreach ($familyName in $familyDefinitions.Keys) {
  $parsedFamilies[$familyName] = [pscustomobject][ordered]@{
    title = $familyDefinitions[$familyName].title
    template = Parse-LayoutTemplate -FamilyName $familyName -Lines $familyDefinitions[$familyName].lines
  }
}

$actDefinitions = @(
  @{
    theme = 'Lessons'
    families = @('openLane', 'openLane', 'twinGates', 'sidePockets', 'arenaCross', 'threeLanes', 'twinGates', 'gauntlet', 'mirrorHalls', 'brokenRing')
    transforms = @('identity', 'mirrorX', 'identity', 'mirrorX', 'mirrorY', 'mirrorX', 'rotate180', 'identity', 'mirrorY', 'identity')
    pickModes = @('forward', 'forward', 'forward', 'reverse', 'forward', 'forward', 'reverse', 'forward', 'center', 'forward')
    enemies = @(1, 1, 2, 2, 2, 3, 3, 3, 3, 3)
    blocks = @(4, 4, 5, 5, 5, 6, 6, 6, 7, 7)
    columns = @(0, 1, 2, 2, 3, 4, 4, 5, 5, 5)
  },
  @{
    theme = 'Pressure'
    families = @('hourglass', 'twinGates', 'threeLanes', 'sidePockets', 'splitIslands')
    transforms = @('identity', 'mirrorX', 'mirrorY', 'rotate180', 'identity')
    pickModes = @('forward', 'reverse', 'pingpong', 'forward', 'center')
    enemies = @(3, 3, 3, 4, 4, 4, 4, 4, 4, 4)
    blocks = @(6, 6, 7, 7, 7, 8, 8, 8, 8, 9)
    columns = @(4, 5, 5, 6, 6, 6, 7, 7, 8, 8)
  },
  @{
    theme = 'Pursuit'
    families = @('arenaCross', 'pinwheel', 'serpentine', 'brokenRing', 'gauntlet')
    transforms = @('identity', 'rotate90', 'mirrorX', 'rotate180', 'rotate270')
    pickModes = @('forward', 'reverse', 'center', 'pingpong', 'forward')
    enemies = @(4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5)
    blocks = @(7, 7, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 10, 10)
    columns = @(6, 6, 6, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10)
  },
  @{
    theme = 'Tactics'
    families = @('splitIslands', 'mirrorHalls', 'brokenRing', 'threeLanes', 'checker')
    transforms = @('identity', 'mirrorY', 'rotate90', 'rotate180', 'rotate270')
    pickModes = @('center', 'forward', 'reverse', 'pingpong', 'center')
    enemies = @(5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6)
    blocks = @(8, 8, 8, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10)
    columns = @(7, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11)
  },
  @{
    theme = 'Assault'
    families = @('crossfire', 'checker', 'brokenRing', 'crucible', 'serpentine')
    transforms = @('identity', 'mirrorX', 'rotate90', 'rotate180', 'rotate270')
    pickModes = @('forward', 'center', 'reverse', 'pingpong', 'center')
    enemies = @(6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7)
    blocks = @(9, 9, 9, 10, 10, 10, 10, 10, 10, 11, 11, 10, 10, 11, 11, 11, 11, 12, 12, 12)
    columns = @(8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12)
  },
  @{
    theme = 'Siege'
    families = @('crossfire', 'crucible', 'checker', 'brokenRing', 'threeLanes')
    transforms = @('mirrorY', 'rotate90', 'rotate180', 'rotate270', 'identity')
    pickModes = @('center', 'pingpong', 'reverse', 'forward', 'center')
    enemies = @(6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7)
    blocks = @(10, 10, 10, 10, 10, 11, 11, 11, 11, 11, 12, 12, 12, 12, 12)
    columns = @(9, 10, 10, 10, 10, 10, 11, 11, 11, 11, 11, 12, 12, 12, 12)
  },
  @{
    theme = 'Endgame'
    families = @('crucible', 'crossfire', 'checker', 'crossfire', 'checker', 'crucible', 'crossfire', 'crucible', 'checker', 'crossfire', 'checker', 'crucible', 'crossfire', 'crucible')
    transforms = @('identity', 'rotate90', 'rotate180', 'rotate270', 'mirrorX', 'mirrorY', 'identity')
    pickModes = @('center', 'pingpong', 'reverse', 'forward', 'center', 'reverse', 'pingpong')
    enemies = @(7, 7, 7, 7, 7, 7, 7, 8, 8, 7, 8, 8, 8, 8)
    blocks = @(10, 10, 11, 11, 11, 11, 12, 11, 12, 12, 12, 12, 12, 12)
    columns = @(10, 10, 10, 11, 11, 11, 12, 10, 11, 11, 12, 12, 12, 12)
  }
)

function New-CampaignRecipes {
  $recipes = @()
  $slot = 1

  foreach ($act in $actDefinitions) {
    $stageCount = $act.enemies.Count
    for ($index = 0; $index -lt $stageCount; $index += 1) {
      $familyName = $act.families[$index % $act.families.Count]
      $transform = $act.transforms[$index % $act.transforms.Count]
      $pickMode = $act.pickModes[$index % $act.pickModes.Count]
      $familyTitle = $parsedFamilies[$familyName].title

      $recipes += [ordered]@{
        slot = $slot
        actTheme = $act.theme
        family = $familyName
        transform = $transform
        pickMode = $pickMode
        enemyCount = $act.enemies[$index]
        blockCount = $act.blocks[$index]
        columnCount = $act.columns[$index]
        name = '{0} {1:D2} - {2}' -f $act.theme, $slot, $familyTitle
      }

      $slot += 1
    }
  }

  if ($recipes.Count -ne 99) {
    throw "Expected 99 campaign recipes but generated $($recipes.Count)."
  }

  return $recipes
}

$recipes = New-CampaignRecipes
$seenSignatures = [System.Collections.Generic.HashSet[string]]::new()
$summaries = @()

foreach ($recipe in $recipes) {
  $family = $parsedFamilies[$recipe.family]
  $resolvedLayout = Resolve-CampaignLayout -Recipe $recipe -Family $family -SeenSignatures $seenSignatures
  $authoredLevel = $resolvedLayout.authoredLevel
  [void]$seenSignatures.Add($resolvedLayout.signature)

  $mapSlotFile = New-MapSlotFile -AuthoredLevel $authoredLevel
  $json = ConvertTo-Json $mapSlotFile -Depth 8
  $fileName = 'map{0:D2}.json' -f $recipe.slot
  $filePath = Join-Path $mapsDirectory $fileName
  [System.IO.File]::WriteAllText($filePath, "$json`n", [System.Text.UTF8Encoding]::new($false))

  $summaries += [pscustomobject]@{
    Slot = $recipe.slot
    Theme = $recipe.actTheme
    Family = $family.title
    Enemies = $authoredLevel.enemies.Count
    Blocks = $authoredLevel.blocks.Count
    Columns = $authoredLevel.columns.Count
    Transform = $resolvedLayout.transform
    PickMode = $resolvedLayout.pickMode
  }
}

$grouped = $summaries | Group-Object Theme
foreach ($group in $grouped) {
  $averageEnemies = [Math]::Round((($group.Group | Measure-Object -Property Enemies -Average).Average), 2)
  $averageBlocks = [Math]::Round((($group.Group | Measure-Object -Property Blocks -Average).Average), 2)
  $averageColumns = [Math]::Round((($group.Group | Measure-Object -Property Columns -Average).Average), 2)
  Write-Host ("{0}: {1} maps | avg enemies {2} | avg blocks {3} | avg columns {4}" -f $group.Name, $group.Count, $averageEnemies, $averageBlocks, $averageColumns)
}

Write-Host ''
$summaries | Select-Object -First 12 | Format-Table -AutoSize
Write-Host ''
$summaries | Select-Object -Last 12 | Format-Table -AutoSize
Write-Host ''
Write-Host "Generated 99 published campaign maps in $mapsDirectory"
