@echo off
setlocal
chcp 65001 >nul
title Nay Fiscal
cd /d "%~dp0"

echo.
echo  ===== Nay Fiscal =====
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js nao encontrado. Instale em https://nodejs.org e rode de novo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  Instalando dependencias, primeira vez: pode levar alguns minutos...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto erro
)

if not exist "apps\api\.env" (
  echo  Criando apps\api\.env a partir do exemplo...
  copy "apps\api\.env.example" "apps\api\.env" >nul
)

rem segredo de sessao proprio (nunca o do exemplo, que e publico)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\garantir-segredo.ps1"

rem cliente Prisma de acordo com o codigo atual (falha sem problema se o sistema ja estiver aberto)
pushd apps\api
call npx prisma generate >nul
popd

if not exist "apps\api\prisma\dev.db" (
  echo  Criando o banco de dados com dados de demonstracao...
  call npm run db:setup
  if errorlevel 1 goto erro
) else (
  rem aplica as migracoes pendentes sem apagar dados, com copia de seguranca antes
  call npm run db:migrate --silent
  if errorlevel 1 (
    echo.
    echo  O banco nao foi atualizado. Veja a mensagem acima: seus dados estao em apps\api\prisma.
    goto erro
  )
)

echo.
echo  Abrindo http://localhost:5173 ...
echo  Login de demonstracao: veja o README (troque as senhas antes de usar o tunel).
echo  Para parar o servidor, feche esta janela ou aperte Ctrl+C.
echo.
if not defined NAY_NO_BROWSER start "" cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:5173"
call npm run dev
goto fim

:erro
echo.
echo  Algo deu errado. Veja a mensagem acima.
pause
exit /b 1

:fim
endlocal
