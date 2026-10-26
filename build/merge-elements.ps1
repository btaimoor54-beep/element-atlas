# Merge PubChem base data + hand-checked overrides + written content into atlas/data/elements.json
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
function ReadJson($p) { return ([IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) | ConvertFrom-Json) }

$base = @{}
(ReadJson "$root\build\base-elements.json") | ForEach-Object { $base[[int]$_.AtomicNumber] = $_ }
$enrich = @{}
Get-ChildItem "$root\build\enrich\e*.json" | Sort-Object Name | ForEach-Object { (ReadJson $_.FullName) | ForEach-Object { $enrich[[int]$_.z] = $_ } }

# Cordero et al. 2008 single-bond covalent radii, pm (Z = 1..96)
$cov = @(31,28,128,96,84,76,71,66,57,58,166,141,121,111,107,105,102,106,203,176,170,160,153,139,139,132,126,124,132,122,122,120,119,120,120,116,220,195,190,175,164,154,147,146,142,139,145,144,142,139,139,138,139,140,244,215,207,204,203,201,199,198,198,196,194,192,192,189,190,187,187,175,170,162,151,144,141,136,136,132,145,146,148,140,150,150,260,221,215,206,200,196,190,187,180,169)

$catMap = @{ 'nonmetal'='nonmetal'; 'halogen'='halogen'; 'noble gas'='noble gas'; 'alkali metal'='alkali metal'; 'alkaline earth metal'='alkaline earth metal';
  'transition metal'='transition metal'; 'post-transition metal'='post-transition metal'; 'metalloid'='metalloid'; 'lanthanide'='lanthanide'; 'actinide'='actinide' }
$names = @{ 13 = @('Aluminium','Aluminum'); 55 = @('Caesium','Cesium'); 16 = @('Sulfur','Sulphur') }

