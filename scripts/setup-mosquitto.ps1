$ErrorActionPreference = 'Stop'

$backendRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $backendRoot 'mosquitto\config'
$passwordFile = Join-Path $configPath 'passwordfile'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is required. Install Docker Desktop and try again.'
}

New-Item -ItemType Directory -Force -Path $configPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backendRoot 'mosquitto\data') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backendRoot 'mosquitto\log') | Out-Null

if (Test-Path $passwordFile) {
  $answer = Read-Host "Password file already exists. Recreate it? (y/N)"
  if ($answer -notmatch '^(y|yes)$') {
    Write-Host 'Keeping the existing Mosquitto password file.'
  } else {
    docker run --rm -it -v "${configPath}:/mosquitto/config" eclipse-mosquitto:2 `
      mosquitto_passwd -c /mosquitto/config/passwordfile capstoneb05
  }
} else {
  docker run --rm -it -v "${configPath}:/mosquitto/config" eclipse-mosquitto:2 `
    mosquitto_passwd -c /mosquitto/config/passwordfile capstoneb05
}

if (-not (Test-Path $passwordFile)) {
  throw "Mosquitto password file was not created at $passwordFile"
}

Set-Location $backendRoot
docker compose up -d mongodb mosquitto
docker compose ps mongodb mosquitto
