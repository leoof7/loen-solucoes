# ============================================================
# Loen Solucoes - Backup do banco
#
# POR QUE EM POWERSHELL
#
# A rede desta maquina faz inspecao de TLS. O Windows confia no
# certificado do proxy, mas o Node e o Go (o CLI do Supabase) usam
# a propria lista de certificados e recusam a conexao.
#
# Resultado: "Transport error" no CLI e "fetch failed" no Node.
# O PowerShell usa a rede do Windows, entao passa.
#
# Como usar:
#   $env:SUPABASE_SECRET_KEY = "sb_secret_..."
#   .\backup.ps1
#
# Gera em backups\ :
#   - um .json por tabela
#   - um .sql com os INSERTs para repor os dados
#   - os logins do Auth (sem eles ninguem entra depois)
#
# A ESTRUTURA das tabelas vive em docs\migracoes\, no git.
# Os dois juntos reconstroem o banco inteiro.
# ============================================================

$ErrorActionPreference = "Stop"

$projeto = "rtisqipntpnvlhetfoeb"
$base    = "https://$projeto.supabase.co"
$tabelas = @("negocios","perfis","clientes","servicos_catalogo",
             "atendimentos","lancamentos","retiradas","convites")

$chave = $env:SUPABASE_SECRET_KEY
if (-not $chave) { $chave = $env:SUPABASE_SERVICE_KEY }   # aceita o nome antigo

# Se a chave nao veio pelo ambiente, tenta o cofre local.
#
# O cofre e um arquivo criptografado pelo proprio Windows, amarrado a
# SUA conta neste computador. Nem outro usuario da maquina consegue ler.
# Assim voce cola a chave UMA vez e nunca mais.
$cofre = Join-Path $PSScriptRoot ".chave-supabase"
if (-not $chave -and (Test-Path $cofre)) {
  try {
    $segura = Import-Clixml $cofre
    $chave = [System.Net.NetworkCredential]::new("", $segura).Password
    Write-Host "Chave lida do cofre local (.chave-supabase)" -ForegroundColor DarkGray
  } catch {
    Write-Host "O cofre existe mas nao pude ler. Rode .\guardar-chave.ps1 de novo." -ForegroundColor Yellow
  }
}

if (-not $chave) {
  Write-Host ""
  Write-Host "Falta a chave secreta." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  1. Abra: https://supabase.com/dashboard/project/$projeto/settings/api-keys"
  Write-Host "  2. Em 'Secret keys', linha 'default', clique no icone de OLHO e copie"
  Write-Host "  3. Rode:"
  Write-Host ""
  Write-Host '     $env:SUPABASE_SECRET_KEY = "sb_secret_cole_aqui"' -ForegroundColor Green
  Write-Host ""
  Write-Host "  4. .\backup.ps1"
  Write-Host ""
  exit 1
}

# Limpa aspas e espacos que costumam vir junto quando se cola a chave.
$chave = $chave.Trim().Trim('"').Trim("'").Trim()

Write-Host ""
Write-Host "Loen Solucoes - Backup do banco" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host ""
Write-Host ("Chave lida: {0}... ({1} caracteres)" -f $chave.Substring(0, [Math]::Min(14, $chave.Length)), $chave.Length) -ForegroundColor Gray

# Le o corpo da resposta de erro. E ali que o Supabase explica o motivo
# real do 401 — sem isso ficamos adivinhando.
function CorpoDoErro($erro) {
  try {
    $s = $erro.Exception.Response.GetResponseStream()
    $s.Position = 0
    return (New-Object System.IO.StreamReader($s)).ReadToEnd()
  } catch { return "" }
}

# Descobre sozinho como esta chave quer ser mandada, em vez de eu supor.
$modos = @(
  @{ nome = "apikey";               cab = @{ "apikey" = $chave } },
  @{ nome = "apikey + Authorization"; cab = @{ "apikey" = $chave; "Authorization" = "Bearer $chave" } },
  @{ nome = "Authorization";        cab = @{ "Authorization" = "Bearer $chave" } }
)

$cab = $null
$teste = "$base/rest/v1/negocios?select=id&limit=1"
foreach ($m in $modos) {
  try {
    Invoke-RestMethod -Uri $teste -Headers $m.cab -Method Get -TimeoutSec 30 | Out-Null
    $cab = $m.cab
    Write-Host ("Autenticacao: funcionou com '{0}'" -f $m.nome) -ForegroundColor Green
    break
  } catch {
    $codigo = $_.Exception.Response.StatusCode.value__
    $motivo = (CorpoDoErro $_).Trim()
    if ($motivo.Length -gt 160) { $motivo = $motivo.Substring(0,160) }
    Write-Host ("  '{0}' -> HTTP {1} {2}" -f $m.nome, $codigo, $motivo) -ForegroundColor DarkGray
  }
}

