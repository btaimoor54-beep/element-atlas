# Build the public website in site/ from the single source in atlas/.
#
# atlas/index.html is written for the Claude Artifact host, which wraps the page in a document
# skeleton (doctype, charset, viewport, a few base styles). A normal web host does not, so this
# script adds the same skeleton plus search and share tags, and copies the website-only extras
# from web/ (favicon, 404 page, robots.txt). Works in Windows PowerShell 5.1 and PowerShell 7,
# so it runs both on this PC and on GitHub's build servers.
#
#   -Out       output folder (default: site, next to atlas/)
#   -BasePath  the URL path the site is served from, e.g. /element-atlas for a GitHub project site;
#              empty for a custom domain or a user site. Only the 404 page needs it: the app itself
#              uses relative paths everywhere.
param([string]$Out = 'site', [string]$BasePath = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'atlas'
$web = Join-Path $root 'web'
$dst = if ([IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $root $Out }
$base = $BasePath.TrimEnd('/')
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
New-Item -ItemType Directory -Path $dst | Out-Null

# 1. the page: head material is everything before the app container, the rest is the body
$page = [IO.File]::ReadAllText((Join-Path $src 'index.html'), $utf8)
$cut = $page.IndexOf('<div class="app">')
if ($cut -lt 0) { throw 'atlas/index.html: <div class="app"> not found, so the page cannot be split into head and body' }
$headPart = $page.Substring(0, $cut) -replace '(?m)^<meta name="claude:[^>]*>\r?\n', ''   # Artifact-host hints only
$bodyPart = $page.Substring($cut).TrimEnd()
$desc = 'Explore all 118 elements and 238 compounds in 3D: atoms, nuclei and quarks, electron orbitals, bonding, live molecule simulations with hydrogen bonds, bond angles, and photos of real samples.'
$html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="$desc">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0d151d">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">
<meta property="og:type" content="website">
<meta property="og:title" content="The Element Atlas">
<meta property="og:description" content="$desc">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<style>/* the same base styles the Artifact host adds, so the site looks identical */
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
$headPart</head>
<body>
$bodyPart
</body>
</html>
"@
[IO.File]::WriteAllText((Join-Path $dst 'index.html'), $html, $utf8)

# 2. scripts, data and photos, as they are
Get-ChildItem $src | Where-Object { $_.Name -ne 'index.html' } | ForEach-Object { Copy-Item $_.FullName $dst -Recurse -Force }

# 3. website-only extras; the 404 page gets the real base path
Get-ChildItem $web -File | ForEach-Object {
  $target = Join-Path $dst $_.Name
  if ($_.Extension -eq '.html') { [IO.File]::WriteAllText($target, ([IO.File]::ReadAllText($_.FullName, $utf8) -replace '\{\{BASE\}\}', $base), $utf8) }
  else { Copy-Item $_.FullName $target -Force }
}
[IO.File]::WriteAllText((Join-Path $dst '.nojekyll'), '', $utf8)   # serve files as they are on GitHub Pages

$m = Get-ChildItem $dst -Recurse -File | Measure-Object Length -Sum
"Built $($m.Count) files ($([Math]::Round($m.Sum / 1MB, 2)) MB) in $dst" + $(if ($base) { " for base path $base" } else { '' })
