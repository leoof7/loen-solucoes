# ============================================================
# Loen Solucoes - O que o Agendador do Windows roda todo dia
#
# Chama o backup.ps1, guarda tudo o que ele escreveu em
# backups\ultimo-backup.log e, se der errado, deixa um aviso
# BEM visivel na Area de Trabalho. Backup que falha em silencio
# e pior que nenhum: a gente acha que esta protegido.
# ============================================================

$log   = Join-Path $PSScriptRoot "backups\ultimo-backup.log"
$aviso = Join-Path ([Environment]::GetFolderPath("Desktop")) "BACKUP LOEN FALHOU - leia.txt"

New-Item -ItemType Directory -Path (Split-Path $log) -Force | Out-Null

try {
  & (Join-Path $PSScriptRoot "backup.ps1") *> $log
  $codigo = $LASTEXITCODE
} catch {
  "ERRO: $($_.Exception.Message)" | Add-Content -Path $log
  $codigo = 1
}

if ($codigo -ne 0) {
  @"
O backup automatico do Loen Solucoes falhou em $(Get-Date -Format 'dd/MM/yyyy HH:mm').

O motivo esta no arquivo:
$log

Abra o Claude Code na pasta do projeto e peca para ele ler esse arquivo.
Apague este aviso depois que o backup voltar a funcionar.
"@ | Set-Content -Path $aviso -Encoding UTF8
} elseif (Test-Path $aviso) {
  Remove-Item $aviso
}
exit $codigo
