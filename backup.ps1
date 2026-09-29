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
# TODAS as tabelas, na ordem em que precisam voltar (quem aponta para
# outra tabela vem depois dela). Se aparecer tabela nova no banco e ela
# nao estiver aqui, o backup acusa e sai com erro — ver mais abaixo.
$tabelas = @("negocios","perfis","convites","clientes","servicos_catalogo",
             "historico_precos","atendimentos","orcamentos","orcamento_itens",
             "lancamentos","retiradas","checklists","checklist_itens",
             "atendimento_checklist","eventos","recuperacoes")

# Copia extra fora deste computador: a pasta do OneDrive sobe sozinha
# para a nuvem da conta Microsoft do Leandro.
$pastaNuvem = Join-Path $env:USERPROFILE "OneDrive\Backups\Loen Solucoes"

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

# Confere se o banco tem alguma tabela que a lista acima esqueceu.
# Foi assim que os orcamentos ficaram fora do backup ate 29/09/2026:
# a tabela nasceu depois do script e ninguem percebeu.
$esquecidas = @()
try {
  $mapa = Invoke-RestMethod -Uri "$base/rest/v1/" -Headers $cab -Method Get -TimeoutSec 60
  $noBanco = $mapa.paths.PSObject.Properties.Name |
    Where-Object { $_ -match '^/[a-z_]+$' } | ForEach-Object { $_.TrimStart('/') }
  $esquecidas = @($noBanco | Where-Object { $tabelas -notcontains $_ })
} catch {
  Write-Host "Nao consegui listar as tabelas do banco para conferir." -ForegroundColor Yellow
}
function FormatoDe($tabela, $coluna) {
  try { return $mapa.definitions.$tabela.properties.$coluna.format } catch { return $null }
}
if ($esquecidas.Count -gt 0) {
  Write-Host ("Tabela(s) no banco que o backup nao conhece: {0}" -f ($esquecidas -join ", ")) -ForegroundColor Red
  Write-Host "Elas vao junto desta vez, mas acrescente na lista `$tabelas." -ForegroundColor Yellow
  $tabelas += $esquecidas
}

$carimbo = Get-Date -Format "yyyy-MM-dd_HHmm"
$pasta   = Join-Path $PSScriptRoot "backups"
if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta | Out-Null }

$semBom = New-Object System.Text.UTF8Encoding($false)
function Salvar($caminho, $texto) {
  [System.IO.File]::WriteAllText($caminho, $texto, $semBom)
}

function Texto($t) { return "'" + ([string]$t).Replace("'", "''") + "'" }

# Transforma um valor em literal SQL seguro. $formato e o tipo da coluna
# no banco (ex.: "text[]", "jsonb"), lido do mapa da API.
function ValorSql($v, $formato) {
  if ($null -eq $v)            { return "null" }
  # Sem o mapa, adivinha pelo formato do valor.
  if (-not $formato) {
    if ($v -is [System.Management.Automation.PSCustomObject]) { $formato = "jsonb" }
    elseif ($v -is [array]) { $formato = "text[]" }
  }
  if ($formato -like "*[[]]") {
    # Lista do Postgres: {"a","b"}
    $itens = @($v) | ForEach-Object { '"' + ([string]$_).Replace('\', '\\').Replace('"', '\"') + '"' }
    return Texto ("{" + ($itens -join ",") + "}")
  }
  if ($formato -like "json*")  { return (Texto (ConvertTo-Json -InputObject $v -Compress -Depth 20)) + "::jsonb" }
  if ($v -is [bool])           { if ($v) { return "true" } else { return "false" } }
  if ($v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [decimal]) {
    return $v.ToString([System.Globalization.CultureInfo]::InvariantCulture)
  }
  return Texto $v
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
        "  (" + (($colunas | ForEach-Object { ValorSql $l.$_ (FormatoDe $t $_) }) -join ", ") + ")"
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

# Copia para o OneDrive (se ele existir nesta maquina).
if (Test-Path (Split-Path (Split-Path $pastaNuvem))) {
  try {
    if (-not (Test-Path $pastaNuvem)) { New-Item -ItemType Directory -Path $pastaNuvem -Force | Out-Null }
    Copy-Item (Join-Path $pasta "${carimbo}_*") $pastaNuvem -Force
    Write-Host "Copia enviada para o OneDrive: $pastaNuvem" -ForegroundColor Green
  } catch {
    $falhou = $true
    Write-Host "Nao consegui copiar para o OneDrive: $($_.Exception.Message)" -ForegroundColor Red
  }
} else {
  Write-Host "OneDrive nao encontrado. A copia ficou so neste computador." -ForegroundColor Yellow
}

# Guarda 30 dias de copias e apaga as mais velhas — so quando este
# backup deu certo, para nunca ficar sem nenhuma. E o que a Politica de
# Privacidade promete: conta apagada some dos backups em ate 30 dias.
# So toca nos arquivos com o carimbo do backup (2026-09-29_0900_...).
if (-not $falhou) {
  $limite = (Get-Date).AddDays(-30)
  foreach ($p in @($pasta, $pastaNuvem)) {
    if (Test-Path $p) {
      Get-ChildItem $p -File |
        Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{4}_' -and $_.LastWriteTime -lt $limite } |
        Remove-Item -Force
    }
  }
}

Write-Host ""
if ($falhou -or $esquecidas.Count -gt 0) {
  Write-Host "ATENCAO: algo falhou ou faltou acima. Confira antes de confiar neste backup." -ForegroundColor Red
  Write-Host ""
  exit 1
}
Write-Host "Tudo salvo em backups\ com o carimbo $carimbo" -ForegroundColor Green
Write-Host ""
