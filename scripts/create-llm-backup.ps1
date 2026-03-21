[CmdletBinding()]
param(
  [string]$ArchiveBaseName = "StoneAge_LLM_Backup"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WinRarPath {
  $candidates = @(@(
    (Join-Path $env:ProgramFiles "WinRAR\WinRAR.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "WinRAR\WinRAR.exe")
  ) | Where-Object { $_ -and (Test-Path $_) })

  if ($candidates.Count -gt 0) {
    return $candidates[0]
  }

  foreach ($commandName in @("WinRAR.exe", "Rar.exe")) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  throw "WinRAR was not found. Install WinRAR before generating `.rar` backups."
}

function Get-ProjectRelativePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  $baseUri = [System.Uri]::new(($BasePath.TrimEnd("\") + "\"))
  $targetUri = [System.Uri]::new($TargetPath)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace("/", "\")
}

function Add-FilesFromPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RelativePath,
    [string[]]$AllowedExtensions = @()
  )

  $absolutePath = Join-Path $projectRoot $RelativePath
  if (-not (Test-Path $absolutePath)) {
    return
  }

  Get-ChildItem -Path $absolutePath -Recurse -File | ForEach-Object {
    $extension = $_.Extension.ToLowerInvariant()
    if ($AllowedExtensions.Count -eq 0 -or $AllowedExtensions -contains $extension) {
      [void]$includedFiles.Add($_.FullName)
    }
  }
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backupDir = Join-Path $projectRoot "Backup_RAR"
$timestamp = Get-Date -Format "ddMMyyyy_HHmm"
$archiveName = "{0}_{1}.rar" -f $ArchiveBaseName, $timestamp
$archivePath = Join-Path $backupDir $archiveName
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("stoneage-llm-backup-" + [System.Guid]::NewGuid())

$rootFiles = @(
  ".gitignore",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "vite.config.ts",
  "eslint.config.js",
  "index.html"
)

$allowedTextExtensions = @(
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".html",
  ".css",
  ".scss",
  ".svg",
  ".txt"
)

$includedFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

foreach ($rootFile in $rootFiles) {
  $fullPath = Join-Path $projectRoot $rootFile
  if (Test-Path $fullPath) {
    [void]$includedFiles.Add((Resolve-Path $fullPath).Path)
  }
}

Get-ChildItem -Path $projectRoot -File -Filter "*.md" | ForEach-Object {
  [void]$includedFiles.Add($_.FullName)
}

Add-FilesFromPath -RelativePath ".github" -AllowedExtensions @(".yml", ".yaml", ".json", ".md")
Add-FilesFromPath -RelativePath "docs" -AllowedExtensions $allowedTextExtensions
Add-FilesFromPath -RelativePath "scripts" -AllowedExtensions $allowedTextExtensions
Add-FilesFromPath -RelativePath "src" -AllowedExtensions $allowedTextExtensions
Add-FilesFromPath -RelativePath "public\maps" -AllowedExtensions @(".json")
Add-FilesFromPath -RelativePath "public\assets" -AllowedExtensions @(".svg", ".json", ".md", ".txt")

if ($includedFiles.Count -eq 0) {
  throw "No analyzable project files were collected for the backup."
}

$winRarPath = Resolve-WinRarPath

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

try {
  $relativePaths = @($includedFiles |
    ForEach-Object { Get-ProjectRelativePath -BasePath $projectRoot -TargetPath $_ } |
    Sort-Object)

  foreach ($relativePath in $relativePaths) {
    $sourcePath = Join-Path $projectRoot $relativePath
    $targetPath = Join-Path $stagingRoot $relativePath
    $targetDirectory = Split-Path -Path $targetPath -Parent

    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    Copy-Item -Path $sourcePath -Destination $targetPath -Force
  }

  $manifestPath = Join-Path $stagingRoot "LLM_BACKUP_MANIFEST.md"
  $fileListPath = Join-Path $stagingRoot "LLM_BACKUP_FILE_LIST.txt"
  $generatedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
  $manifestLines = @(
    "# Stone Age LLM Backup",
    "",
    "- Generated at: $generatedAt",
    "- Source root: $projectRoot",
    "- Archive name: $archiveName",
    "- Included file count: $($relativePaths.Count)",
    "- Excluded directories: .git, node_modules, dist, Backup_RAR",
    "- Excluded outputs: compiled bundles, archives, binaries, temporary files",
    "",
    "This backup is intended to help LLMs inspect the current project state",
    "without noisy build artifacts or binary assets."
  )

  Set-Content -Path $manifestPath -Value $manifestLines -Encoding UTF8
  Set-Content -Path $fileListPath -Value $relativePaths -Encoding UTF8

  $sourceItems = @(Get-ChildItem -Path $stagingRoot -Force | ForEach-Object { $_.FullName })
  if ($sourceItems.Count -eq 0) {
    throw "The backup staging directory is empty."
  }

  & $winRarPath a -r -ep1 $archivePath @sourceItems | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "WinRAR failed with exit code $LASTEXITCODE."
  }

  Write-Output "Created LLM backup: $archivePath"
}
finally {
  if (Test-Path $stagingRoot) {
    Remove-Item -Path $stagingRoot -Recurse -Force
  }
}
