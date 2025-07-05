Write-Host "开始构建Jaaz Windows版本..." -ForegroundColor Green

Write-Host "1. 安装根目录依赖..." -ForegroundColor Yellow
npm install

Write-Host "2. 安装并构建React前端..." -ForegroundColor Yellow
Set-Location react
npm install
npm run build
Set-Location ..

Write-Host "3. 构建Python后端..." -ForegroundColor Yellow
Set-Location server
pip install -r requirements.txt
pyinstaller main.spec
Set-Location ..

Write-Host "4. 打包Windows应用..." -ForegroundColor Yellow
npm run build:win

Write-Host "构建完成！请查看dist目录中的安装文件。" -ForegroundColor Green
Read-Host "按任意键继续..." 