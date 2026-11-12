# Garante que apps/api/.env tenha um JWT_SECRET proprio (nunca o do exemplo).
# Saida 3 = o segredo foi criado/trocado agora; 0 = ja estava bom.
$f = Join-Path $PSScriptRoot '..\apps\api\.env'
if (-not (Test-Path $f)) { Copy-Item (Join-Path $PSScriptRoot '..\apps\api\.env.example') $f }
$fraco = @('', 'troque-este-segredo', 'dev-secret-nay-fiscal')
$novo = { 'JWT_SECRET="' + (-join (1..48 | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })) + '"' }
$linhas = [IO.File]::ReadAllLines($f)
$achou = $false
$trocou = $false
$linhas = foreach ($l in $linhas) {
  if ($l -match '^JWT_SECRET=') {
    $achou = $true
    $valor = ($l -replace '^JWT_SECRET=', '').Trim().Trim('"')
    if ($fraco -contains $valor) { $trocou = $true; & $novo } else { $l }
  } else { $l }
}
if (-not $achou) { $trocou = $true; $linhas = @($linhas) + (& $novo) }
if ($trocou) {
  [IO.File]::WriteAllLines($f, $linhas, (New-Object Text.UTF8Encoding $false))
  Write-Host ' Segredo de sessao novo gravado em apps\api\.env.'
  exit 3
}
exit 0
