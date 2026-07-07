@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 📈 트렌드 뷰어를 시작합니다...
where python >nul 2>nul
if errorlevel 1 (
  echo ⚠️ Python 3가 설치되어 있지 않아요. https://python.org 에서 설치할 때
  echo    "Add Python to PATH" 체크박스를 꼭 켜주세요. 설치 후 다시 실행!
  pause
  exit /b 1
)
python src/main.py
pause
