from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any
import os
import sys

print("=== 开始加载图层拆分模块 ===")
# 使用相对导入
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from services.extract_layers_service import LLMImageAnalyzer
print("=== 图层拆分模块加载完成 ===")

router = APIRouter(prefix="/api")

@router.post("/layer_split")
def split_layers(data: Dict[str, Any] = Body(...)):
    """
    拆分图层API
    参数: { "image_path": "/your/local/path/to/image.png" }
    返回: 图层分析、抠图、背景图、可视化等全部结果
    """
    print("=== 开始处理图层拆分请求 ===")
    image_path = data.get("image_path")
    print(f"接收到的图片路径: {image_path}")
    
    if not image_path or not os.path.exists(image_path):
        print(f"❌ 图片路径无效或文件不存在: {image_path}")
        raise HTTPException(status_code=400, detail="图片路径无效或文件不存在")
    
    print(f"✅ 图片文件存在: {image_path}")
    print("=== 初始化LLM图像分析器 ===")
    analyzer = LLMImageAnalyzer()
    print("✅ LLM图像分析器初始化完成")
    
    try:
        # 1. LLM分析
        print("=== 步骤1: 开始LLM图像分析 ===")
        print(f"正在分析图片: {image_path}")
        response = analyzer.analyze_image_layers(image_path)
        print("✅ LLM分析完成，开始提取图层信息")
        
        layers = analyzer.extract_layers_from_response(response)
        print(f"✅ 图层信息提取完成，检测到 {len(layers.get('layers', []))} 个图层")
        
        if "error" in layers:
            print(f"❌ 图层提取失败: {layers['error']}")
            return {"error": layers["error"], "raw_response": layers.get("raw_response", "")}
        
        # 2. 保存每个要素并抠图
        print("=== 步骤2: 开始保存图层要素并进行抠图处理 ===")
        print("正在处理每个检测到的图层...")
        results = analyzer.save_individual_layers_with_cutout(image_path, layers)
        print(f"✅ 图层保存和抠图完成，处理了 {len(results)} 个图层")
        
        # 3. 可视化
        print("=== 步骤3: 开始生成图层可视化 ===")
        print("正在创建图层可视化图片...")
        visualized_path = analyzer.visualize_layers(image_path, layers)
        if visualized_path:
            print(f"✅ 可视化图片生成完成: {visualized_path}")
        else:
            print("⚠️ 可视化图片生成失败")
        
        # 4. 背景图
        print("=== 步骤4: 开始生成背景图 ===")
        print("正在创建背景图片...")
        background_path = analyzer.create_background_image(image_path, layers)
        if background_path:
            print(f"✅ 背景图片生成完成: {background_path}")
        else:
            print("⚠️ 背景图片生成失败")
        
        print("=== 图层拆分处理全部完成 ===")
        return {
            "layers": layers,
            "layer_results": results,
            "visualized_path": visualized_path,
            "background_path": background_path
        }
    except Exception as e:
        print(f"❌ 处理过程中发生错误: {str(e)}")
        import traceback
        print(f"错误详情: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"处理失败: {e}") 