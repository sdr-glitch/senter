@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 📈 트렌드 뷰어를 시작합니다...
where node >nul 2>nul
if errorlevel 1 (
  echo ⚠️ Node.js가 설치되어 있지 않아요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요.
  pause
  exit /b 1
)
node server.js
pause
