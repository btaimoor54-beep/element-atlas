# Build atlas/data/compounds.json: hand-written compound data + PubChem CIDs + PubChem 3D conformers.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$cache = "$root\build\raw\pubchem"
New-Item -ItemType Directory -Force $cache | Out-Null
$ua = 'ElementAtlasBuilder/1.0 (educational)'
$inv = [Globalization.CultureInfo]::InvariantCulture

function Fetch($url, $file) {
  $path = Join-Path $cache $file
  if (Test-Path $path) { $t = [IO.File]::ReadAllText($path); if ($t -eq '404') { return $null }; return $t }
  for ($k = 0; $k -lt 5; $k++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -UserAgent $ua -Uri $url -TimeoutSec 30
      # SDF responses come back as byte[] (non-text content type); decode them
      $text = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
      [IO.File]::WriteAllText($path, $text, $utf8)
      Start-Sleep -Milliseconds 220   # PubChem asks for at most 5 requests per second
      return $text
    } catch {
      $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($code -eq 404 -or $code -eq 400) { [IO.File]::WriteAllText($path, '404', $utf8); return $null }
      Start-Sleep -Seconds (2 + 3 * $k)
    }
  }
  return $null
}

function ParseSdf($sdf) {
  $lines = $sdf -split "`r?`n"
  $na = [int]$lines[3].Substring(0, 3); $nb = [int]$lines[3].Substring(3, 3)
  $atoms = @(); $bonds = @(); $charges = @{}
  for ($i = 0; $i -lt $na; $i++) {
    $l = $lines[4 + $i]
    $atoms += , @($l.Substring(31, 3).Trim(), [double]::Parse($l.Substring(0, 10), $inv), [double]::Parse($l.Substring(10, 10), $inv), [double]::Parse($l.Substring(20, 10), $inv))
  }
  for ($i = 0; $i -lt $nb; $i++) {
    $l = $lines[4 + $na + $i]
    $ba = [int]$l.Substring(0, 3) - 1; $bb = [int]$l.Substring(3, 3) - 1; $bo = [int]$l.Substring(6, 3)
    $bonds += , @($ba, $bb, $bo)
  }
  foreach ($l in $lines) {
    if ($l -match '^M  CHG') {
      $p = ($l.Substring(6).Trim() -split '\s+') | ForEach-Object { [int]$_ }
      for ($j = 1; $j -lt $p.Count; $j += 2) { $charges[$p[$j] - 1] = $p[$j + 1] }
    }
  }
  return @{ atoms = $atoms; bonds = $bonds; charges = $charges }
}

function ToStructure($m, $scale, $source) {
  $n = $m.atoms.Count
  $cx = ($m.atoms | ForEach-Object { $_[1] } | Measure-Object -Average).Average
  $cy = ($m.atoms | ForEach-Object { $_[2] } | Measure-Object -Average).Average
  $cz = ($m.atoms | ForEach-Object { $_[3] } | Measure-Object -Average).Average
  $atoms = @(); for ($i = 0; $i -lt $n; $i++) { $a = $m.atoms[$i]; $atoms += , @($a[0], [math]::Round(($a[1] - $cx) * $scale, 4), [math]::Round(($a[2] - $cy) * $scale, 4), [math]::Round(($a[3] - $cz) * $scale, 4)) }
  $s = [ordered]@{ mode = 'xyz'; atoms = $atoms; bonds = $m.bonds; source = $source }
  if ($m.charges.Count) { $ch = @(); for ($i = 0; $i -lt $n; $i++) { if ($m.charges.ContainsKey($i)) { $ch += $m.charges[$i] } else { $ch += 0 } }; $s.charges = $ch }
  return $s
}

$all = New-Object System.Collections.ArrayList
$report = New-Object System.Collections.ArrayList
Get-ChildItem "$root\build\cmp\c*.json" | Sort-Object Name | ForEach-Object {
  ([IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json) | ForEach-Object { [void]$all.Add($_) }
}
$seen = @{}
$out = New-Object System.Collections.ArrayList
foreach ($c in $all) {
  if ($seen.ContainsKey($c.id)) { [void]$report.Add("DUPLICATE id $($c.id)"); continue }
  $seen[$c.id] = $true
  $cid = $null
  if ($c.pc) {
    $name = [string]$c.pc
    $txt = Fetch ("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/" + [uri]::EscapeDataString($name) + "/cids/TXT") ("cid_" + ($name -replace '[^A-Za-z0-9]', '_') + ".txt")
    if ($txt) { $first = ($txt -split "`r?`n" | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1); if ($first) { $cid = [int]$first } }
    if (-not $cid) { [void]$report.Add("no CID: $($c.id) ($name)") }
  }
  $structure = $c.structure
  if (($c.use3d -or -not $c.structure) -and $cid) {
    $sdf = Fetch "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/$cid/SDF?record_type=3d" "sdf3d_$cid.sdf"
    if ($sdf -and $sdf -match 'V2000') {
      $structure = ToStructure (ParseSdf $sdf) 1.0 "PubChem 3D conformer (CID $cid)"
    } elseif ($c.pc2d) {
      $sdf2 = Fetch "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/$cid/SDF" "sdf2d_$cid.sdf"
      if ($sdf2 -and $sdf2 -match 'V2000') {
        $m = ParseSdf $sdf2
        $len = @(); foreach ($b in $m.bonds) { $p = $m.atoms[$b[0]]; $q = $m.atoms[$b[1]]; $len += [math]::Sqrt([math]::Pow($p[1] - $q[1], 2) + [math]::Pow($p[2] - $q[2], 2)) }
        $avg = ($len | Measure-Object -Average).Average
        $structure = ToStructure $m (1.40 / $avg) "Flat 2D layout from PubChem (CID $cid); no 3D model exists for this molecule"
      } else { [void]$report.Add("no 2D SDF: $($c.id)") }
    } else { [void]$report.Add("no 3D SDF: $($c.id) (CID $cid)") }
  }
  if (-not $structure) { [void]$report.Add("NO STRUCTURE: $($c.id)") }
  $o = [ordered]@{
    id = $c.id; name = $c.name; formula = $c.formula; aka = @($c.aka); category = $c.category; elements = @($c.elements)
    pubchemCid = $cid; structure = $structure; bonding = $c.bonding; formation = $c.formation; state = $c.state
    meltingPointC = $c.mp; boilingPointC = $c.bp; occurrence = $c.occurrence; uses = @($c.uses); facts = @($c.facts); hazards = $c.hazards; summary = $c.summary
  }
  [void]$out.Add([pscustomobject]$o)
}
$json = $out | ConvertTo-Json -Depth 12 -Compress
[IO.File]::WriteAllText("$root\atlas\data\compounds.json", $json, $utf8)
"compounds: $($out.Count)  bytes: $($json.Length)"
$report
& "$PSScriptRoot\apply-corrections.ps1" -Kind compound   # re-apply fact-check fixes
