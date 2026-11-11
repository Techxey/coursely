# Sync the web app source into Android assets before building.
# Usage: powershell -ExecutionPolicy Bypass -File tools\sync-web.ps1
# (Paths are derived from this script's location so the Chinese directory name never enters the script text.)
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot          # <repo>/android
$workspace   = Split-Path -Parent $projectRoot           # <repo>
$src         = Join-Path $workspace "web"
$dst         = Join-Path $projectRoot "app\src\main\assets\www"

if (-not (Test-Path $src)) { throw "web source not found: $src" }
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
New-Item -ItemType Directory -Force $dst | Out-Null

Copy-Item (Join-Path $src "index.html") $dst -Force
Copy-Item (Join-Path $src "manifest.webmanifest") $dst -Force
Copy-Item (Join-Path $src "css") $dst -Recurse -Force
Copy-Item (Join-Path $src "js") $dst -Recurse -Force
Copy-Item (Join-Path $src "assets") $dst -Recurse -Force

$files = Get-ChildItem $dst -Recurse -File
$kb = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1kb), 1)
Write-Host "synced: $($files.Count) files, $kb KB -> $dst"
