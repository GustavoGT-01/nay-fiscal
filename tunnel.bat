@echo off
setlocal
chcp 65001 >nul
title Nay Fiscal - Tunel Cloudflare
cd /d "%~dp0"

rem Porta propria do modo tunel: a API serve o front ja compilado (sem o servidor do Vite na internet)
set "TUNNEL_PORT=3334"

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

rem --- 2. o sistema precisa ter sido instalado pelo iniciar.bat ---
if not exist "node_modules" goto precisa_iniciar
if not exist "apps\api\prisma\dev.db" goto precisa_iniciar

rem --- 3. segredo de sessao proprio, nunca o do exemplo ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\garantir-segredo.ps1"

rem --- 4. nada de senha de demonstracao na internet ---
call npm run checar-senhas -w @nay/api --silent
if errorlevel 1 (
  echo.
  echo  O tunel NAO foi aberto: troque as senhas acima antes de expor o sistema.
  pause
  exit /b 1
)

rem --- 5. compilar o front e subir a API servindo o front na porta do tunel ---
powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort %TUNNEL_PORT% -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if errorlevel 1 (
  echo  Compilando o front...
  call npm run build -w @nay/web --silent
  if errorlevel 1 goto erro
  echo  Subindo o sistema em outra janela...
  start "Nay Fiscal (tunel)" cmd /c "set API_PORT=%TUNNEL_PORT%&& npm run start:web -w @nay/api"
  powershell -NoProfile -Command "$t=0; while(-not (Get-NetTCPConnection -LocalPort %TUNNEL_PORT% -State Listen -ErrorAction SilentlyContinue) -and $t -lt 180){ Start-Sleep 1; $t++ }; if($t -ge 180){exit 1}"
  if errorlevel 1 (
    echo  O sistema nao subiu. Veja a janela "Nay Fiscal (tunel)".
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
echo   - O endereco muda a cada vez que o tunel e aberto.
echo   - Para fechar o tunel, feche esta janela ou aperte Ctrl+C
echo     e feche tambem a janela "Nay Fiscal (tunel)".
echo  ------------------------------------------------------------------
echo.

"%CF%" tunnel --no-autoupdate --url http://localhost:%TUNNEL_PORT%
goto fim

:precisa_iniciar
echo  Rode iniciar.bat uma vez antes (instala as dependencias e cria o banco).
pause
exit /b 1

:erro
echo.
echo  Algo deu errado. Veja a mensagem acima.
pause
exit /b 1

:fim
endlocal