if (-not $cab) {
  Write-Host ""
  Write-Host "A chave foi recusada nos tres formatos. O motivo esta nas linhas acima." -ForegroundColor Red
  Write-Host ""
  Write-Host "Confira, na tela de API Keys:" -ForegroundColor Yellow
  Write-Host "  - se copiou de 'Secret keys' (nao de 'Publishable key')"
  Write-Host "  - se a chave revelada pelo olho esta inteira, sem cortar"
  Write-Host "  - se a linha 'default' nao esta marcada como desabilitada"
  Write-Host ""
  exit 1
}
Write-Host ""

$carimbo = Get-Date -Format "yyyy-MM-dd_HHmm"
$pasta   = Join-Path $PSScriptRoot "backups"
if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta | Out-Null }

$semBom = New-Object System.Text.UTF8Encoding($false)
function Salvar($caminho, $texto) {
  [System.IO.File]::WriteAllText($caminho, $texto, $semBom)
}

# Transforma um valor em literal SQL seguro.
function ValorSql($v) {
  if ($null -eq $v)            { return "null" }
  if ($v -is [bool])           { if ($v) { return "true" } else { return "false" } }
  if ($v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [decimal]) { return "$v" }
  $t = [string]$v
  return "'" + $t.Replace("'", "''") + "'"
}

$resumo  = [ordered]@{}
$falhou  = $false
$sql     = "-- Loen Solucoes - dados em $(Get-Date -Format 'dd/MM/yyyy HH:mm')`r`n"
$sql    += "-- Rode as migracoes de docs\migracoes\ ANTES deste arquivo.`r`n`r`nbegin;`r`n`r`n"

foreach ($t in $tabelas) {
  try {
    $linhas = @()
    $passo = 1000
    for ($de = 0; ; $de += $passo) {
      $url = "$base/rest/v1/$t" + "?select=*&limit=$passo&offset=$de"
      $parte = @(Invoke-RestMethod -Uri $url -Headers $cab -Method Get -TimeoutSec 60)
      if ($parte.Count -gt 0) { $linhas += $parte }
      if ($parte.Count -lt $passo) { break }
    }

    $resumo[$t] = $linhas.Count
    Salvar (Join-Path $pasta "${carimbo}_$t.json") ($linhas | ConvertTo-Json -Depth 10)

    if ($linhas.Count -gt 0) {
      $colunas = $linhas[0].PSObject.Properties.Name
      $tuplas = foreach ($l in $linhas) {
        "  (" + (($colunas | ForEach-Object { ValorSql $l.$_ }) -join ", ") + ")"
      }
      $sql += "-- $t : $($linhas.Count) linha(s)`r`n"
      $sql += "insert into public.$t (" + ($colunas -join ", ") + ") values`r`n"
      $sql += ($tuplas -join ",`r`n") + "`r`non conflict (id) do nothing;`r`n`r`n"
    } else {
      $sql += "-- $t : vazia`r`n`r`n"
    }

    Write-Host ("  {0,-20} {1,5} linha(s)" -f $t, $linhas.Count) -ForegroundColor Green
  } catch {
    $falhou = $true
    $motivo = (CorpoDoErro $_).Trim()
    if (-not $motivo) { $motivo = $_.Exception.Message }
    if ($motivo.Length -gt 110) { $motivo = $motivo.Substring(0,110) }
    Write-Host ("  {0,-20} FALHOU: {1}" -f $t, $motivo) -ForegroundColor Red
  }
}

# Logins do Auth
try {
  $contas = @()
  for ($p = 1; ; $p++) {
    $r = Invoke-RestMethod -Uri "$base/auth/v1/admin/users?page=$p&per_page=200" `
                           -Headers $cab -Method Get -TimeoutSec 60
    if (-not $r.users -or $r.users.Count -eq 0) { break }
    $contas += $r.users | Select-Object id, email, created_at, last_sign_in_at
    if ($r.users.Count -lt 200) { break }
  }
  $resumo["(logins do Auth)"] = $contas.Count
  Salvar (Join-Path $pasta "${carimbo}_logins.json") ($contas | ConvertTo-Json -Depth 6)
  Write-Host ("  {0,-20} {1,5} conta(s)" -f "(logins do Auth)", $contas.Count) -ForegroundColor Green
} catch {
  $falhou = $true
  Write-Host ("  {0,-20} FALHOU: {1}" -f "(logins do Auth)", $_.Exception.Message) -ForegroundColor Red
}

$sql += "commit;`r`n"
Salvar (Join-Path $pasta "${carimbo}_dados.sql") $sql
Salvar (Join-Path $pasta "${carimbo}_resumo.json") ($resumo | ConvertTo-Json -Depth 4)

Write-Host ""
if ($falhou) {
  Write-Host "ATENCAO: algo falhou acima. Isto NAO e um backup completo." -ForegroundColor Red
  Write-Host ""
  exit 1
}
Write-Host "Tudo salvo em backups\ com o carimbo $carimbo" -ForegroundColor Green
Write-Host "Guarde uma copia fora deste computador." -ForegroundColor Yellow
Write-Host ""
