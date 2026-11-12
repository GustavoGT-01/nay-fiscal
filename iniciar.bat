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

if not exist "apps\api\prisma\dev.db" (
  echo  Criando o banco de dados com dados de demonstracao...
  call npm run db:setup
  if errorlevel 1 goto erro
) else (
  rem atualiza a estrutura do banco sem apagar dados
  pushd apps\api
  call npx prisma db push --skip-generate >nul
  popd
)

echo.
echo  Abrindo http://localhost:5173 ...
echo  Login de demonstracao: admin@nayfiscal.dev / nay12345
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
