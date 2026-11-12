# Garante que apps/api/.env tenha um JWT_SECRET proprio (nunca o do exemplo).
# Saida 3 = o segredo foi criado/trocado agora; 0 = ja estava bom.
$f = Join-Path $PSScriptRoot '..\apps\api\.env'
if (-not (Test-Path $f)) { Copy-Item (Join-Path $PSScriptRoot '..\apps\api\.env.example') $f }
$fraco = @('', 'troque-este-segredo', 'dev-secret-nay-fiscal', 'secret', 'changeme')
# gerador criptografico (Get-Random nao serve para segredo): 48 bytes = 96 caracteres hex
$novo = {
  $b = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  'JWT_SECRET="' + (-join ($b | ForEach-Object { $_.ToString('x2') })) + '"'
}
$linhas = [IO.File]::ReadAllLines($f)
$achou = $false
$trocou = $false
$linhas = foreach ($l in $linhas) {
  if ($l -match '^JWT_SECRET=') {
    $achou = $true
    $valor = ($l -replace '^JWT_SECRET=', '').Trim().Trim('"')
    # curto demais tambem e fraco: a API so aceita 32+ caracteres
    if (($fraco -contains $valor) -or ($valor.Length -lt 32)) { $trocou = $true; & $novo } else { $l }
  } else { $l }
}
if (-not $achou) { $trocou = $true; $linhas = @($linhas) + (& $novo) }
if ($trocou) {
  [IO.File]::WriteAllLines($f, $linhas, (New-Object Text.UTF8Encoding $false))
  Write-Host ' Segredo de sessao novo gravado em apps\api\.env.'
  exit 3
}
exit 0
