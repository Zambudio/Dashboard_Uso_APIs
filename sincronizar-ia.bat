@echo off
title Sincronizador de Suscripciones IA -> NAS
cd /d "%~dp0"
echo ========================================================
echo   SINCRONIZADOR DE SUSCRIPCIONES IA -> NAS SYNOLOGY
echo   (Claude Code, ChatGPT Plus, Google Gemini)
echo ========================================================
echo.
node scripts/sync-subscriptions.js %*
if "%1"=="" (
    echo.
    echo Sincronizacion completada con exito.
    timeout /t 5
)
