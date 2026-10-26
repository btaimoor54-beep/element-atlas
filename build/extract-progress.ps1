# Collect the latest successful result per agent label from a fact-check workflow journal.
param([string]$Journal, [string]$Out)
$utf8 = New-Object System.Text.UTF8Encoding($false)
$labels = @{}
$latest = [ordered]@{}
foreach ($l in [IO.File]::ReadAllLines($Journal, [Text.Encoding]::UTF8)) {
  $o = $l | ConvertFrom-Json
  if ($o.type -eq 'started' -and $o.label) { $labels[$o.key] = ($o.label -replace ' \(retry \d+\)$', '') }
  elseif ($o.type -eq 'result' -and $labels.ContainsKey($o.key) -and $null -ne $o.result) { $latest[$labels[$o.key]] = $o.result }
}
$summary = foreach ($k in $latest.Keys) {
  $r = $latest[$k]
  $n = if ($r.corrections) { @($r.corrections).Count } elseif ($r.verdicts) { @($r.verdicts).Count } else { 0 }
  "$k : $n"
}
[IO.File]::WriteAllText($Out, ($latest | ConvertTo-Json -Depth 12), $utf8)
$summary
