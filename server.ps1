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

  # başlıq + gövdəni TƏK paketdə göndər (delayed-ACK gecikməsinin qarşısını alır)
  if ($Body.Length -gt 0) {
    $all = New-Object byte[] ($headBytes.Length + $Body.Length)
    [Array]::Copy($headBytes, 0, $all, 0, $headBytes.Length)
    [Array]::Copy($Body, 0, $all, $headBytes.Length, $Body.Length)
    $Stream.Write($all, 0, $all.Length)
  } else {
    $Stream.Write($headBytes, 0, $headBytes.Length)
  }
  $Stream.Flush()
}

function Send-Text {
  param([System.IO.Stream]$Stream, [string]$Status, [string]$Text)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  Send-Response -Stream $Stream -Status $Status -ContentType 'text/plain; charset=utf-8' -Body $bytes
}

function Send-Json {
  param([System.IO.Stream]$Stream, [string]$Status, [string]$Json)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
  Send-Response -Stream $Stream -Status $Status -ContentType 'application/json; charset=utf-8' -Body $bytes
}

# ---------- avatar hadisə mərkəzi (yaddaşda) ----------
$script:avSeq = 0
$script:avEvents = New-Object System.Collections.ArrayList
$script:avState = 'idle'
$script:avLevel = 0.0
$script:avLevelAt = [DateTime]::MinValue
$script:avAudio = @{}
$script:avAudioAt = @{}
$script:avLastPoll = [DateTime]::MinValue