function Num($v) { if ($null -eq $v) { return $null }; $s = [string]$v; if ($s.Trim() -eq '') { return $null }; $d = 0.0; if ([double]::TryParse($s, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $d }; return $null }
function Period($z) { if ($z -le 2) {1} elseif ($z -le 10) {2} elseif ($z -le 18) {3} elseif ($z -le 36) {4} elseif ($z -le 54) {5} elseif ($z -le 86) {6} else {7} }
function Get-GroupNum($z) {
  if ($z -eq 1) { return 1 }; if ($z -eq 2) { return 18 }
  $p = Period $z
  if ($p -eq 2 -or $p -eq 3) { $first = if ($p -eq 2) {3} else {11}; $i = $z - $first; if ($i -lt 2) { return $i + 1 } else { return $i + 11 } }
  if ($p -eq 4) { return $z - 18 }; if ($p -eq 5) { return $z - 36 }
  $b = if ($p -eq 6) {55} else {87}
  if ($z -lt $b + 2) { return $z - $b + 1 }
  if ($z -le $b + 16) { return $null }
  return $z - $b - 13
}
function Block($z, $g) {
  if ($z -eq 2) { return 's' }
  if (($z -ge 57 -and $z -le 70) -or ($z -ge 89 -and $z -le 102)) { return 'f' }
  if ($z -eq 71 -or $z -eq 103) { return 'd' }
  if ($g -le 2) { return 's' }; if ($g -ge 13) { return 'p' }; return 'd'
}
$L = @{ s=0; p=1; d=2; f=3 }
function NormConfig($s) {
  $t = ($s -replace '\(.*?\)', '').Trim()
  $core = ''; if ($t -match '^\[(\w+)\]') { $core = "[$($Matches[1])]"; $t = $t.Substring($Matches[0].Length) }
  $tok = [regex]::Matches($t, '(\d)([spdf])(\d{1,2})') | ForEach-Object { [pscustomobject]@{ n=[int]$_.Groups[1].Value; l=$L[$_.Groups[2].Value]; s=$_.Value } }
  $sorted = $tok | Sort-Object n, l | ForEach-Object { $_.s }
  return (($core + ' ' + ($sorted -join ' ')).Trim())
}

$out = New-Object System.Collections.ArrayList
for ($z = 1; $z -le 118; $z++) {
  $b = $base[$z]; $e = $enrich[$z]
  if (-not $e) { throw "missing enrichment for Z=$z" }
  $n = @{}; if ($e.n) { $e.n.PSObject.Properties | ForEach-Object { $n[$_.Name] = $_.Value } }
  function Pick($key, $fallback) { if ($n.ContainsKey($key)) { return $n[$key] } else { return $fallback } }
  $g = Get-GroupNum $z
  $cat = $catMap[([string]$b.GroupBlock).ToLower()]
  if ($z -eq 84) { $cat = 'post-transition metal' }
  $stateRaw = ([string]$b.StandardState).ToLower()
  $state = if ($stateRaw -match 'gas') {'gas'} elseif ($stateRaw -match 'liquid') {'liquid'} elseif ($stateRaw -match 'solid') {'solid'} else {'unknown'}
  $statePred = $stateRaw -match 'expected'
  $cfgRaw = [string](Pick 'electronConfiguration' $b.ElectronConfiguration)
  $color = Pick 'color' $null
  if (-not $color) { $hex = ([string]$b.CPKHexColor).Trim(); if ($hex.Length -eq 4) { $hex = '00' + $hex }; if ($hex -match '^[0-9A-Fa-f]{6}$') { $color = '#' + $hex.ToUpper() } else { $color = '#E6004C' } }
  if ($z -eq 46) { $color = '#006985' }
  $o = [ordered]@{
    z = $z; symbol = $b.Symbol; name = $(if ($names.ContainsKey($z)) { $names[$z][0] } else { $b.Name }); altName = $(if ($names.ContainsKey($z)) { $names[$z][1] } else { $null })
    atomicMass = [string](Pick 'atomicMass' $b.AtomicMass)
    category = $cat; categoryPredicted = ($z -ge 109)
    group = $g; period = (Period $z); block = (Block $z $g)
    electronConfiguration = (NormConfig $cfgRaw); configPredicted = (($cfgRaw -match 'predicted|calculated') -or $z -ge 104)
    electronegativity = (Num (Pick 'electronegativity' $b.Electronegativity))
    ionizationEnergy = (Num (Pick 'ionizationEnergy' $b.IonizationEnergy))
    electronAffinity = (Num (Pick 'electronAffinity' $b.ElectronAffinity))
    covalentRadius = $(if ($z -le 96) { $cov[$z - 1] } else { $null })
    vdwRadius = (Num (Pick 'vdwRadius' $b.AtomicRadius))
    meltingPoint = (Num (Pick 'meltingPoint' $b.MeltingPoint))
    boilingPoint = (Num (Pick 'boilingPoint' $b.BoilingPoint))
    density = (Num (Pick 'density' $b.Density))
    state = [string](Pick 'state' $state); statePredicted = [bool](Pick 'statePredicted' $statePred)
    oxidationStates = @($e.ox | ForEach-Object { [int]$_ }); otherOxidationStates = @($e.ox2 | ForEach-Object { [int]$_ })
    discovery = $e.discovery; nameOrigin = $e.nameOrigin; isotopes = $e.isotopes
    elementalForm = $e.elementalForm; bulk = $e.bulk
    origin = @($e.origin); originNote = $e.originNote; crustAbundancePpm = (Num $e.crust)
    appearance = $e.appearance; summary = $e.summary; uses = @($e.uses); facts = @($e.facts); biology = $e.biology; hazards = $e.hazards
    color = $color
  }
  [void]$out.Add([pscustomobject]$o)
}
$json = $out | ConvertTo-Json -Depth 10 -Compress
New-Item -ItemType Directory -Force "$root\atlas\data" | Out-Null
[IO.File]::WriteAllText("$root\atlas\data\elements.json", $json, $utf8)
# Rewrite photos.json without a byte-order mark
$ph = [IO.File]::ReadAllText("$root\atlas\data\photos.json", [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
$ph = $ph -replace 'Jurii \(Original uploader was Lanthanum-138 at en\.wikipedia', 'Jurii' -replace '"credit":\s*"Unspecified"', '"credit": "US Department of Energy (Y-12 National Security Complex)"' -replace 'Alchemist-hp = Alchemist-hp', 'Alchemist-hp' -replace '\(pse-mendelejew\.de\)\.', '(pse-mendelejew.de)'
[IO.File]::WriteAllText("$root\atlas\data\photos.json", $ph, $utf8)
"elements: $($out.Count)  bytes: $($json.Length)"
& "$PSScriptRoot\apply-corrections.ps1" -Kind element   # re-apply fact-check fixes
