@echo off
setlocal
title 송우찬수학학원 앱 파일 만들기
echo ================================================
echo  송우찬수학학원 앱 - 플레이스토어에 올릴 앱 파일(.aab) 만들기
echo ================================================
echo.
cd /d "%~dp0android"
if not exist "songmath-upload.jks" goto nokey
if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
echo 만드는 중입니다. 처음에는 몇 분 걸려요...
echo.
call gradlew.bat bundleRelease
if errorlevel 1 goto fail
if not exist "%~dp0스토어" mkdir "%~dp0스토어"
copy /Y "app\build\outputs\bundle\release\app-release.aab" "%~dp0스토어\송우찬수학학원_플레이스토어.aab" >nul
echo.
echo 완료! _app\스토어 폴더의 송우찬수학학원_플레이스토어.aab 를 플레이 콘솔에 올리면 됩니다.
start "" explorer "%~dp0스토어"
goto end
:nokey
echo [오류] android 폴더에 서명 열쇠(songmath-upload.jks)가 없습니다.
goto end
:fail
echo.
echo [실패] 위 오류 내용을 캡처해서 보내 주세요.
:end
echo.
pause
