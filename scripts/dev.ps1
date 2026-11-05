# scripts/dev.ps1
# Chạy cả Control Plane Backend (Go) + Next.js Frontend
# Sử dụng: .\scripts\dev.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Ada AI Chat - Dev Server ===" -ForegroundColor Cyan
Write-Host ""

function Check-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "WARNING: '$Name' không tìm thấy trong PATH" -ForegroundColor Yellow
        return $false
    }
    return $true
}

$hasGo = Check-Command "go"
$hasNode = Check-Command "node"

if (-not $hasNode) {
    Write-Host "Node.js là bắt buộc. Cài đặt từ nodejs.org" -ForegroundColor Red
    exit 1
}

$root = Resolve-Path "."
$controlPlaneDir = Join-Path $root "..\Adamolow\control-plane"
$frontendDir = Join-Path $root "frontend"

function Start-Background {
    param([string]$Name, [string]$Command, [string]$WorkingDir)
    Write-Host "Khởi động $Name..." -ForegroundColor Green
    $process = Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $Command -WorkingDirectory $WorkingDir -PassThru
    Write-Host "$Name đã khởi động (PID: $($process.Id))" -ForegroundColor Gray
    return $process
}

# 1. Go Backend
if ($hasGo -and (Test-Path $controlPlaneDir)) {
    Write-Host "Build Go backend..." -ForegroundColor Cyan
    cd $controlPlaneDir
    go mod tidy | Out-Null
    go build -o server.exe cmd/server/main.go | Out-Null
    $cpProc = Start-Background "Control Plane Backend (Go, :8920)" ".\server.exe" $controlPlaneDir
} elseif (-not $hasGo) {
    Write-Host "Go chưa cài đặt, bỏ qua backend" -ForegroundColor Yellow
} else {
    Write-Host "Thư mục control-plane không tìm thấy" -ForegroundColor Yellow
}

# 2. Next.js Frontend
if (Test-Path $frontendDir) {
    Write-Host "Cài đặt dependencies Frontend..." -ForegroundColor Cyan
    npm install --prefix $frontendDir | Out-Null
    $feProc = Start-Background "Next.js Frontend (:3000)" "npm run dev" $frontendDir
} else {
    Write-Host "Thư mục frontend không tìm thấy" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Tất cả tiến trình đã khởi động ===" -ForegroundColor Green
Write-Host "Control Plane Backend: http://localhost:8920" -ForegroundColor Gray
Write-Host "Next.js Frontend:      http://localhost:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "Nhấn Ctrl+C để dừng tất cả" -ForegroundColor Yellow

while ($true) {
    Start-Sleep -Seconds 5
}