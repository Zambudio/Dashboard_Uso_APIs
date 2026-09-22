@echo off
title Estado de Sincronizacion IA -> NAS
cd /d "%~dp0"

echo ========================================================
echo   ESTADO DEL SINCRONIZADOR AUTOMATICO IA -> NAS
echo ========================================================
echo.

setlocal EnableDelayedExpansion
set "LOCK_FILE=%TEMP%\dashboard-apis-sync.pid"
set "LOG_FILE=%APPDATA%\Dashboard_Uso_APIs\sync.log"

if exist "%LOCK_FILE%" (
    set /p SYNC_PID=<"%LOCK_FILE%"
    echo [ESTADO]: ACTIVO en segundo plano [PID: !SYNC_PID!]
) else (
    echo [ESTADO]: INACTIVO
)

echo.
echo --------------------------------------------------------
echo Ultimas 10 lineas de registro (%LOG_FILE%):
echo --------------------------------------------------------
if exist "%LOG_FILE%" (
    powershell -NoProfile -Command "Get-Content '%LOG_FILE%' -Tail 10"
) else (
    echo No hay archivo de log aun.
)

echo.
pause
