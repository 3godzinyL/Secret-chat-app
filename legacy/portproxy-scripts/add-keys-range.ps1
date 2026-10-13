param(
  [int]$From = 10000,
  [int]$To = 10100,
  [int]$Target = 3000
)
Write-Host "[ADMIN] Tworze przekierowania $From-$To -> :$Target"
for ($p=$From; $p -le $To; $p++) {
  & netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=$p connectaddress=127.0.0.1 connectport=$Target | Out-Null
}
Write-Host "Gotowe."
