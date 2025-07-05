@echo off
echo 开始构建Jaaz Windows版本...

echo 1. 安装根目录依赖...
npm install

echo 2. 安装并构建React前端...
cd react
npm install
npm run build
cd ..

echo 3. 构建Python后端...
cd server
pip install -r requirements.txt
pyinstaller main.spec
cd ..

echo 4. 打包Windows应用...
npm run build:win

echo 构建完成！请查看dist目录中的安装文件。
pause 