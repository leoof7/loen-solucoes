# ============================================================
# Loen Solucoes - Ligar o backup automatico (rodar UMA vez)
#
# Cria no Agendador de Tarefas do Windows a tarefa
# "Loen Solucoes - Backup diario", que roda o backup todo dia as 9h.
# Se o computador estiver desligado nesse horario, roda assim que
# ele for ligado.
#
# ATENCAO: a tarefa guarda o caminho DESTA pasta. Se a pasta mudar
# de nome ou de lugar, rode este arquivo de novo que ele atualiza.
#
# Antes, rode .\guardar-chave.ps1 (uma vez) para o backup ter a chave.
# ============================================================

$nome   = "Loen Solucoes - Backup diario"
$script = Join-Path $PSScriptRoot "backup-agendado.ps1"

if (-not (Test-Path (Join-Path $PSScriptRoot ".chave-supabase"))) {
  Write-Host ""
  Write-Host "Falta guardar a chave. Rode primeiro: .\guardar-chave.ps1" -ForegroundColor Yellow
  Write-Host ""
  exit 1
}

$acao = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" `
  -WorkingDirectory $PSScriptRoot
$quando = New-ScheduledTaskTrigger -Daily -At 9am
$regras = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

# Roda com a conta de quem executou este arquivo, sem pedir senha:
# o cofre da chave so abre para essa conta.
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $quando -Settings $regras `
  -Description "Copia todas as tabelas do Loen Solucoes para backups\ e para o OneDrive." -Force | Out-Null

Write-Host ""
Write-Host "Pronto. A tarefa '$nome' roda todo dia as 9h." -ForegroundColor Green
Write-Host "Rodando agora uma vez, para conferir..." -ForegroundColor Gray
Start-ScheduledTask -TaskName $nome
Start-Sleep -Seconds 20
$info = Get-ScheduledTaskInfo -TaskName $nome
if ($info.LastTaskResult -eq 0) {
  Write-Host "Primeiro backup feito. Detalhes em backups\ultimo-backup.log" -ForegroundColor Green
} else {
  Write-Host "Ainda rodando ou falhou (codigo $($info.LastTaskResult)). Veja backups\ultimo-backup.log" -ForegroundColor Yellow
}
Write-Host ""
