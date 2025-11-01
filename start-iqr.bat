@echo off
cd /d "D:\Work\iqrcontrol\iqrcontrol"

:: ثبّت الباكجات
call npm install

:: شغّل السيرفر في نافذة جديدة
start cmd /k "npm run dev"

:: انتظر 5 ثواني حتى يشتغل السيرفر
timeout /t 10 /nobreak >nul

:: افتح كروم على localhost:5000
start chrome http://localhost:5000/
