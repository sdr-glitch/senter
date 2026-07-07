#!/bin/bash
cd "$(dirname "$0")"
echo "📈 트렌드 뷰어를 시작합니다..."
if ! command -v python3 >/dev/null 2>&1; then
  echo "⚠️ Python 3가 필요해요. 맥은 기본 내장이지만 없다면 https://python.org 에서 설치해주세요."
  read -p "엔터를 누르면 닫힙니다..."
  exit 1
fi
python3 src/main.py
