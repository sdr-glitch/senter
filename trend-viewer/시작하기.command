#!/bin/bash
cd "$(dirname "$0")"
echo "📈 트렌드 뷰어를 시작합니다..."
if ! command -v node >/dev/null 2>&1; then
  echo "⚠️ Node.js가 설치되어 있지 않아요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요."
  read -p "엔터를 누르면 닫힙니다..."
  exit 1
fi
node server.js
