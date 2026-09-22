@echo off
title Desinstalar Inicio Automatico - Dashboard Monitor APIs
cd /d "%~dp0"

echo ========================================================
echo   DESINSTALANDO SINCRONIZACION AUTOMATICA
echo ========================================================
echo.

set "TARGET_DIR=%APPDATA%\Dashboard_Uso_APIs"

echo 1. Eliminando de inicio automatico (HKCU\Run)...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "DashboardAPIs_AutoSync" /f >nul 2>&1

echo 2. Eliminando de la carpeta Inicio...
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DashboardAPIs-Sync.vbs" >nul 2>&1

echo 3. Deteniendo instancia en ejecucion...
if exist "%TEMP%\dashboard-apis-sync.pid" (
    set /p SYNC_PID=<"%TEMP%\dashboard-apis-sync.pid"
    if defined SYNC_PID (
        taskkill /F /PID %SYNC_PID% >nul 2>&1
    )
    del /F /Q "%TEMP%\dashboard-apis-sync.pid" >nul 2>&1
)

echo.
echo [OK] Sincronizacion automatica desactivada y servicio detenido.
echo.
timeout /t 5
