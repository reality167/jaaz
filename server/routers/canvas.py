from fastapi import APIRouter, Request
#from routers.agent import chat
from services.chat_service import handle_chat
from services.db_service import db_service
from services.websocket_state import sio
import asyncio
import json
import logging

# 配置日志
logger = logging.getLogger(__name__)

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
    拆分图层接口 - 异步版本
    接收画布ID，提交异步任务，立即返回任务ID
    """
    try:
        logger.info(f"\n=== 开始处理画布 {id} 的图层拆分请求 ===")
        
        # 获取请求数据
        data = await request.json()
        selected_images = data.get('selectedImages', [])
        
        logger.info(f"画布ID: {id}")
        logger.info(f"选中的图片数量: {len(selected_images) if selected_images else 0}")
        
        if not selected_images:
            logger.error("❌ 未选择任何图片")
            raise Exception("未选择任何图片")
        
        # 提交异步任务
        from services.task_queue_service import task_queue_service
        task_id = await task_queue_service.submit_task("split_layers", id, data)
        
        # 发送任务开始通知
        from services.websocket_state import sio
        await sio.emit('canvas_notification', {
            "type": "split_layers_started",
            "canvas_id": id,
            "task_id": task_id,
            "message": f"图层拆分任务已开始，任务ID: {task_id}",
            "timestamp": asyncio.get_event_loop().time()
        })
        
        return {
            "success": True,
            "message": "图层拆分任务已提交",
            "canvas_id": id,
            "task_id": task_id,
            "status": "pending"
        }
        
    except Exception as e:
        logger.error(f"❌ 提交图层拆分任务失败: {str(e)}")
        logger.exception("图层拆分任务失败详细错误信息:")
        
        error_message = {
            "type": "split_layers_error",
            "canvas_id": id,
            "message": f"提交图层拆分任务失败: {str(e)}",
            "timestamp": asyncio.get_event_loop().time()
        }
        
        # 发送错误消息
        await sio.emit('canvas_notification', error_message)
        
        return {
            "success": False,
            "message": f"提交图层拆分任务失败: {str(e)}",
            "canvas_id": id
        }

@router.get("/{id}/split-layers/{task_id}")
async def get_split_layers_status(id: str, task_id: str):
    """
    获取图层拆分任务状态
    """
    try:
        from services.task_queue_service import task_queue_service
        task_status = await task_queue_service.get_task_status(task_id)
        
        if not task_status:
            return {
                "success": False,
                "message": "任务不存在",
                "task_id": task_id
            }
        
        return {
            "success": True,
            "task_status": task_status
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"获取任务状态失败: {str(e)}",
            "task_id": task_id
        }

@router.delete("/{id}/split-layers/{task_id}")
async def cancel_split_layers(id: str, task_id: str):
    """
    取消图层拆分任务
    """
    try:
        from services.task_queue_service import task_queue_service
        cancelled = await task_queue_service.cancel_task(task_id)
        
        if cancelled:
            # 发送取消通知
            from services.websocket_state import sio
            await sio.emit('canvas_notification', {
                "type": "split_layers_cancelled",
                "canvas_id": id,
                "task_id": task_id,
                "message": "图层拆分任务已取消",
                "timestamp": asyncio.get_event_loop().time()
            })
        
        return {
            "success": cancelled,
            "message": "任务已取消" if cancelled else "任务无法取消",
            "task_id": task_id
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"取消任务失败: {str(e)}",
            "task_id": task_id
        }

@router.get("/{id}/split-layers")
async def list_split_layers_tasks(id: str):
    """
    列出画布的所有图层拆分任务
    """
    try:
        from services.task_queue_service import task_queue_service
        tasks = await task_queue_service.list_tasks(id)
        
        return {
            "success": True,
            "tasks": tasks
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"获取任务列表失败: {str(e)}"
        }