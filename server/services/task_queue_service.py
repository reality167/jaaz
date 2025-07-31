import asyncio
import uuid
import time
from typing import Dict, Any, Optional, Callable
from enum import Enum
import traceback
import os
import json
import logging

# 配置日志
logger = logging.getLogger(__name__)

class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class TaskProgress:
    def __init__(self, total_steps: int = 1):
        self.total_steps = total_steps
        self.current_step = 0
        self.current_message = ""
        self.percentage = 0.0
    
    def update(self, step: int, message: str):
        self.current_step = step
        self.current_message = message
        self.percentage = (step / self.total_steps) * 100 if self.total_steps > 0 else 0

class AsyncTask:
    def __init__(self, task_id: str, task_type: str, canvas_id: str, data: Dict[str, Any]):
        self.task_id = task_id
        self.task_type = task_type
        self.canvas_id = canvas_id
        self.data = data
        self.status = TaskStatus.PENDING
        self.progress = TaskProgress()
        self.result = None
        self.error = None
        self.created_at = time.time()
        self.started_at = None
        self.completed_at = None

class TaskQueueService:
    def __init__(self):
        self.tasks: Dict[str, AsyncTask] = {}
        self.task_queue = asyncio.Queue()
        self.workers = []
        self.max_workers = 2  # 最大并发任务数
        self.running = False
        # 添加画布锁，防止同一画布的并发操作
        self.canvas_locks: Dict[str, asyncio.Lock] = {}
    
    async def start(self):
        """启动任务队列服务"""
        if self.running:
            return
        
        self.running = True
        # 启动工作线程
        for i in range(self.max_workers):
            worker = asyncio.create_task(self._worker(f"worker-{i}"))
            self.workers.append(worker)
        
        logger.info(f"✅ 任务队列服务已启动，工作线程数: {self.max_workers}")
    
    async def stop(self):
        """停止任务队列服务"""
        self.running = False
        
        # 向每个工作线程发送停止信号
        for _ in range(len(self.workers)):
            await self.task_queue.put(None)
        
        # 等待所有任务处理完成
        await self.task_queue.join()
        
        # 等待所有工作线程完成
        await asyncio.gather(*self.workers, return_exceptions=True)
        self.workers.clear()
        
        logger.info("🛑 任务队列服务已停止")
    
    def _get_canvas_lock(self, canvas_id: str) -> asyncio.Lock:
        """获取画布锁，确保同一画布的并发安全"""
        if canvas_id not in self.canvas_locks:
            self.canvas_locks[canvas_id] = asyncio.Lock()
        return self.canvas_locks[canvas_id]
    
    async def _worker(self, worker_name: str):
        """工作线程函数"""
        logger.info(f"工作线程 {worker_name} 已启动")
        
        while self.running:
            try:
                # 从队列中获取任务（阻塞式等待，不设置超时）
                task = await self.task_queue.get()
                
                # 标记任务已完成处理，这样queue.join()可以正常工作
                self.task_queue.task_done()
                
                # 如果收到None，表示需要停止工作线程
                if task is None:
                    logger.info(f"工作线程 {worker_name} 收到停止信号")
                    break
                
                logger.info(f"{worker_name} 开始处理任务: {task.task_id}")
                await self._process_task(task)
                
            except Exception as e:
                logger.error(f"❌ 工作线程 {worker_name} 发生错误: {e}")
                logger.exception("详细错误信息:")
        
        logger.info(f"工作线程 {worker_name} 已停止")
    
    async def _process_task(self, task: AsyncTask):
        """处理具体任务"""
        try:
            task.status = TaskStatus.RUNNING
            task.started_at = time.time()
            
            # 根据任务类型调用相应的处理函数
            if task.task_type == "split_layers":
                await self._process_split_layers_task(task)
            else:
                raise Exception(f"未知的任务类型: {task.task_type}")
            
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            logger.error(f"❌ 任务 {task.task_id} 处理失败: {e}")
            logger.exception("任务处理详细错误信息:")
        finally:
            task.completed_at = time.time()
            task.progress.update(task.progress.total_steps, "任务完成")
    
    async def _process_split_layers_task(self, task: AsyncTask):
        """处理图层拆分任务"""
        from services.extract_layers_service import LLMImageAnalyzer
        from services.db_service import db_service
        from services.websocket_service import broadcast_session_update
        from tools.image_generators import generate_file_id
  
        import base64
        import random
        
        canvas_id = task.canvas_id
        selected_images = task.data.get('selectedImages', [])
        
        # 获取画布锁，确保同一画布的并发安全
        canvas_lock = self._get_canvas_lock(canvas_id)
        
        # 设置进度总步数
        total_steps = len(selected_images) * 4 + 2  # 每张图片4步 + 开始和结束
        task.progress = TaskProgress(total_steps)
        
        # 发送任务开始通知
        await self._send_task_update(task, "图层拆分任务已开始")
        
        results = []
        all_layer_elements = []
        
        # 使用画布锁保护整个处理过程
        async with canvas_lock:
            for image_index, image_info in enumerate(selected_images):
                try:
                    # 更新进度
                    current_step = image_index * 4 + 1
                    task.progress.update(current_step, f"正在处理第 {image_index + 1}/{len(selected_images)} 张图片")
                    await self._send_task_update(task)
                    
                    # 处理图片路径
                    image_path = await self._prepare_image_path(image_info, canvas_id)
                    if not image_path:
                        logger.warning(f"⚠️ 跳过第 {image_index + 1} 张图片：无法获取图片路径")
                        continue
                    
                    # LLM分析
                    current_step += 1
                    task.progress.update(current_step, f"正在分析第 {image_index + 1} 张图片")
                    await self._send_task_update(task)
                    
                    analyzer = LLMImageAnalyzer()
                    response = analyzer.analyze_image_layers(image_path)
                    layers = analyzer.extract_layers_from_response(response)
                    
                    if "error" in layers:
                        raise Exception(f"图层分析失败: {layers['error']}")
                    
                    # 验证图层数据
                    if not layers.get("layers") or len(layers["layers"]) == 0:
                        logger.warning(f"⚠️ 第 {image_index + 1} 张图片没有检测到图层")
                        continue
                    
                    # 保存图层和抠图
                    current_step += 1
                    task.progress.update(current_step, f"正在处理第 {image_index + 1} 张图片的图层")
                    await self._send_task_update(task)
                    
                    layer_results = analyzer.save_individual_layers_with_cutout(image_path, layers)
                    
                    # 验证图层结果
                    if not layer_results or len(layer_results) == 0:
                        logger.warning(f"⚠️ 第 {image_index + 1} 张图片的图层处理失败")
                        continue
                    
                    # 生成可视化
                    current_step += 1
                    task.progress.update(current_step, f"正在生成第 {image_index + 1} 张图片的可视化")
                    await self._send_task_update(task)
                    
                    visualized_path = analyzer.visualize_layers(image_path, layers)
                    background_path = analyzer.create_background_image(image_path, layers)
                    
                    # 处理图层元素
                    layer_elements = await self._process_layer_elements(
                        layer_results, background_path, image_info, canvas_id
                    )
                    
                    # 验证图层元素
                    if layer_elements:
                        all_layer_elements.extend(layer_elements)
                        logger.info(f"✅ 第 {image_index + 1} 张图片处理完成，生成了 {len(layer_elements)} 个图层")
                    else:
                        logger.warning(f"⚠️ 第 {image_index + 1} 张图片没有生成有效的图层元素")
                    
                    results.append({
                        "layers": layers,
                        "layer_results": layer_results,
                        "visualized_path": visualized_path,
                        "background_path": background_path,
                        "layer_elements_count": len(layer_elements) if layer_elements else 0
                    })
                    
                except Exception as e:
                    logger.error(f"❌ 处理第 {image_index + 1} 张图片失败: {e}")
                    logger.exception("图片处理详细错误信息:")
                    results.append({"error": str(e), "image_index": image_index})
            
            # 更新画布 - 在锁保护下进行
            current_step = total_steps - 1
            task.progress.update(current_step, "正在更新画布")
            await self._send_task_update(task)
            
            if all_layer_elements:
                await self._update_canvas_with_layers(canvas_id, all_layer_elements)
                logger.info(f"✅ 画布更新完成，添加了 {len(all_layer_elements)} 个图层")
            else:
                logger.warning("⚠️ 没有图层需要添加到画布")
        
        # 任务完成
        task.status = TaskStatus.COMPLETED
        task.result = {
            "results": results,
            "layers_added": len(all_layer_elements),
            "total_images_processed": len(selected_images),
            "successful_images": len([r for r in results if "error" not in r])
        }
        
        current_step = total_steps
        task.progress.update(current_step, "图层拆分完成")
        await self._send_task_update(task)
    
    async def _prepare_image_path(self, image_info: Dict[str, Any], canvas_id: str) -> Optional[str]:
        """准备图片路径"""
        import os
        import base64
        
        file_id = image_info.get('fileId')
        base64_data = image_info.get('base64')
        
        if not file_id and not base64_data:
            logger.warning("⚠️ 图片信息缺少fileId和base64数据")
            return None
        
        from services.config_service import FILES_DIR
        os.makedirs(FILES_DIR, exist_ok=True)
        
        if base64_data:
            if base64_data.startswith('data:image'):
                if ',' in base64_data:
                    base64_data = base64_data.split(',')[1]
                
                try:
                    image_data = base64.b64decode(base64_data)
                    # 使用 generate_file_id 生成唯一文件名
                    from tools.image_generators import generate_file_id
                    new_file_id = generate_file_id()
                    # 将图片保存到永久文件目录而不是临时目录
                    file_path = os.path.join(FILES_DIR, f"{new_file_id}.png")
                    
                    with open(file_path, 'wb') as f:
                        f.write(image_data)
                    
                    if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
                        logger.info(f"✅ 图片已保存到永久文件目录: {file_path}")
                        return file_path
                    else:
                        logger.error(f"❌ 文件创建失败: {file_path}")
                        return None
                except Exception as e:
                    logger.error(f"❌ 处理base64数据失败: {e}")
                    return None
                    
            elif base64_data.startswith('/api/file/'):
                file_name = base64_data.split('/')[-1]
                image_path = os.path.join(FILES_DIR, file_name)
                if os.path.exists(image_path):
                    return image_path
                else:
                    logger.error(f"❌ 文件不存在: {image_path}")
                    return None
            else:
                if os.path.exists(base64_data):
                    return base64_data
                else:
                    logger.error(f"❌ 文件不存在: {base64_data}")
                    return None
        else:
            image_path = os.path.join(FILES_DIR, file_id)
            if os.path.exists(image_path):
                return image_path
            else:
                logger.error(f"❌ 文件不存在: {image_path}")
                return None
    
    async def _process_layer_elements(self, layer_results, background_path, image_info, canvas_id):
        """处理图层元素"""
        import shutil
        import time
        import random
        from services.config_service import FILES_DIR
        from tools.image_generators import generate_file_id
        from services.db_service import db_service
        
        layer_elements = []
        original_x = image_info.get('x', 0)
        original_y = image_info.get('y', 0)
        original_width = image_info.get('width', 0)
        original_height = image_info.get('height', 0)
        
        logger.debug(f"🔍 原始图片位置: x={original_x}, y={original_y}, width={original_width}, height={original_height}")
        
        # 获取画布上现有的元素，用于检查位置冲突
        existing_elements = []
        try:
            canvas_data = await db_service.get_canvas_data(canvas_id)
            if canvas_data and 'data' in canvas_data and 'elements' in canvas_data['data']:
                existing_elements = canvas_data['data']['elements']
                logger.info(f"获取到画布现有元素 {len(existing_elements)} 个")
        except Exception as e:
            logger.warning(f"获取画布元素失败，将使用默认位置: {e}")
        
        # 辅助函数：检查位置是否与现有元素冲突
        def check_position_conflict(x, y, width, height, padding=10):
            for elem in existing_elements:
                if elem.get('type') != 'image' or elem.get('isDeleted', False):
                    continue
                
                elem_x = elem.get('x', 0)
                elem_y = elem.get('y', 0)
                elem_width = elem.get('width', 0)
                elem_height = elem.get('height', 0)
                
                # 检查是否有重叠
                if (x < elem_x + elem_width + padding and 
                    x + width + padding > elem_x and 
                    y < elem_y + elem_height + padding and 
                    y + height + padding > elem_y):
                    return True  # 有冲突
            
            return False  # 无冲突
        
        # 辅助函数：找到整个图层组的合适放置基准位置
        def find_group_base_position(step=100):
            # 首先尝试右侧位置
            x = original_x + original_width + 50  # 默认间距50像素
            y = original_y
            
            # 检查这个基准位置是否适合整个原图大小
            if not check_position_conflict(x, y, original_width, original_height):
                return x, y
            
            # 尝试下方位置
            x = original_x
            y = original_y + original_height + 50
            if not check_position_conflict(x, y, original_width, original_height):
                return x, y
            
            # 尝试右下方位置
            x = original_x + original_width + 50
            y = original_y + original_height + 50
            if not check_position_conflict(x, y, original_width, original_height):
                return x, y
            
            # 如果以上位置都有冲突，尝试在画布上找一个空闲位置
            # 从原图右侧开始，向右逐步尝试
            x = original_x + original_width + 50
            y = original_y
            
            max_attempts = 10  # 最大尝试次数
            for _ in range(max_attempts):
                x += step
                if not check_position_conflict(x, y, original_width, original_height):
                    return x, y
            
            # 如果所有尝试都失败，返回一个默认位置，但增加较大偏移
            return original_x + original_width + 200, original_y + 200
        
        # 为整个图层组找一个基准位置
        group_base_x, group_base_y = find_group_base_position()
        logger.info(f"🔍 找到图层组基准位置: x={group_base_x}, y={group_base_y}")
        
        # 计算从原始位置到新基准位置的偏移量
        offset_x = group_base_x - original_x
        offset_y = group_base_y - original_y
        
        # 处理背景图层
        if background_path and os.path.exists(background_path):
            try:
                # 背景图层位置 - 使用与原图相同的位置加上偏移量
                background_width = original_width
                background_height = original_height
                background_x = original_x + offset_x
                background_y = original_y + offset_y
                
                logger.debug(f"🔍 背景图层位置: x={background_x}, y={background_y}")
                
                new_file_id = generate_file_id()
                file_extension = os.path.splitext(background_path)[1]
                new_filename = f"{new_file_id}{file_extension}"
                new_file_path = os.path.join(FILES_DIR, new_filename)
                
                # 复制文件并验证
                shutil.copy2(background_path, new_file_path)
                if not os.path.exists(new_file_path) or os.path.getsize(new_file_path) == 0:
                    logger.error(f"❌ 背景图层文件复制失败: {new_file_path}")
                    return layer_elements
                
                background_element = {
                    'type': 'image',
                    'id': new_file_id,
                    'x': background_x,
                    'y': background_y,
                    'width': original_width,
                    'height': original_height,
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
                
                background_file_data = {
                    'mimeType': 'image/png',
                    'id': new_file_id,
                    'dataURL': f'/api/file/{new_filename}',
                    'created': int(time.time() * 1000),
                }
                
                layer_elements.append({
                    'element': background_element,
                    'file': background_file_data,
                    'content': 'background'
                })
                
                logger.info(f"✅ 背景图层处理完成: {new_filename}, 位置: ({background_x}, {background_y})")
            except Exception as e:
                logger.error(f"❌ 处理背景图层失败: {e}")
        
        # 处理普通图层
        for layer_idx, layer_data in enumerate(layer_results):
            try:
                position = layer_data.get('position', {})
                x1 = position.get('x1', 0)
                y1 = position.get('y1', 0)
                x2 = position.get('x2', 0)
                y2 = position.get('y2', 0)
                
                if original_width > 0 and original_height > 0:
                    rel_x1 = x1 / original_width
                    rel_y1 = y1 / original_height
                    rel_x2 = x2 / original_width
                    rel_y2 = y2 / original_height
                else:
                    rel_x1, rel_y1, rel_x2, rel_y2 = 0, 0, 1, 1
                
                # 计算图层尺寸
                layer_width = (rel_x2 - rel_x1) * original_width
                layer_height = (rel_y2 - rel_y1) * original_height
                
                # 计算图层在原图中的绝对位置
                abs_x1 = original_x + (rel_x1 * original_width)
                abs_y1 = original_y + (rel_y1 * original_height)
                
                # 应用相同的偏移量，保持图层之间的相对位置关系
                layer_x = abs_x1 + offset_x
                layer_y = abs_y1 + offset_y
                
                logger.debug(f"图层原始位置: ({abs_x1}, {abs_y1}), 偏移后: ({layer_x}, {layer_y})")
                
                logger.debug(f"🔍 图层 {layer_data.get('content', 'unknown')} 位置: x={layer_x}, y={layer_y}, width={layer_width}, height={layer_height}")
                
                layer_file_path = None
                if layer_data.get('cutout', {}).get('status') == 'success':
                    layer_file_path = layer_data['cutout']['cutout_path']
                else:
                    layer_file_path = layer_data.get('layer_path')
                
                if layer_file_path and os.path.exists(layer_file_path):
                    new_file_id = generate_file_id()
                    file_extension = os.path.splitext(layer_file_path)[1]
                    new_filename = f"{new_file_id}{file_extension}"
                    new_file_path = os.path.join(FILES_DIR, new_filename)
                    
                    # 复制文件并验证
                    shutil.copy2(layer_file_path, new_file_path)
                    if not os.path.exists(new_file_path) or os.path.getsize(new_file_path) == 0:
                        logger.error(f"❌ 图层文件复制失败: {new_file_path}")
                        continue
                    
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
                    
                    file_data = {
                        'mimeType': 'image/png',
                        'id': new_file_id,
                        'dataURL': f'/api/file/{new_filename}',
                        'created': int(time.time() * 1000),
                    }
                    
                    layer_elements.append({
                        'element': layer_element,
                        'file': file_data,
                        'content': layer_data.get('content', 'unknown')
                    })
                    
                    logger.info(f"✅ 图层 {layer_data.get('content', 'unknown')} 处理完成: {new_filename}")
                else:
                    logger.warning(f"⚠️ 图层文件不存在: {layer_file_path}")
                    
            except Exception as e:
                logger.error(f"❌ 处理图层 {layer_idx} 失败: {e}")
                continue
        
        return layer_elements
    
    async def _update_canvas_with_layers(self, canvas_id: str, layer_elements: list):
        """更新画布数据 - 使用事务保证数据一致性"""
        from services.db_service import db_service
        from services.websocket_service import broadcast_session_update
        from services.websocket_state import sio
        import json
        import aiosqlite
        import os
        
        # 获取当前画布数据
        canvas_data = await db_service.get_canvas_data(canvas_id)
        if canvas_data is None:
            raise Exception("画布数据不存在")
        
        if 'data' not in canvas_data:
            canvas_data['data'] = {}
        if 'elements' not in canvas_data['data']:
            canvas_data['data']['elements'] = []
        if 'files' not in canvas_data['data']:
            canvas_data['data']['files'] = {}
        
        # 添加图层元素和文件
        for layer_info in layer_elements:
            canvas_data['data']['elements'].append(layer_info['element'])
            canvas_data['data']['files'][layer_info['element']['id']] = layer_info['file']
        
        # 使用事务保存画布数据
        try:
            await db_service.save_canvas_data(canvas_id, json.dumps(canvas_data['data']))
            logger.info(f"✅ 画布数据保存成功，添加了 {len(layer_elements)} 个图层")
        except Exception as e:
            logger.error(f"❌ 保存画布数据失败: {e}")
            raise Exception(f"保存画布数据失败: {e}")
        
        # 发送图层添加通知
        logger.info(f"🔍 开始发送图层添加通知，共 {len(layer_elements)} 个图层")
        
        # 检查文件是否存在
        from services.config_service import FILES_DIR
        logger.debug(f"📁 文件存储目录: {FILES_DIR}")
        
        for i, layer_info in enumerate(layer_elements):
            try:
                # 检查文件是否存在
                file_id = layer_info['element']['id']
                file_url = layer_info['file']['dataURL']
                file_name = file_url.split('/')[-1] if '/api/file/' in file_url else None
                file_path = os.path.join(FILES_DIR, file_name) if file_name else None
                
                logger.debug(f"🔍 图层 {i+1} 文件信息:")
                logger.debug(f"   - 元素ID: {file_id}")
                logger.debug(f"   - 文件URL: {file_url}")
                logger.debug(f"   - 文件名: {file_name}")
                logger.debug(f"   - 文件路径: {file_path}")
                
                if file_path and os.path.exists(file_path):
                    file_size = os.path.getsize(file_path)
                    logger.debug(f"   - 文件存在: ✅ (大小: {file_size} 字节)")
                else:
                    logger.warning(f"   - 文件存在: ❌ (文件不存在或路径无效)")
                
                # 检查元素位置和尺寸
                element = layer_info['element']
                logger.debug(f"   - 元素位置: x={element['x']}, y={element['y']}, width={element['width']}, height={element['height']}")
                
                # 使用canvas_notification事件发送图层添加通知
                await sio.emit('canvas_notification', {
                    'type': 'layer_added',
                    'canvas_id': canvas_id,
                    'session_id': canvas_id,
                    'element': layer_info['element'],
                    'file': layer_info['file'],
                    'content': layer_info['content']
                })
                
                # 添加调试日志
                logger.info(f"✅ 图层 {i+1} 添加通知已发送: {layer_info['content']}, 元素ID: {layer_info['element']['id']}")
                
            except Exception as e:
                logger.error(f"⚠️ 发送图层 {i+1} 添加通知失败: {e}")
                logger.exception("图层添加通知发送详细错误信息:")
        
        # 发送任务完成通知
        try:
            # 使用task_notification发送任务完成通知
            await sio.emit('task_notification', {
                "type": "split_layers_success",
                "canvas_id": canvas_id,
                "task_type": "split_layers",
                "status": "completed",
                "message": f"图层拆分完成，添加了 {len(layer_elements)} 个图层到画布",
                "timestamp": asyncio.get_event_loop().time()
            })
            logger.info(f"✅ 任务完成通知已通过task_notification发送")
            
            # 额外发送一个视图调整事件，确保所有图层都在视图中可见
            # 延迟发送，确保前端有时间处理图层添加事件
            await asyncio.sleep(1)
            await sio.emit('canvas_notification', {
                "type": "adjust_view",
                "canvas_id": canvas_id,
                "timestamp": asyncio.get_event_loop().time()
            })
            logger.info(f"✅ 视图调整通知已发送")
        except Exception as e:
            logger.error(f"⚠️ 发送任务完成通知失败: {e}")
    
    async def _send_task_update(self, task: AsyncTask, custom_message: str = None):
        """发送任务更新通知"""
        from services.websocket_state import sio
        
        message = custom_message or task.progress.current_message
        
        try:
            # 使用专门的 task_notification 事件发送任务进度更新
            await sio.emit('task_notification', {
                'task_id': task.task_id,
                'task_type': task.task_type,
                'canvas_id': task.canvas_id,
                'status': task.status.value,
                'progress': {
                    'current_step': task.progress.current_step,
                    'total_steps': task.progress.total_steps,
                    'percentage': task.progress.percentage,
                    'message': message
                }
            })
            logger.info(f"📊 任务进度更新已通过 task_notification 发送: {task.task_id}, 进度: {task.progress.percentage:.1f}%")
        except Exception as e:
            logger.error(f"⚠️ 发送任务更新通知失败: {e}")
    
    async def submit_task(self, task_type: str, canvas_id: str, data: Dict[str, Any]) -> str:
        """提交新任务"""
        task_id = str(uuid.uuid4())
        task = AsyncTask(task_id, task_type, canvas_id, data)
        
        self.tasks[task_id] = task
        await self.task_queue.put(task)
        
        logger.info(f"📝 任务已提交: {task_id} ({task_type})")
        return task_id
    
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取任务状态"""
        task = self.tasks.get(task_id)
        if not task:
            return None
        
        return {
            'task_id': task.task_id,
            'task_type': task.task_type,
            'canvas_id': task.canvas_id,
            'status': task.status.value,
            'progress': {
                'current_step': task.progress.current_step,
                'total_steps': task.progress.total_steps,
                'percentage': task.progress.percentage,
                'message': task.progress.current_message
            },
            'result': task.result,
            'error': task.error,
            'created_at': task.created_at,
            'started_at': task.started_at,
            'completed_at': task.completed_at
        }
    
    async def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        task = self.tasks.get(task_id)
        if not task or task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED]:
            return False
        
        task.status = TaskStatus.CANCELLED
        logger.info(f"❌ 任务已取消: {task_id}")
        return True
    
    async def list_tasks(self, canvas_id: str = None) -> list:
        """列出任务"""
        tasks = []
        for task in self.tasks.values():
            if canvas_id is None or task.canvas_id == canvas_id:
                tasks.append(await self.get_task_status(task.task_id))
        return tasks

# 全局任务队列实例
task_queue_service = TaskQueueService() 