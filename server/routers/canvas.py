from fastapi import APIRouter, Request
#from routers.agent import chat
from services.chat_service import handle_chat
from services.db_service import db_service
from services.websocket_state import sio
import asyncio
import json

router = APIRouter(prefix="/api/canvas")

@router.get("/list")
async def list_canvases():
    return await db_service.list_canvases()

@router.post("/create")
async def create_canvas(request: Request):
    data = await request.json()
    id = data.get('canvas_id')
    name = data.get('name')

    asyncio.create_task(handle_chat(data))
    await db_service.create_canvas(id, name)
    return {"id": id }

@router.get("/{id}")
async def get_canvas(id: str):
    return await db_service.get_canvas_data(id)

@router.post("/{id}/save")
async def save_canvas(id: str, request: Request):
    payload = await request.json()
    data_str = json.dumps(payload['data'])
    await db_service.save_canvas_data(id, data_str, payload['thumbnail'])
    return {"id": id }

@router.post("/{id}/rename")
async def rename_canvas(id: str, request: Request):
    data = await request.json()
    name = data.get('name')
    await db_service.rename_canvas(id, name)
    return {"id": id }

@router.delete("/{id}/delete")
async def delete_canvas(id: str):
    await db_service.delete_canvas(id)
    return {"id": id }

