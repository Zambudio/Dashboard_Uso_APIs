@echo off
title Instalar Inicio Automatico - Dashboard Monitor APIs
cd /d "%~dp0"

echo ========================================================
echo   CONFIGURANDO SINCRONIZACION AUTOMATICA CON EL NAS
echo ========================================================
echo.

set "TARGET_DIR=%APPDATA%\Dashboard_Uso_APIs"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

echo 1. Copiando lanzador silencioso a %TARGET_DIR%...
copy /Y "sync-daemon-silent.vbs" "%TARGET_DIR%\sync-daemon-silent.vbs" >nul

echo 2. Registrando en inicio automatico de Windows (HKCU\Run)...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "DashboardAPIs_AutoSync" /t REG_SZ /d "wscript.exe \"%TARGET_DIR%\sync-daemon-silent.vbs\"" /f >nul

echo 3. Creando enlace en la carpeta de Inicio (Startup)...
copy /Y "sync-daemon-silent.vbs" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DashboardAPIs-Sync.vbs" >nul

echo 4. Iniciando el servicio en segundo plano ahora mismo...
start "" wscript.exe "%TARGET_DIR%\sync-daemon-silent.vbs"

echo.
echo ========================================================
echo   [OK] SINCRONIZACION AUTOMATICA INSTALADA Y ACTIVA
echo ========================================================
echo.
echo - Se ejecutara automaticamente cada vez que inicies Windows.
echo - Sincroniza cada 60 segundos en segundo plano sin mostrar ventanas.
echo - Puedes consultar el log en: %TARGET_DIR%\sync.log
echo.
timeout /t 5 >nul 2>&1

