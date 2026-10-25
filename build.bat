@echo off
rem Build APK BIMA by Dey.
rem Cek dependency dulu; npm install hanya jalan kalau node_modules belum ada
rem atau package.json / package-lock.json berubah sejak install terakhir.
rem Argumen diteruskan ke compile: build.bat --fast  atau  build.bat --clean
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Build APK - BIMA by Dey

echo.
echo [1/4] Node.js dan npm
where node >nul 2>&1 || goto :no_node
where npm >nul 2>&1 || goto :no_node
for /f "delims=" %%v in ('node -v') do echo       Node %%v

echo [2/4] JDK 21
set "JDK="
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" set "JDK=%JAVA_HOME%"
if not defined JDK for /d %%d in ("C:\Program Files\Eclipse Adoptium\jdk-21*") do set "JDK=%%~fd"
if not defined JDK goto :no_jdk
"%JDK%\bin\java.exe" -version 2>&1 | findstr /r /c:"version .21" >nul || echo       [peringatan] JDK di "%JDK%" bukan versi 21, build bisa gagal.
echo       %JDK%

echo [3/4] Android SDK
set "SDK="
if defined ANDROID_HOME set "SDK=%ANDROID_HOME%"
if not defined SDK if defined ANDROID_SDK_ROOT set "SDK=%ANDROID_SDK_ROOT%"
if not defined SDK set "SDK=%LOCALAPPDATA%\Android\Sdk"
if not exist "%SDK%\platform-tools" goto :no_sdk
echo       %SDK%

echo [4/4] Paket npm
rem Sidik package.json + package-lock.json disimpan di node_modules\.bima-deps
rem setelah install; kalau sama, install dilewati.
set "DEPS_CHECK=const f=require('fs'),h=require('crypto').createHash('sha1');for(const p of ['package.json','package-lock.json'])h.update(f.readFileSync(p));const d=h.digest('hex'),s='node_modules/.bima-deps';if(process.argv[1]==='save')f.writeFileSync(s,d);else process.exit(f.existsSync(s)&&f.readFileSync(s,'utf8')===d?0:1)"
node -e "%DEPS_CHECK%" check
if not errorlevel 1 (
  echo       Semua sudah terpasang, lewati install.
) else (
  echo       Dependency baru/berubah, menjalankan npm ci ...
  call npm ci
  if errorlevel 1 (
    echo       npm ci gagal ^(lock tidak sinkron dengan package.json^), pakai npm install ...
    call npm install
    if errorlevel 1 goto :fail
  )
  node -e "%DEPS_CHECK%" save
)

echo.
echo Build APK ...
call npm run compile -- %*
if errorlevel 1 goto :fail

echo.
echo Selesai. APK ada di compile\out\apk\
dir /b compile\out\apk\*.apk 2>nul
goto :end

:no_node
echo       [X] Node.js / npm tidak ditemukan. Install Node.js LTS dari https://nodejs.org
goto :fail

:no_jdk
echo       [X] JDK 21 tidak ditemukan. Install Temurin 21 dari https://adoptium.net
echo           atau set JAVA_HOME ke folder JDK 21.
goto :fail

:no_sdk
echo       [X] Android SDK tidak ditemukan di "%SDK%".
echo           Install Android Studio, atau set ANDROID_HOME ke folder SDK.
goto :fail

:fail
echo.
echo BUILD GAGAL. Log gradle: compile\out\logs\build-apk.log
endlocal
pause
exit /b 1

:end
endlocal
pause
exit /b 0
