param([string]$File, [string]$Root, [int]$Port = 8770, [switch]$Raw)
# Tiny static server for previewing artifact pages locally. The page itself is wrapped in the same
# minimal document skeleton the artifact host adds; every other file is served as-is.
# -Raw serves the page untouched, for the built website in site/, which already has its skeleton.
if ($env:PORT) { $Port = [int]$env:PORT }
if ($Root) { $Root = (Resolve-Path $Root).Path; if (-not $File) { $File = Join-Path $Root 'index.html' } }
$page = (Resolve-Path $File).Path
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } catch { Write-Output "Could not listen on port ${Port}: $_"; exit 1 }
Write-Output "Serving $page (root: $Root) on http://localhost:$Port/"
$head = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
$types = @{ '.js'='text/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.svg'='image/svg+xml'; '.html'='text/html; charset=utf-8' }
while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 1500   # browsers open spare connections that never send a request
    $reader = New-Object System.IO.StreamReader($stream)
    $first = $reader.ReadLine()
    while (($line = $reader.ReadLine()) -ne $null -and $line -ne '') { }
    $path = '/'
    if ($first -match '^\w+\s+(\S+)') { $path = [uri]::UnescapeDataString(($Matches[1] -split '\?')[0]) }
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
      } else { $status = '404 Not Found'; $body = [System.Text.Encoding]::UTF8.GetBytes('not found') }
    } else { $status = '404 Not Found'; $body = [System.Text.Encoding]::UTF8.GetBytes('not found') }
    $hdr = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: $ctype`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n")
    $stream.Write($hdr, 0, $hdr.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()
  } catch { } finally { if ($client) { $client.Close() } }
}
