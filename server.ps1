# ============================================================
#  Interview Copilot - local static server (no dependencies)
#  Windows PowerShell 5.1+ / PowerShell 7+
#  Usage:  powershell -ExecutionPolicy Bypass -File server.ps1
# ============================================================
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5188
if ($env:PORT) { $port = [int]$env:PORT }
$url = "http://localhost:$port/"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.ico'  = 'image/x-icon'
  '.woff' = 'font/woff'
  '.woff2'= 'font/woff2'
  '.txt'  = 'text/plain; charset=utf-8'
  '.map'  = 'application/json; charset=utf-8'
}

function Send-Response {
  param(
    [System.IO.Stream]$Stream,
    [string]$Status,
    [string]$ContentType,
    [byte[]]$Body
  )
  if ($null -eq $Body) { $Body = [byte[]]@() }
  $head = "HTTP/1.1 $Status`r`n" +
          "Content-Type: $ContentType`r`n" +
          "Content-Length: $($Body.Length)`r`n" +
          "Cache-Control: no-store, no-cache`r`n" +
          "X-Content-Type-Options: nosniff`r`n" +
          "Connection: close`r`n`r`n"
  $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
  $Stream.Write($headBytes, 0, $headBytes.Length)
  if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
  $Stream.Flush()
}

function Send-Text {
  param([System.IO.Stream]$Stream, [string]$Status, [string]$Text)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  Send-Response -Stream $Stream -Status $Status -ContentType 'text/plain; charset=utf-8' -Body $bytes
}

function Open-CopilotBrowser {
  param([string]$Url)
  if ($env:NO_BROWSER) { return }

  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($exe in $candidates) {
    if ($exe -and (Test-Path -LiteralPath $exe)) {
      try { Start-Process -FilePath $exe -ArgumentList $Url; return } catch { }
    }
  }
  try { Start-Process $Url } catch { }
}

try {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "  ERROR: port $port is busy." -ForegroundColor Red
  Write-Host "  Close the other window or run:  `$env:PORT=5174; .\server.ps1" -ForegroundColor DarkGray
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host ""
Write-Host "  Interview Copilot" -ForegroundColor Cyan
Write-Host "  $url" -ForegroundColor Green
Write-Host "  Files: $root" -ForegroundColor DarkGray
Write-Host "  Stop: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

Open-CopilotBrowser -Url $url

while ($true) {
  $client = $null
  try {
    $client = $listener.AcceptTcpClient()

    # brauzerin boş (preconnect) bağlantıları serveri bloklamasın
    if (-not $client.Client.Poll(800000, [System.Net.Sockets.SelectMode]::SelectRead)) {
      $client.Close(); continue
    }

    $client.ReceiveTimeout = 5000
    $client.SendTimeout = 5000

    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 2048, $true)

    $requestLine = $reader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($requestLine)) { $client.Close(); continue }

    # consume the remaining headers
    while ($true) {
      $line = $reader.ReadLine()
      if ($null -eq $line -or $line -eq '') { break }
    }

    $parts = $requestLine.Split(' ')
    $method = $parts[0].ToUpper()
    $target = $parts[1]

    if ($method -ne 'GET' -and $method -ne 'HEAD') {
      Send-Text -Stream $stream -Status '405 Method Not Allowed' -Text 'Method not allowed'
      $client.Close(); continue
    }

    $path = ($target -split '\?')[0]
    try { $path = [System.Uri]::UnescapeDataString($path) } catch { }

    if ($path -eq '/') { $path = '/index.html' }
    if ($path -eq '/favicon.ico') {
      Send-Response -Stream $stream -Status '204 No Content' -ContentType 'image/x-icon' -Body ([byte[]]@())
      $client.Close(); continue
    }

    $relative = $path.TrimStart('/') -replace '/', '\'
    $full = [System.IO.Path]::GetFullPath((Join-Path $root $relative))

    if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      Send-Text -Stream $stream -Status '403 Forbidden' -Text 'Forbidden'
      $client.Close(); continue
    }

    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $type = $mime[$ext]
      if (-not $type) { $type = 'application/octet-stream' }

      if ($method -eq 'HEAD') {
        Send-Response -Stream $stream -Status '200 OK' -ContentType $type -Body ([byte[]]@())
      } else {
        Send-Response -Stream $stream -Status '200 OK' -ContentType $type -Body $bytes
      }
    } else {
      Send-Text -Stream $stream -Status '404 Not Found' -Text "404 - not found: $path"
    }

    $client.Close()
  } catch {
    if ($client) { try { $client.Close() } catch { } }
  }
}
