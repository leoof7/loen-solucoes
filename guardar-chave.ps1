# ============================================================
# Loen Solucoes - Guardar a chave do Supabase, uma vez so
#
# Salva a chave num cofre criptografado pelo Windows, amarrado a
# SUA conta neste computador. Nem outro usuario da maquina le.
#
# Depois disso, .\backup.ps1 funciona sozinho, sem colar nada.
#
# A chave e digitada escondida: ela NAO aparece na tela e NAO fica
# no historico do PowerShell.
# ============================================================

Write-Host ""
Write-Host "Loen Solucoes - Guardar chave do Supabase" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pegue em: Supabase > Project Settings > API Keys > Secret keys" -ForegroundColor Gray
Write-Host "Linha 'default', clique no olho para revelar e copie." -ForegroundColor Gray
Write-Host ""
Write-Host "Cole abaixo. O texto nao vai aparecer enquanto voce digita." -ForegroundColor Yellow

$segura = Read-Host "Chave" -AsSecureString
$texto  = [System.Net.NetworkCredential]::new("", $segura).Password

if (-not $texto) { Write-Host "`nNada foi digitado. Cancelado." -ForegroundColor Red; exit 1 }

$texto = $texto.Trim().Trim('"').Trim("'").Trim()
if (-not $texto.StartsWith("sb_secret_") -and -not $texto.StartsWith("eyJ")) {
  Write-Host ""
  Write-Host "Isso nao parece uma chave secreta." -ForegroundColor Red
  Write-Host "A certa comeca com 'sb_secret_'. Se comeca com 'sb_publishable_'," -ForegroundColor Yellow
  Write-Host "voce copiou a publica, que nao serve para backup." -ForegroundColor Yellow
  exit 1
}

$cofre = Join-Path $PSScriptRoot ".chave-supabase"
ConvertTo-SecureString $texto -AsPlainText -Force | Export-Clixml $cofre

Write-Host ""
Write-Host "Guardada. ($($texto.Length) caracteres)" -ForegroundColor Green
Write-Host "Agora e so rodar .\backup.ps1 quando quiser, sem colar nada." -ForegroundColor Green
Write-Host ""
Write-Host "O cofre esta em .chave-supabase e ja esta no .gitignore." -ForegroundColor DarkGray
Write-Host ""
