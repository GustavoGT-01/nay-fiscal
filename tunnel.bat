@echo off
setlocal
chcp 65001 >nul
title Nay Fiscal - Tunel Cloudflare
cd /d "%~dp0"

echo.
echo  ===== Nay Fiscal - Tunel Cloudflare =====
echo.

rem --- 1. localizar o cloudflared ---
set "CF="
for /f "delims=" %%i in ('where cloudflared 2^>nul') do if not defined CF set "CF=%%i"
if not defined CF if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CF if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CF (
  echo  cloudflared nao encontrado.
  echo  Instale pelo site oficial: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  echo  ou com: winget install --id Cloudflare.cloudflared
  pause
  exit /b 1
)

rem --- 2. segredo de sessao proprio, nunca o do exemplo ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\garantir-segredo.ps1"
set "ROTATED=%errorlevel%"

rem --- 3. garantir que o sistema esta rodando ---
powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if errorlevel 1 (
  echo  Subindo o sistema em outra janela...
  start "Nay Fiscal" cmd /c "set NAY_NO_BROWSER=1&& call "%~dp0iniciar.bat""
  powershell -NoProfile -Command "$t=0; while(-not (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) -and $t -lt 180){ Start-Sleep 1; $t++ }; if($t -ge 180){exit 1}"
  if errorlevel 1 (
    echo  O sistema nao subiu. Veja a janela "Nay Fiscal".
    pause
    exit /b 1
  )
) else (
  if "%ROTATED%"=="3" (
    echo  ATENCAO: o segredo de sessao acabou de ser trocado.
    echo  Feche a janela do sistema e rode iniciar.bat de novo antes de usar o tunel.
    pause
    exit /b 1
  )
)

echo.
echo  ------------------------------------------------------------------
echo   O sistema vai ficar acessivel pela internet no endereco
echo   https://....trycloudflare.com que aparece abaixo.
echo.
echo   - Quem tiver o endereco ve a tela de login.
echo   - Troque as senhas de demonstracao antes de passar o link adiante.
echo   - O endereco muda a cada vez que o tunel e aberto.
echo   - Para fechar o tunel, feche esta janela ou aperte Ctrl+C.
echo  ------------------------------------------------------------------
echo.

"%CF%" tunnel --no-autoupdate --url http://localhost:5173
endlocal
