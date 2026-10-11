@echo off
rem Double-click to start Kotoba: runs the local server and opens the app in your browser.
title Kotoba
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\serve.ps1" -Open
