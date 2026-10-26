# Group the remaining fact-check work into a few files so fewer, larger referee agents can finish it.
#   source-*.json  : corrections the first referee confirmed; they still need the independent source check
#   refute-*.json  : finder proposals that still need the first referee (then the source check)
# Each item: { kind, batch, batchFile, id, field, current, corrected, why/reason/source }
param([int]$PerGroup = 15)
$root = Split-Path -Parent $PSScriptRoot
$check = "$root\build\check"
$utf8 = New-Object System.Text.UTF8Encoding($false)
$p1 = [IO.File]::ReadAllText("$check\progress.json", [Text.Encoding]::UTF8) | ConvertFrom-Json
$p2 = [IO.File]::ReadAllText("$check\progress2.json", [Text.Encoding]::UTF8) | ConvertFrom-Json
$out = "$check\groups"
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out -Filter *.json | Remove-Item -Force

function Batch-File($batch) { "$check\" + ($batch -replace ' ', '-') + '.json' }
function Add-Unique($list, $seen, $item) {
  $k = "$($item.id)|$($item.field)"
  if ($seen.ContainsKey($k)) { return }
  $seen[$k] = 1; [void]$list.Add($item)
}
function Write-Groups($items, $prefix) {
  $n = [Math]::Ceiling($items.Count / $PerGroup); $files = @()
  for ($g = 0; $g -lt $n; $g++) {
    $chunk = @($items | Select-Object -Skip ($g * $PerGroup) -First $PerGroup)
    $f = "$out\$prefix-$($g + 1).json"
    [IO.File]::WriteAllText($f, (ConvertTo-Json -InputObject $chunk -Depth 8), $utf8)
    $files += [pscustomobject]@{ file = $f; count = $chunk.Count }
  }
  return $files
}

# 1. first-pass confirmed (element batches 02-07)
$src = New-Object System.Collections.ArrayList; $seen = @{}
foreach ($n in 2..7) {
  $b = 'elements {0:D2}' -f $n
  foreach ($v in @($p2."refute $b".verdicts | Where-Object { $_.confirmed })) {
    Add-Unique $src $seen ([pscustomobject]@{ kind = 'element'; batch = $b; batchFile = (Batch-File $b); id = $v.id; field = $v.field; current = $v.current; corrected = $v.corrected; why = $v.why })
  }
}
# 2. proposals still needing the first referee
function Proposals($kind, $batches, $lenses) {
  $list = New-Object System.Collections.ArrayList; $seen = @{}
  foreach ($b in $batches) {
    foreach ($L in $lenses) {
      $r = $p2."find $L $b"; if (-not $r) { $r = $p1."find $L $b" }
      foreach ($c in @($r.corrections)) { if ($c) { Add-Unique $list $seen ([pscustomobject]@{ kind = $kind; batch = $b; batchFile = (Batch-File $b); id = $c.id; field = $c.field; current = $c.current; corrected = $c.corrected; reason = $c.reason; source = $c.source }) } }
    }
  }
  return , $list
}
$elB = 8..12 | ForEach-Object { 'elements {0:D2}' -f $_ }
$cmB = 1..24 | ForEach-Object { 'compounds {0:D2}' -f $_ }
$elR = Proposals 'element' $elB @('numbers', 'text')
$cmR = Proposals 'compound' $cmB @('chemistry', 'structure')

$res = [ordered]@{
  source = @(Write-Groups $src 'source-elements')
  refuteElements = @(Write-Groups $elR 'refute-elements')
  refuteCompounds = @(Write-Groups $cmR 'refute-compounds')
}
"source: $($src.Count) items; element proposals: $($elR.Count); compound proposals: $($cmR.Count)"
$res.GetEnumerator() | ForEach-Object { foreach ($g in $_.Value) { "$($_.Key): $([IO.Path]::GetFileName($g.file)) ($($g.count))" } }
