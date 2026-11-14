@echo off
rem DSH Web 一键隧道：双击即可打开 DeepSeek Harness UI（本机 -> 沙箱）
rem 前提：同目录 ssh.txt 第一行放 SSH 命令行（与 deploy.sh 相同格式）
setlocal
if not exist "%~dp0ssh.txt" (
  echo [!] 未找到 ssh.txt —— 请在同目录放 SSH 命令行
  pause
  exit /b 1
)
set /p SSHLINE=<"%~dp0ssh.txt"

echo [1/3] 建立隧道 localhost:5080 -^> 沙箱 127.0.0.1:5080 ...
start "dsh-tunnel" /min %SSHLINE% -N -o ExitOnForwardFailure=yes -L 5080:127.0.0.1:5080
timeout /t 3 /nobreak >nul

echo [2/3] 获取最新带 token 的访问 URL（dsh 每次重启都会换 token）...
%SSHLINE% "sudo -n journalctl -u dsh-web.service --no-pager -n 8 | grep -oE 'http://127.0.0.1:5080/[a-zA-Z0-9_?=-]*' | tail -1" > "%TEMP%\dsh-url.txt"
set /p URL=<"%TEMP%\dsh-url.txt"
del "%TEMP%\dsh-url.txt" >nul 2>&1
if "%URL%"=="" (
  echo [!] 未能获取 URL —— 隧道窗口已建立，但请确认沙箱上服务在跑：
  echo     %SSHLINE% "sudo -n journalctl -u dsh-web.service -n 8"
  pause
  exit /b 1
)

echo [3/3] 打开浏览器: %URL%
start "" "%URL%"
echo.
echo 连接由最小化的 "dsh-tunnel" 窗口维持，关闭该窗口即断开。
echo 注意：沙箱重启或服务重启后 token 会变 —— 重跑本脚本即可。
pause