@router.post("/{id}/split-layers")
async def split_layers(id: str, request: Request):
    """
    拆分图层接口
    接收画布ID，执行拆分图层操作，并通过websocket发送成功消息
    """
    try:
        print(f"\n=== 开始处理画布 {id} 的图层拆分请求 ===")
        
        # 获取请求数据
        data = await request.json()
        selected_images = data.get('selectedImages', [])
        
        print(f"=== 调试信息 ===")
        print(f"画布ID: {id}")
        print(f"接收到的完整数据: {data}")
        print(f"selectedImages: {selected_images}")
        print(f"selectedImages类型: {type(selected_images)}")
        print(f"selectedImages长度: {len(selected_images) if selected_images else 0}")
        
        if selected_images:
            for i, img in enumerate(selected_images):
                print(f"图片 {i+1}:")
                print(f"  fileId: {img.get('fileId')}")
                print(f"  base64长度: {len(img.get('base64', ''))}")
                print(f"  width: {img.get('width')}")
                print(f"  height: {img.get('height')}")
                print(f"  完整数据: {img}")
        
        if not selected_images:
            print("❌ 未选择任何图片")
            raise Exception("未选择任何图片")
        
        print(f"正在为画布 {id} 执行图层拆分操作...")
        print(f"选中的图片数量: {len(selected_images)}")
        
        # 导入图层拆分功能
        print("=== 导入图层拆分模块 ===")
        import sys
        import os
        import base64
        import json
        import time
        import random
        
        # 导入图层拆分路由
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from routers.layer_split import split_layers
        from services.db_service import db_service
        from services.websocket_service import broadcast_session_update
        from tools.image_generators import generate_file_id
        print("✅ 图层拆分模块导入完成")
        
        # 处理每个选中的图片
        results = []
        all_layer_elements = []  # 存储所有要添加到画布的图层元素
        
        for image_index, image_info in enumerate(selected_images):
            print(f"\n=== 开始处理第 {image_index + 1}/{len(selected_images)} 张图片 ===")
            
            file_id = image_info.get('fileId')
            base64_data = image_info.get('base64')
            original_x = image_info.get('x', 0)  # 原图片在画布中的x坐标
            original_y = image_info.get('y', 0)  # 原图片在画布中的y坐标
            original_width = image_info.get('width', 0)  # 原图片宽度
            original_height = image_info.get('height', 0)  # 原图片高度
            
            print(f"处理图片: fileId={file_id}, base64={base64_data}")
            print(f"原图片位置: x={original_x}, y={original_y}, width={original_width}, height={original_height}")
            
            if not file_id and not base64_data:
                print("⚠️ 跳过：没有fileId和base64数据")
                continue
            
            # 创建临时文件路径
            temp_dir = os.path.join(os.path.dirname(__file__), '../temp/canvas_layers', id)
            os.makedirs(temp_dir, exist_ok=True)
            print(f"临时目录: {temp_dir}")
            
            # 处理base64数据（可能是文件路径或真正的base64）
            if base64_data:
                if base64_data.startswith('data:image'):
                    print("📝 处理base64图片数据...")
                    # 真正的base64数据
                    if ',' in base64_data:
                        base64_data = base64_data.split(',')[1]
                    
                    # 解码并保存为临时文件
                    image_data = base64.b64decode(base64_data)
                    temp_filename = f"temp_{len(results)}.png"
                    temp_path = os.path.join(temp_dir, temp_filename)
                    
                    with open(temp_path, 'wb') as f:
                        f.write(image_data)
                    image_path = temp_path
                    print(f"✅ 从base64创建临时文件: {temp_path}")
                elif base64_data.startswith('/api/file/'):
                    print("📁 处理文件路径...")
                    # 这是文件路径，需要从文件系统获取
                    from services.config_service import FILES_DIR
                    # 从路径中提取文件名
                    file_name = base64_data.split('/')[-1]  # 例如: im_X2vDebDr.jpeg
                    image_path = os.path.join(FILES_DIR, file_name)
                    print(f"从文件路径获取: {image_path}")
                    print(f"FILES_DIR: {FILES_DIR}")
                    print(f"文件是否存在: {os.path.exists(image_path)}")
                    
                    if not os.path.exists(image_path):
                        print(f"❌ 文件不存在: {image_path}")
                        continue
                else:
                    print("📁 处理其他路径...")
                    # 其他情况，尝试直接作为文件路径
                    image_path = base64_data
                    print(f"直接使用路径: {image_path}")
                    
                    if not os.path.exists(image_path):
                        print(f"❌ 文件不存在: {image_path}")
                        continue
            else:
                print("📁 从fileId获取文件...")
                # 如果有fileId，尝试从文件系统获取
                from services.config_service import FILES_DIR
                image_path = os.path.join(FILES_DIR, file_id)
                print(f"从fileId获取: {image_path}")
                
                if not os.path.exists(image_path):
                    print(f"❌ 文件不存在: {image_path}")
                    continue
            
            print(f"✅ 图片路径确定: {image_path}")
            
            # 调用图层拆分API
            print("=== 调用图层拆分API ===")
            try:
                layer_result = split_layers({"image_path": image_path})
                print(f"✅ 第 {image_index + 1} 张图片处理完成")
                results.append(layer_result)
                
                # 处理拆分出的图层，将它们添加到画布
                if layer_result and "layer_results" in layer_result:
                    print("=== 开始处理拆分出的图层 ===")
                    layer_results = layer_result["layer_results"]
                    
                    # 先处理背景图层（确保在最底层）
                    if layer_result.get("background_path") and os.path.exists(layer_result["background_path"]):
                        print("=== 开始处理背景图层（最底层） ===")
                        background_path = layer_result["background_path"]
                        print(f"背景图层路径: {background_path}")
                        
                        # 背景图层放在原图右侧，与原图保持相同高度
                        background_x = original_x + original_width + 50  # 原图右侧50像素间距
                        background_y = original_y
                        background_width = original_width
                        background_height = original_height
                        
                        print(f"背景图层位置: x={background_x}, y={background_y}, width={background_width}, height={background_height}")
                        print(f"原图位置: x={original_x}, y={original_y}, width={original_width}, height={original_height}")
                        print(f"图层组位置: 原图右侧50像素间距")
                        
                        # 将背景图层文件复制到FILES_DIR
                        from services.config_service import FILES_DIR
                        import shutil
                        
                        # 生成新的文件ID
                        new_file_id = generate_file_id()
                        file_extension = os.path.splitext(background_path)[1]
                        new_filename = f"{new_file_id}{file_extension}"
                        new_file_path = os.path.join(FILES_DIR, new_filename)
                        
                        print(f"🔍 背景图层调试信息:")
                        print(f"  原始背景文件: {background_path}")
                        print(f"  文件是否存在: {os.path.exists(background_path)}")
                        print(f"  文件大小: {os.path.getsize(background_path) if os.path.exists(background_path) else 'N/A'}")
                        print(f"  目标文件: {new_file_path}")
                        
                        # 复制文件
                        shutil.copy2(background_path, new_file_path)
                        print(f"背景图层文件已复制到: {new_file_path}")
                        print(f"复制后文件是否存在: {os.path.exists(new_file_path)}")
                        print(f"复制后文件大小: {os.path.getsize(new_file_path) if os.path.exists(new_file_path) else 'N/A'}")
                        
                        # 创建背景图层画布元素
                        background_element = {
                            'type': 'image',
                            'id': new_file_id,
                            'x': background_x,
                            'y': background_y,
                            'width': background_width,
                            'height': background_height,
                            'angle': 0,
                            'fileId': new_file_id,
                            'strokeColor': '#000000',
                            'fillStyle': 'solid',
                            'strokeStyle': 'solid',
                            'boundElements': None,
                            'roundness': None,
                            'frameId': None,
                            'backgroundColor': 'transparent',
                            'strokeWidth': 1,
                            'roughness': 0,
                            'opacity': 100,
                            'groupIds': [],
                            'seed': int(random.random() * 1000000),
                            'version': 1,
                            'versionNonce': int(random.random() * 1000000),
                            'isDeleted': False,
                            'index': None,
                            'updated': int(time.time() * 1000),
                            'link': None,
                            'locked': False,
                            'status': 'saved',
                            'scale': [1, 1],
                            'crop': None,
                        }
                        
                        # 创建背景图层文件数据
                        background_file_data = {
                            'mimeType': 'image/png',
                            'id': new_file_id,
                            'dataURL': f'/api/file/{new_filename}',
                            'created': int(time.time() * 1000),
                        }
                        
                        all_layer_elements.append({
                            'element': background_element,
                            'file': background_file_data,
                            'content': 'background'
                        })
                        
                        print(f"✅ 背景图层已准备添加到画布（最底层）")
                    else:
                        print("⚠️ 背景图层不存在或文件不存在")
                    
                    # 处理普通图层
                    for layer_idx, layer_data in enumerate(layer_results):
                        print(f"处理图层 {layer_idx + 1}/{len(layer_results)}: {layer_data.get('content', 'unknown')}")
                        
                        # 获取图层的位置信息
                        position = layer_data.get('position', {})
                        x1 = position.get('x1', 0)
                        y1 = position.get('y1', 0)
                        x2 = position.get('x2', 0)
                        y2 = position.get('y2', 0)
                        
                        # 计算图层在原图中的相对位置（归一化坐标）
                        if original_width > 0 and original_height > 0:
                            rel_x1 = x1 / original_width
                            rel_y1 = y1 / original_height
                            rel_x2 = x2 / original_width
                            rel_y2 = y2 / original_height
                        else:
                            # 如果无法获取原图尺寸，使用默认值
                            rel_x1, rel_y1, rel_x2, rel_y2 = 0, 0, 1, 1
                        
                        # 计算图层在画布中的绝对位置（放在原图右侧）
                        layer_x = original_x + original_width + 50 + (rel_x1 * original_width)  # 原图右侧50像素间距
                        layer_y = original_y + (rel_y1 * original_height)
                        layer_width = (rel_x2 - rel_x1) * original_width
                        layer_height = (rel_y2 - rel_y1) * original_height
                        
                        print(f"图层位置: x={layer_x}, y={layer_y}, width={layer_width}, height={layer_height}")
                        print(f"图层相对位置: 原图右侧50像素 + 相对偏移({rel_x1:.3f}, {rel_y1:.3f})")
                        
                        # 优先使用抠图结果，如果没有则使用原始图层
                        layer_file_path = None
                        if layer_data.get('cutout', {}).get('status') == 'success':
                            layer_file_path = layer_data['cutout']['cutout_path']
                            print(f"使用抠图结果: {layer_file_path}")
                        else:
                            layer_file_path = layer_data.get('layer_path')
                            print(f"使用原始图层: {layer_file_path}")
                        
                        # 如果图层文件不存在，尝试创建一个简单的占位图层
                        if not layer_file_path or not os.path.exists(layer_file_path):
                            print(f"⚠️ 图层文件不存在，创建占位图层")
                            from services.config_service import FILES_DIR
                            from PIL import Image, ImageDraw
                            
                            # 创建一个简单的占位图片
                            placeholder_size = (int(layer_width), int(layer_height))
                            placeholder_img = Image.new('RGBA', placeholder_size, (255, 255, 255, 128))
                            draw = ImageDraw.Draw(placeholder_img)
                            draw.rectangle([0, 0, placeholder_size[0]-1, placeholder_size[1]-1], outline=(0, 0, 0, 255), width=2)
                            draw.text((10, 10), f"Layer: {layer_data.get('content', 'unknown')}", fill=(0, 0, 0, 255))
                            
                            # 保存占位图片
                            new_file_id = generate_file_id()
                            placeholder_filename = f"{new_file_id}.png"
                            placeholder_path = os.path.join(FILES_DIR, placeholder_filename)
                            placeholder_img.save(placeholder_path)
                            
                            layer_file_path = placeholder_path
                            print(f"✅ 占位图层已创建: {placeholder_path}")
                        
                        if layer_file_path and os.path.exists(layer_file_path):
                            # 将图层文件复制到FILES_DIR
                            from services.config_service import FILES_DIR
                            import shutil
                            
                            # 生成新的文件ID
                            new_file_id = generate_file_id()
                            file_extension = os.path.splitext(layer_file_path)[1]
                            new_filename = f"{new_file_id}{file_extension}"
                            new_file_path = os.path.join(FILES_DIR, new_filename)
                            
                            print(f"🔍 调试信息:")
                            print(f"  原始图层文件: {layer_file_path}")
                            print(f"  文件是否存在: {os.path.exists(layer_file_path)}")
                            print(f"  文件大小: {os.path.getsize(layer_file_path) if os.path.exists(layer_file_path) else 'N/A'}")
                            print(f"  目标文件: {new_file_path}")
                            print(f"  FILES_DIR: {FILES_DIR}")
                            
                            # 复制文件
                            shutil.copy2(layer_file_path, new_file_path)
                            print(f"图层文件已复制到: {new_file_path}")
                            print(f"复制后文件是否存在: {os.path.exists(new_file_path)}")
                            print(f"复制后文件大小: {os.path.getsize(new_file_path) if os.path.exists(new_file_path) else 'N/A'}")
                            
                            # 创建画布元素
                            layer_element = {
                                'type': 'image',
                                'id': new_file_id,
                                'x': layer_x,
                                'y': layer_y,
                                'width': layer_width,
                                'height': layer_height,
                                'angle': 0,
                                'fileId': new_file_id,
                                'strokeColor': '#000000',
                                'fillStyle': 'solid',
                                'strokeStyle': 'solid',
                                'boundElements': None,
                                'roundness': None,
                                'frameId': None,
                                'backgroundColor': 'transparent',
                                'strokeWidth': 1,
                                'roughness': 0,
                                'opacity': 100,
                                'groupIds': [],
                                'seed': int(random.random() * 1000000),
                                'version': 1,
                                'versionNonce': int(random.random() * 1000000),
                                'isDeleted': False,
                                'index': None,
                                'updated': int(time.time() * 1000),
                                'link': None,
                                'locked': False,
                                'status': 'saved',
                                'scale': [1, 1],
                                'crop': None,
                            }
                            
                            # 创建文件数据
                            file_data = {
                                'mimeType': 'image/png',
                                'id': new_file_id,
                                'dataURL': f'/api/file/{new_filename}',
                                'created': int(time.time() * 1000),
                            }
                            
                            all_layer_elements.append({
                                'element': layer_element,
                                'file': file_data,
                                'content': layer_data.get('content', 'unknown')
                            })
                            
                            print(f"✅ 图层 {layer_data.get('content', 'unknown')} 已准备添加到画布")
                        else:
                            print(f"❌ 图层文件不存在: {layer_file_path}")
                
            except Exception as e:
                print(f"❌ 图层拆分失败: {str(e)}")
                results.append({
                    "image_path": image_path,
                    "error": str(e)
                })
        
        print(f"\n=== 所有图片处理完成，共处理 {len(results)} 张图片 ===")
        print(f"准备添加到画布的图层数量: {len(all_layer_elements)}")
        
        # 将图层添加到画布
        if all_layer_elements:
            print("=== 开始将图层添加到画布 ===")
            try:
                # 获取当前画布数据
                canvas_data = await db_service.get_canvas_data(id)
                if canvas_data is None:
                    print("❌ 画布数据不存在")
                    return {
                        "success": False,
                        "message": "画布数据不存在",
                        "canvas_id": id
                    }
                
                if 'data' not in canvas_data:
                    canvas_data['data'] = {}
                if 'elements' not in canvas_data['data']:
                    canvas_data['data']['elements'] = []
                if 'files' not in canvas_data['data']:
                    canvas_data['data']['files'] = {}
                
                # 添加图层元素和文件
                for layer_info in all_layer_elements:
                    canvas_data['data']['elements'].append(layer_info['element'])
                    canvas_data['data']['files'][layer_info['element']['id']] = layer_info['file']
                
                # 保存画布数据
                await db_service.save_canvas_data(id, json.dumps(canvas_data['data']))
                print(f"✅ 画布数据已更新，添加了 {len(all_layer_elements)} 个图层")
                
                # 通过WebSocket发送图层添加成功消息
                for layer_info in all_layer_elements:
                    await broadcast_session_update(
                        session_id="layer_split",  # 使用固定的session_id用于图层拆分
                        canvas_id=id,
                        event={
                            'type': 'layer_added',
                            'element': layer_info['element'],
                            'file': layer_info['file'],
                            'content': layer_info['content']
                        }
                    )
                
            except Exception as e:
                print(f"❌ 添加图层到画布失败: {str(e)}")
                import traceback
                traceback.print_exc()
        
        # 通过websocket发送成功消息到所有连接的客户端
        success_message = {
            "type": "split_layers_success",
            "canvas_id": id,
            "message": f"拆分图层成功，处理了 {len(results)} 张图片，添加了 {len(all_layer_elements)} 个图层到画布",
            "results": results,
            "layers_added": len(all_layer_elements),
            "timestamp": asyncio.get_event_loop().time()
        }
        
        print("=== 发送WebSocket成功消息 ===")
        # 发送到所有连接的客户端
        await sio.emit('canvas_notification', success_message)
        print("✅ WebSocket消息发送完成")
        
        return {
            "success": True,
            "message": f"拆分图层成功，处理了 {len(results)} 张图片，添加了 {len(all_layer_elements)} 个图层到画布",
            "canvas_id": id,
            "results": results,
            "layers_added": len(all_layer_elements)
        }
        
    except Exception as e:
        print(f"❌ 图层拆分过程中发生错误: {str(e)}")
        import traceback
        print(f"错误详情: {traceback.format_exc()}")
        
        error_message = {
            "type": "split_layers_error",
            "canvas_id": id,
            "message": f"拆分图层失败: {str(e)}",
            "timestamp": asyncio.get_event_loop().time()
        }
        
        print("=== 发送WebSocket错误消息 ===")
        # 发送错误消息
        await sio.emit('canvas_notification', error_message)
        print("✅ WebSocket错误消息发送完成")
        
        return {
            "success": False,
            "message": f"拆分图层失败: {str(e)}",
            "canvas_id": id
        }