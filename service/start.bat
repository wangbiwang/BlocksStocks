@echo off
chcp 65001 >nul
echo ========================================
echo   BlocksStocks 代理池服务
echo   同花顺 API IP 轮换防封禁
echo ========================================
echo.

cd /d "%~dp0"

:: 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo 📦 首次运行，安装依赖...
    call npm install
    echo.
)

echo 🚀 启动代理服务...
echo.
node proxy-server.js

pause
