@echo off
chcp 65001 >nul
echo ================================================
echo  송우찬수학학원 앱 - 플레이스토어에 올릴 앱 파일(.aab) 만들기
echo ================================================
cd /d "%~dp0android"
if not exist "songmath-upload.jks" (
  echo [오류] android 폴더에 서명 열쇠(songmath-upload.jks)가 없습니다.
  pause & exit /b 1
)
if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
call gradlew.bat bundleRelease
if errorlevel 1 (
  echo.
  echo [실패] 위 오류 내용을 캡처해서 보내 주세요.
  pause & exit /b 1
)
if not exist "..\스토어" mkdir "..\스토어"
copy /Y "app\build\outputs\bundle\release\app-release.aab" "..\스토어\송우찬수학학원_플레이스토어.aab" >nul
echo.
echo 완료! _app\스토어\송우찬수학학원_플레이스토어.aab 파일을 플레이 콘솔에 올리면 됩니다.
explorer "..\스토어"
pause
