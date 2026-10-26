param([string]$File, [string]$Root, [int]$Port = 8770, [switch]$Raw, [string]$UploadDir)
# Tiny static server for previewing artifact pages locally (localhost only). The page itself is wrapped
# in the same minimal document skeleton the artifact host adds; every other file is served as-is.
# -Raw serves the page untouched, for the built website in site/, which already has its skeleton.
# -UploadDir also accepts POST /upload?name=<file> and saves the request body there; the video studio
# uses it to save rendered videos and stills. Names are limited to letters, digits, '.', '_' and '-'.
if ($env:PORT) { $Port = [int]$env:PORT }
if ($Root) { $Root = (Resolve-Path $Root).Path; if (-not $File) { $File = Join-Path $Root 'index.html' } }
$page = (Resolve-Path $File).Path
if ($UploadDir) { New-Item -ItemType Directory -Force $UploadDir | Out-Null; $UploadDir = (Resolve-Path $UploadDir).Path }
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } catch { Write-Output "Could not listen on port ${Port}: $_"; exit 1 }
Write-Output "Serving $page (root: $Root) on http://localhost:$Port/"
$head = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
$types = @{ '.js'='text/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.svg'='image/svg+xml'; '.html'='text/html; charset=utf-8'; '.mp4'='video/mp4'; '.txt'='text/plain; charset=utf-8' }

# Read the request line and headers byte by byte, so a binary body that follows is left untouched in the stream.
function Read-Head($stream) {
  $buf = New-Object System.Collections.Generic.List[byte]
  $one = New-Object byte[] 1
  while ($buf.Count -lt 65536) {
    if ($stream.Read($one, 0, 1) -le 0) { break }
    $buf.Add($one[0]); $c = $buf.Count
    if ($c -ge 4 -and $buf[$c - 4] -eq 13 -and $buf[$c - 3] -eq 10 -and $buf[$c - 2] -eq 13 -and $buf[$c - 1] -eq 10) { break }
  }
  return [System.Text.Encoding]::ASCII.GetString($buf.ToArray())
}
function Send($stream, $status, $ctype, $body) {
  $hdr = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: $ctype`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n")
  $stream.Write($hdr, 0, $hdr.Length)
  $stream.Write($body, 0, $body.Length)
  $stream.Flush()
}
$text = { param($s) [System.Text.Encoding]::UTF8.GetBytes($s) }

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 1500   # browsers open spare connections that never send a request
    $headText = Read-Head $stream
    $lines = $headText -split "`r`n"
    $method = 'GET'; $path = '/'; $query = ''
    if ($lines[0] -match '^(\w+)\s+(\S+)') {
      $method = $Matches[1]
      $parts = $Matches[2] -split '\?', 2
      $path = [uri]::UnescapeDataString($parts[0]); if ($parts.Count -gt 1) { $query = $parts[1] }
    }
    if ($method -eq 'POST' -and $path -eq '/upload' -and $UploadDir) {
      $name = ''; foreach ($kv in ($query -split '&')) { if ($kv -match '^name=(.+)$') { $name = [uri]::UnescapeDataString($Matches[1]) } }
      $len = 0; foreach ($l in $lines) { if ($l -match '^(?i)content-length:\s*(\d+)') { $len = [long]$Matches[1] } }
      if ($name -notmatch '^[A-Za-z0-9._-]{1,120}$' -or $name -match '^\.') { Send $stream '400 Bad Request' 'text/plain' (& $text 'bad name'); continue }
      $stream.ReadTimeout = 30000
      $target = Join-Path $UploadDir $name
      $fs = [System.IO.File]::Create($target)
      try {
        $chunk = New-Object byte[] 65536; $left = $len
        while ($left -gt 0) { $n = $stream.Read($chunk, 0, [int][Math]::Min($chunk.Length, $left)); if ($n -le 0) { break }; $fs.Write($chunk, 0, $n); $left -= $n }
      } finally { $fs.Close() }
      Send $stream '200 OK' 'text/plain; charset=utf-8' (& $text "saved $($len - $left) bytes to $name")
      continue
    }
    $status = '200 OK'; $ctype = 'text/html; charset=utf-8'
    if ($path -eq '/' -or $path -eq '/index.html') {
      if ($Raw) { $body = [IO.File]::ReadAllBytes($page) }
      else { $body = [System.Text.Encoding]::UTF8.GetBytes($head + [System.IO.File]::ReadAllText($page) + '</body></html>') }
    } elseif ($Root) {
      $rel = $path.TrimStart('/') -replace '/', '\'
      $full = [IO.Path]::GetFullPath((Join-Path $Root $rel))
      if ($full.StartsWith($Root) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
        $body = [IO.File]::ReadAllBytes($full)
        $ext = [IO.Path]::GetExtension($full).ToLower()
        if ($types.ContainsKey($ext)) { $ctype = $types[$ext] } else { $ctype = 'application/octet-stream' }
      } else { $status = '404 Not Found'; $body = & $text 'not found' }
    } else { $status = '404 Not Found'; $body = & $text 'not found' }
    Send $stream $status $ctype $body
  } catch { } finally { if ($client) { $client.Close() } }
}
