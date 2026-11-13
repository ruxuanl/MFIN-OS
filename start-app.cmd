@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\start-local.ps1" -Production %*
if errorlevel 1 pause
