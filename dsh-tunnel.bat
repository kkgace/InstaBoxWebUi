@echo off
rem DSH Web 一键打开：自动取最新带 token 的入口并用默认浏览器打开（已无需 SSH 隧道）
rem 前提：同目录 ssh.txt 第一行放 SSH 命令行（与 deploy.sh 相同格式）
rem 说明：DSH 挂在控制台 /dsh/ 路径下，首次打开浏览器会先要求控制台密码（30 天免密），
rem       之后自动进入 DSH。dsh 每次重启都会换 token —— 重跑本脚本即可拿最新入口。
rem 注意：本文件必须保存为 GBK(ANSI) 编码 + CRLF 换行，中文才能在 cmd 正常显示
setlocal
if not exist "%~dp0ssh.txt" (
  echo [!] 未找到 ssh.txt —— 请在同目录放 SSH 命令行
  pause
  exit /b 1
)
set /p SSHLINE=<"%~dp0ssh.txt"

echo [1/2] 从沙箱获取最新带 token 的 DSH 入口...
%SSHLINE% "sudo -n journalctl -u dsh-web.service --no-pager -n 8 | grep 'dsh web:' | grep -oE 'https://[^ ]*' | tail -1" > "%TEMP%\dsh-url.txt"
set /p URL=<"%TEMP%\dsh-url.txt"
del "%TEMP%\dsh-url.txt" >nul 2>&1
if "%URL%"=="" (
  echo [!] 未能获取 URL —— 请确认沙箱上服务在跑：
  echo     %SSHLINE% "sudo -n journalctl -u dsh-web.service -n 8"
  pause
  exit /b 1
)

echo [2/2] 打开浏览器: %URL%
start "" "%URL%"
echo 完成。若浏览器提示控制台密码，输入后即自动进入 DSH。
timeout /t 5 /nobreak >nul
