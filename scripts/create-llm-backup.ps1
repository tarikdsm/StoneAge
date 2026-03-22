[CmdletBinding()]
param(
  [string]$ArchiveBaseName = "StoneAge_LLM_Backup"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

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
$backupDir = Join-Path $projectRoot "Backup_ZIP"
$timestamp = Get-Date -Format "ddMMyyyy_HHmm"
$archiveName = "{0}_{1}.zip" -f $ArchiveBaseName, $timestamp
$archivePath = Join-Path $backupDir $archiveName
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("stoneage-llm-backup-" + [System.Guid]::NewGuid())

$rootFiles = @(
  ".gitignore",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.bridge.json",
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
Add-FilesFromPath -RelativePath "trainer" -AllowedExtensions @(".py", ".md", ".txt", ".json")
Add-FilesFromPath -RelativePath "trainer_bridge" -AllowedExtensions @(".ts", ".md", ".txt", ".json")
Add-FilesFromPath -RelativePath "public\maps" -AllowedExtensions @(".json")
Add-FilesFromPath -RelativePath "public\assets" -AllowedExtensions @(".svg", ".json", ".md", ".txt")
Add-FilesFromPath -RelativePath "public\models" -AllowedExtensions @(".json", ".md", ".txt")

if ($includedFiles.Count -eq 0) {
  throw "No analyzable project files were collected for the backup."
}

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
    "- Excluded directories: .git, node_modules, dist, Backup_RAR, Backup_ZIP",
    "- Excluded outputs: compiled bundles, archives, binaries, temporary files",
    "",
    "This backup is intended to help LLMs inspect the current project state",
    "without noisy build artifacts or binary assets."
  )

  Set-Content -Path $manifestPath -Value $manifestLines -Encoding UTF8
  Set-Content -Path $fileListPath -Value $relativePaths -Encoding UTF8

  if (Test-Path $archivePath) {
    Remove-Item -Path $archivePath -Force
  }

  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stagingRoot,
    $archivePath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )

  Write-Output "Created LLM backup: $archivePath"
}
finally {
  if (Test-Path $stagingRoot) {
    Remove-Item -Path $stagingRoot -Recurse -Force
  }
}
