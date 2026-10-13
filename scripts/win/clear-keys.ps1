Write-Host "[ADMIN] Czyszcze wszystkie portproxy 127.0.0.1:*"
$rules = netsh interface portproxy show v4tov4
$lines = $rules -split "`n" | Where-Object { $_ -match "127\.0\.0\.1\s+\d+" }
foreach ($ln in $lines) {
  $parts = $ln -split "\s+" | Where-Object { $_ -ne "" }
  $port = $parts[1]
  & netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=$port | Out-Null
}
Write-Host "Gotowe."
