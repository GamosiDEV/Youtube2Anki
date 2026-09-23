@echo off
cd /d "%~dp0"
if not exist ".env" (
  echo Arquivo .env nao encontrado. Copie o .env.example para .env e preencha sua chave.
  pause
  exit /b 1
)
python app.py
pause
