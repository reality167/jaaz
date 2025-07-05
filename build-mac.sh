#!/bin/bash

echo "🍎 开始构建Jaaz Mac版本..."

# 检查是否在macOS上运行
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ 错误：Mac应用只能在macOS系统上构建"
    exit 1
fi

echo "📦 1. 安装根目录依赖..."
npm install

echo "⚛️  2. 构建React前端..."
cd react
npm install --force
npm run build
cd ..

echo "🐍 3. 构建Python后端..."
cd server
pip3 install -r requirements.txt
pyinstaller main.spec
cd ..

echo "🔨 4. 打包Mac应用..."
npm run build:mac

echo "✅ 构建完成！请查看dist目录中的安装文件："
echo "   - Jaaz-1.0.14.dmg (DMG安装包)"
echo "   - Jaaz-1.0.14-mac.zip (ZIP压缩包)" 