# --- Win32: pəncərəni həmişə üstdə (topmost) saxlamaq üçün ---
$winTopSource = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WinTop {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    // Brauzer (Chrome/Edge) app pəncərəsini tapır — konsol/VSCode kimi pəncərələri keçir.
    public static IntPtr FindBrowserWindow(string part) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate (IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd)) return true;
            int len = GetWindowTextLength(hWnd);
            if (len == 0) return true;
            StringBuilder sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            if (sb.ToString().IndexOf(part, StringComparison.OrdinalIgnoreCase) < 0) return true;

            StringBuilder cn = new StringBuilder(256);
            GetClassName(hWnd, cn, cn.Capacity);
            string cls = cn.ToString();
            if (cls.StartsWith("Chrome_WidgetWin") || cls == "ApplicationFrameWindow" || cls == "MozillaWindowClass") {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@

if (-not ('WinTop' -as [type])) {
  try { Add-Type -TypeDefinition $winTopSource -ErrorAction Stop } catch { }
}

function Test-AndPinTopmost {
  param([string]$TitlePart = 'Copilot')

  try {
    $hwnd = [WinTop]::FindBrowserWindow($TitlePart)
    if ($hwnd -eq [IntPtr]::Zero) { return $false }

    $HWND_TOPMOST = [IntPtr](-1)
    $SWP_NOMOVE = 0x0002
    $SWP_NOSIZE = 0x0001
    [WinTop]::SetWindowPos($hwnd, $HWND_TOPMOST, 0, 0, 0, 0, ($SWP_NOMOVE -bor $SWP_NOSIZE)) | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Open-CopilotBrowser {
  param([string]$Url)
  if ($env:NO_BROWSER) { return }

  # --app: brauzer çərçivəsiz ayrıca pəncərə (ünvan sətri/tab olmadan)
  $size = if ($env:COPILOT_SIZE) { $env:COPILOT_SIZE } else { '460,800' }
  $flags = @("--app=$Url", "--window-size=$size")

  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )

  $launched = $false
  foreach ($exe in $candidates) {
    if ($exe -and (Test-Path -LiteralPath $exe)) {
      try { Start-Process -FilePath $exe -ArgumentList $flags; $launched = $true; break } catch { }
    }
  }
  if (-not $launched) {
    try { Start-Process $Url; $launched = $true } catch { }
  }

  # pəncərə həmişə-üstdə server dövrəsində (aşağıda) yapışdırılır
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
Write-Host "  Window: app mode, always on top (off: NO_TOPMOST=1)" -ForegroundColor DarkGray
Write-Host "  Avatar: ${url}avatar.html  (OBS: ${url}avatar.html?obs=1)" -ForegroundColor DarkGray
Write-Host "  Stop: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

Open-CopilotBrowser -Url $url

$pinned = $false
while ($true) {
  # Səhifə yüklənib pəncərə başlığı görünən kimi həmişə-üstdə yapışdır.
  # Server dövrəsi ilə eyni yerdə işləyir — pəncərə tapılana qədər təkrar yoxlanır.
  if (-not $pinned -and -not $env:NO_TOPMOST) {
    $pinned = Test-AndPinTopmost
  }

  if (-not $listener.Pending()) {
    Start-Sleep -Milliseconds 20
    continue
  }

  $client = $null
  try {
    $client = $listener.AcceptTcpClient()

    # brauzerin boş (preconnect) bağlantıları serveri bloklamasın
    if (-not $client.Client.Poll(800000, [System.Net.Sockets.SelectMode]::SelectRead)) {
      $client.Close(); continue
    }

    $client.ReceiveTimeout = 5000
    $client.SendTimeout = 5000
    $client.NoDelay = $true

    $stream = $client.GetStream()

    # ---------- sorğunu bayt səviyyəsində oxu (başlıq + gövdə) ----------
    $buf = New-Object byte[] 8192
    $headerBytes = New-Object 'System.Collections.Generic.List[byte]'
    $headerEnd = -1
    $bodyStart = 0
    $guard = 0

    while ($headerEnd -lt 0 -and $guard -lt 64) {
      $guard++
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { break }
      for ($i = 0; $i -lt $n; $i++) { $headerBytes.Add($buf[$i]) }
      for ($i = 3; $i -lt $headerBytes.Count; $i++) {
        if ($headerBytes[$i - 3] -eq 13 -and $headerBytes[$i - 2] -eq 10 -and
            $headerBytes[$i - 1] -eq 13 -and $headerBytes[$i] -eq 10) {
          $headerEnd = $i - 3
          $bodyStart = $i + 1
          break
        }
      }
    }

    if ($headerEnd -lt 0) { $client.Close(); continue }

    $allBytes = $headerBytes.ToArray()
    $headerText = [System.Text.Encoding]::ASCII.GetString($allBytes, 0, $headerEnd)
    $lines = $headerText -split "`r`n"
    $requestLine = $lines[0]
    if ([string]::IsNullOrWhiteSpace($requestLine)) { $client.Close(); continue }

    $contentLength = 0
    for ($i = 1; $i -lt $lines.Length; $i++) {
      if ($lines[$i] -match '^(?i)content-length:\s*(\d+)\s*$') { $contentLength = [int]$matches[1] }
    }
    if ($contentLength -gt 6291456) {
      Send-Text -Stream $stream -Status '413 Payload Too Large' -Text 'Too large'
      $client.Close(); continue
    }

    $bodyBytes = New-Object byte[] $contentLength
    $got = 0
    $already = $allBytes.Length - $bodyStart
    if ($already -gt 0) {
      $got = [Math]::Min($already, $contentLength)
      if ($got -gt 0) { [Array]::Copy($allBytes, $bodyStart, $bodyBytes, 0, $got) }
    }
    while ($got -lt $contentLength) {
      $n = $stream.Read($bodyBytes, $got, $contentLength - $got)
      if ($n -le 0) { break }
      $got += $n
    }
    if ($got -lt $contentLength) {
      if ($got -eq 0) { $bodyBytes = [byte[]]@() } else { $bodyBytes = $bodyBytes[0..($got - 1)] }
    }

    $parts = $requestLine.Split(' ')
    $method = $parts[0].ToUpper()
    $target = $parts[1]

    $path = ($target -split '\?')[0]
    $query = ''
    if ($target.Contains('?')) { $query = $target.Substring($target.IndexOf('?') + 1) }
    try { $path = [System.Uri]::UnescapeDataString($path) } catch { }

    # ---------- Virtual insan (avatar) API ----------
    if ($path.StartsWith('/api/avatar/')) {
      $action = $path.Substring('/api/avatar/'.Length).TrimEnd('/')
      $nowUtc = [DateTime]::UtcNow

      # köhnəlmiş hadisə və audioları təmizlə
      for ($i = $script:avEvents.Count - 1; $i -ge 0; $i--) {
        if (($nowUtc - $script:avEvents[$i].at).TotalSeconds -gt 300) { $script:avEvents.RemoveAt($i) }
      }
      foreach ($k in @($script:avAudio.Keys)) {
        if (($nowUtc - $script:avAudioAt[$k]).TotalMinutes -gt 10) {
          $script:avAudio.Remove($k); $script:avAudioAt.Remove($k)
        }
      }

      if ($action -eq 'event' -and $method -eq 'POST') {
        $obj = $null
        try { $obj = [System.Text.Encoding]::UTF8.GetString($bodyBytes) | ConvertFrom-Json } catch { }
        if ($obj -and $obj.type) {
          $script:avSeq++
          [void]$script:avEvents.Add(@{
            seq   = $script:avSeq
            type  = [string]$obj.type
            text  = [string]$obj.text
            lang  = [string]$obj.lang
            audio = [string]$obj.audio
            at    = $nowUtc
          })
          while ($script:avEvents.Count -gt 40) { $script:avEvents.RemoveAt(0) }
          Send-Json -Stream $stream -Status '200 OK' -Json ('{"ok":true,"seq":' + $script:avSeq + '}')
        } else {
          Send-Text -Stream $stream -Status '400 Bad Request' -Text 'Bad event'
        }
        $client.Close(); continue
      }

      if ($action -eq 'state' -and $method -eq 'POST') {
        $obj = $null
        try { $obj = [System.Text.Encoding]::UTF8.GetString($bodyBytes) | ConvertFrom-Json } catch { }
        if ($obj) {
          if ($obj.state) { $script:avState = [string]$obj.state }
          if ($null -ne $obj.level) {
            $script:avLevel = [Math]::Min(1.0, [Math]::Max(0.0, [double]$obj.level))
            $script:avLevelAt = $nowUtc
          }
          Send-Json -Stream $stream -Status '200 OK' -Json '{"ok":true}'
        } else {
          Send-Text -Stream $stream -Status '400 Bad Request' -Text 'Bad state'
        }
        $client.Close(); continue
      }

      if ($action -eq 'poll' -and ($method -eq 'GET' -or $method -eq 'HEAD')) {
        $since = -1
        if ($query -match '(?:^|&)since=(\d+)') { $since = [int]$matches[1] }
        # ilk qoşulmada (since=latest) köhnə hadisələri təkrar göndərmirik
        if ($since -lt 0) { $since = $script:avSeq }

        $items = @()
        foreach ($e in $script:avEvents) {
          if ($e.seq -gt $since) {
            $out = @{ seq = $e.seq; type = $e.type; text = $e.text; lang = $e.lang; audio = $e.audio }
            $items += ($out | ConvertTo-Json -Compress -Depth 5)
          }
        }

        $script:avLastPoll = $nowUtc
        $inv = [System.Globalization.CultureInfo]::InvariantCulture
        $levelStr = ([double]$script:avLevel).ToString('0.###', $inv)
        $levelAge = -1
        if ($script:avLevelAt -ne [DateTime]::MinValue) {
          $levelAge = [int]($nowUtc - $script:avLevelAt).TotalMilliseconds
        }
        $stateJson = ConvertTo-Json -Compress -InputObject ([string]$script:avState)
        $json = '{"ok":true,"seq":' + $script:avSeq + ',"state":' + $stateJson +
                ',"level":' + $levelStr + ',"levelAge":' + $levelAge +
                ',"events":[' + ($items -join ',') + ']}'
        Send-Json -Stream $stream -Status '200 OK' -Json $json
        $client.Close(); continue
      }

      if ($action -eq 'audio' -and $method -eq 'POST') {
        if ($bodyBytes.Length -lt 64) {
          Send-Text -Stream $stream -Status '400 Bad Request' -Text 'Empty audio'
        } else {
          $id = [guid]::NewGuid().ToString('N')
          $script:avAudio[$id] = $bodyBytes
          $script:avAudioAt[$id] = $nowUtc
          while ($script:avAudio.Count -gt 12) {
            $oldest = $null
            $oldestAt = [DateTime]::MaxValue
            foreach ($k in @($script:avAudio.Keys)) {
              if ($script:avAudioAt[$k] -lt $oldestAt) { $oldestAt = $script:avAudioAt[$k]; $oldest = $k }
            }
            if (-not $oldest) { break }
            $script:avAudio.Remove($oldest); $script:avAudioAt.Remove($oldest)
          }
          Send-Json -Stream $stream -Status '200 OK' -Json ('{"ok":true,"id":"' + $id + '"}')
        }
        $client.Close(); continue
      }

      if ($action.StartsWith('audio/') -and ($method -eq 'GET' -or $method -eq 'HEAD')) {
        $id = $action.Substring(6)
        if ($script:avAudio.ContainsKey($id)) {
          $bytesOut = [byte[]]$script:avAudio[$id]
          if ($method -eq 'HEAD') { $bytesOut = [byte[]]@() }
          Send-Response -Stream $stream -Status '200 OK' -ContentType 'audio/mpeg' -Body $bytesOut
        } else {
          Send-Text -Stream $stream -Status '404 Not Found' -Text 'audio yoxdur'
        }
        $client.Close(); continue
      }

      if ($action -eq 'ping') {
        $age = -1
        if ($script:avLastPoll -ne [DateTime]::MinValue) {
          $age = [int]($nowUtc - $script:avLastPoll).TotalMilliseconds
        }
        Send-Json -Stream $stream -Status '200 OK' -Json ('{"ok":true,"ageMs":' + $age + '}')
        $client.Close(); continue
      }

      Send-Text -Stream $stream -Status '404 Not Found' -Text 'API yoxdur'
      $client.Close(); continue
    }

    # ---------- statik fayllar ----------
    if ($method -ne 'GET' -and $method -ne 'HEAD') {
      Send-Text -Stream $stream -Status '405 Method Not Allowed' -Text 'Method not allowed'
      $client.Close(); continue
    }

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
