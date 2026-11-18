#!/bin/bash
# 송우찬수학학원 앱 — 맥북에서 더블클릭하면 앱 만들 준비를 전부 해 줌
#  (처음 한 번 + 이 폴더 내용이 바뀌었을 때 다시 실행)
cd "$(dirname "$0")"
echo ""
echo "=== 송우찬수학학원 앱 준비를 시작합니다 ==="
echo ""
if [ ! -f GoogleService-Info.plist ]; then
  echo "❌ 이 폴더에 GoogleService-Info.plist 가 없어요. 파이어베이스에서 내려받아 이 폴더에 넣은 뒤 다시 실행해 주세요. (안내문 2단계)"
  read -p "엔터를 누르면 창이 닫혀요"; exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "❌ node 가 설치되어 있지 않아요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요."
  read -p "엔터를 누르면 창이 닫혀요"; exit 1
fi
echo "1) 필요한 도구 내려받기 (처음엔 몇 분 걸려요)"
npm install || { echo "❌ 설치 실패 — 위 메시지를 Claude에게 보내 주세요"; read -p "엔터"; exit 1; }
echo ""
echo "2) 아이폰 앱 틀 만들기"
[ -d ios ] || npx cap add ios
echo ""
echo "3) 앱 아이콘·시작 화면 만들기"
npx @capacitor/assets generate --ios --iconBackgroundColor "#FFFFFF" --splashBackgroundColor "#4B3391" --splashBackgroundColorDark "#4B3391"
echo ""
echo "4) 알림 설정 넣기"
npm run patch
echo ""
echo "5) 최신 내용 반영"
npx cap sync ios
echo ""
echo "=== 끝났습니다 ==="
echo "· 아이폰: 지금 Xcode가 열립니다. 안내문의 'Xcode에서 할 일'을 따라 해 주세요."
npx cap open ios
read -p "엔터를 누르면 창이 닫혀요"
