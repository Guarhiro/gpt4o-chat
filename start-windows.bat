@echo off
setlocal

cd /d "%~dp0"

set "PORT=8080"

where py >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=py -3"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PYTHON_CMD=python"
  ) else (
    where python3 >nul 2>nul
    if %errorlevel%==0 (
      set "PYTHON_CMD=python3"
    ) else (
      echo Python が見つかりません。Python 3 をインストールしてから再実行してください。
      echo.
      pause
      exit /b 1
    )
  )
)

:CHECK_PORT
%PYTHON_CMD% -c "import socket, sys; s = socket.socket(); s.settimeout(0.2); sys.exit(1 if s.connect_ex(('127.0.0.1', int(sys.argv[1]))) == 0 else 0)" %PORT%
if errorlevel 1 (
  set /a PORT+=1
  goto CHECK_PORT
)

set "URL=http://localhost:%PORT%"

echo GPT-4o Chat を起動します。
echo フォルダ: %cd%
echo URL: %URL%
echo.
echo 停止するときは、このウィンドウで Ctrl + C を押してください。
echo.

start "" "%URL%"
%PYTHON_CMD% -m http.server %PORT%

echo.
echo サーバーを停止しました。
pause
