# Apply fact-check corrections (build/corrections.json) to atlas/data/elements.json and compounds.json.
# Each correction: { kind: 'element'|'compound', id, field: 'a.b[0].c', corrected: '<JSON text>' }
param([string]$Kind = 'all')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$corrPath = "$root\build\corrections.json"
if (-not (Test-Path $corrPath)) { 'no corrections file'; return }
$corrections = @(); ([IO.File]::ReadAllText($corrPath, [Text.Encoding]::UTF8) | ConvertFrom-Json) | ForEach-Object { $corrections += $_ }

function Parse-Path($field) {
  $segs = @()
  foreach ($part in ($field -split '\.')) {
    if ($part -match '^([^\[]+)((\[\d+\])*)$') {
      $segs += [pscustomobject]@{ name = $Matches[1]; idx = $null }
      foreach ($m in [regex]::Matches($Matches[2], '\[(\d+)\]')) { $segs += [pscustomobject]@{ name = $null; idx = [int]$m.Groups[1].Value } }
    } else { throw "bad path segment '$part' in '$field'" }
  }
  return $segs
}
# the leading comma stops PowerShell from unrolling an array into a copy, so edits land in the real data
function Get-Child($obj, $seg) { if ($null -ne $seg.idx) { return , $obj[$seg.idx] } else { return , $obj.($seg.name) } }
function Set-Field($obj, $field, $value) {
  $segs = @(Parse-Path $field)
  $cur = $obj
  for ($i = 0; $i -lt $segs.Count - 1; $i++) {
    $next = Get-Child $cur $segs[$i]
    if ($null -eq $next) {
      if ($null -ne $segs[$i].name) { $next = [pscustomobject]@{}; $cur | Add-Member -NotePropertyName $segs[$i].name -NotePropertyValue $next -Force }
      else { throw "missing array element in '$field'" }
    }
    $cur = $next
  }
  $last = $segs[-1]
  if ($null -ne $last.idx) { $cur[$last.idx] = $value }
  elseif ($cur.PSObject.Properties[$last.name]) { $cur.($last.name) = $value }
  else { $cur | Add-Member -NotePropertyName $last.name -NotePropertyValue $value -Force }
}
function Parse-Value($text) {
  $t = [string]$text
  # the leading comma keeps a one-item list a list; plain text that is not JSON is used as a string
  try { return , ('{"v":' + $t + '}' | ConvertFrom-Json).v } catch { return $t }
}

$log = New-Object System.Collections.ArrayList
foreach ($k in @('element', 'compound')) {
  if ($Kind -ne 'all' -and $Kind -ne $k) { continue }
  $file = if ($k -eq 'element') { "$root\atlas\data\elements.json" } else { "$root\atlas\data\compounds.json" }
  $data = @(); ([IO.File]::ReadAllText($file, [Text.Encoding]::UTF8) | ConvertFrom-Json) | ForEach-Object { $data += $_ }
  $applied = 0
  foreach ($c in ($corrections | Where-Object { $_.kind -eq $k })) {
    $id = [string]$c.id
    $entry = if ($k -eq 'element') { $data | Where-Object { $_.symbol -ceq $id -or [string]$_.z -eq $id -or $_.name -eq $id } | Select-Object -First 1 } else { $data | Where-Object { $_.id -eq $id } | Select-Object -First 1 }
    if (-not $entry) { [void]$log.Add("NOT FOUND $k $id $($c.field)"); continue }
    try { Set-Field $entry $c.field (Parse-Value $c.corrected); $applied++ } catch { [void]$log.Add("FAILED $k $id $($c.field): $($_.Exception.Message)") }
  }
  [IO.File]::WriteAllText($file, ($data | ConvertTo-Json -Depth 14 -Compress), $utf8)
  [void]$log.Add("$k corrections applied: $applied")
}
$log
