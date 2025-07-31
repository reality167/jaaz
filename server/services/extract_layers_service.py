import json
import base64
from typing import Dict, List, Any, Optional, Union
import os
import time
import requests
import sys
import os.path as path
import logging

# 配置日志
logger = logging.getLogger(__name__)

# 如果作为主程序运行，添加父目录到sys.path
if __name__ == "__main__":
    current_dir = path.dirname(path.abspath(__file__))
    parent_dir = path.dirname(current_dir)
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)
        logger.info(f"已将父目录添加到Python路径: {parent_dir}")

# 导入必要的库
import tos
from PIL import Image, ImageDraw, ImageFont
from openai import OpenAI
import numpy as np
import concurrent.futures
import threading
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 根据运行方式选择不同的导入方式
if __name__ == "__main__":
    from services.extract_layers_utils import CozeWorkflowClient, TOSUploader
else:
    from .extract_layers_utils import CozeWorkflowClient, TOSUploader

class LLMImageAnalyzer:
    # 定义类常量
    EXPAND_PX = 4  # 图层边界框扩展像素数
    
    def __init__(self, base_url: str = "https://ark.cn-beijing.volces.com/api/v3"):
        """
        初始化LLM图片分析器
        
        Args:
            base_url: API基础URL
        """
        # 从环境变量获取API密钥
        api_key = os.getenv("VOLCES_API_KEY", "")
        if not api_key:
            raise ValueError("VOLCES_API_KEY 环境变量未设置")
        
        # 初始化OpenAI客户端
        self.client = OpenAI(
            base_url=base_url,
            api_key=api_key,
        )
        
        # 预定义颜色列表用于不同要素的可视化
        self.colors = [
            (255, 0, 0),    # 红色
            (0, 255, 0),    # 绿色
            (0, 0, 255),    # 蓝色
            (255, 255, 0),  # 黄色
            (255, 0, 255),  # 紫色
            (0, 255, 255),  # 青色
            (255, 165, 0),  # 橙色
            (128, 0, 128),  # 深紫色
            (0, 128, 0),    # 深绿色
            (128, 128, 0),  # 橄榄色
        ]
        
        # 初始化Coze和TOS客户端
        self._init_coze_and_tos()
    
    def _init_coze_and_tos(self):
        """初始化Coze和TOS客户端"""
        # Coze API令牌 - 从环境变量获取
        api_token = os.getenv("COZE_API_TOKEN", "")
        
        # TOS配置 - 从环境变量获取
        ak = os.getenv("VOLCENGINE_ACCESS_KEY", "")
        sk = os.getenv("VOLCENGINE_SECRET_KEY", "")
        endpoint = os.getenv("VOLCENGINE_ENDPOINT", "tos-cn-beijing.volces.com")
        region = os.getenv("VOLCENGINE_REGION", "cn-beijing")
        bucket_name = os.getenv("VOLCENGINE_BUCKET", "videovine")
        
        # 验证必要的环境变量
        if not api_token:
            logger.warning("⚠️  警告: COZE_API_TOKEN 环境变量未设置")
        if not ak or not sk:
            logger.warning("⚠️  警告: VOLCENGINE_ACCESS_KEY 或 VOLCENGINE_SECRET_KEY 环境变量未设置")
        
        self.coze_client = CozeWorkflowClient(api_token)
        self.tos_uploader = TOSUploader(ak, sk, endpoint, region, bucket_name)
    
    def encode_image_to_base64(self, image_path: str) -> str:
        """
        将本地图片编码为base64
        
        Args:
            image_path: 图片文件路径
            
        Returns:
            base64编码的图片字符串
        """
        # 使用线程ID创建唯一的临时文件名
        thread_id = threading.get_ident()
        timestamp = int(time.time() * 1000)
        
        # 使用PIL打开并处理图片，确保格式正确
        with Image.open(image_path) as img:
            # 检查图片尺寸
            width, height = img.size

            # 如果图片太大，调整大小以减小文件大小
            max_dimension = 2048
            if width > max_dimension or height > max_dimension:
                ratio = min(max_dimension / width, max_dimension / height)
                new_width = int(width * ratio)
                new_height = int(height * ratio)
                img = img.resize((new_width, new_height), Image.LANCZOS)

            # 确保图片模式正确
            if img.mode not in ['RGB', 'RGBA']:
                img = img.convert('RGB')

            # 保存为临时JPEG文件（豆包API可能更好地支持JPEG）
            temp_dir = os.path.join(os.path.dirname(image_path), "temp")
            os.makedirs(temp_dir, exist_ok=True)
            temp_file = os.path.join(temp_dir, f"temp_{thread_id}_{timestamp}.jpg")

            img.save(temp_file, format='JPEG', quality=95)

            # 编码为base64
            with open(temp_file, "rb") as image_file:
                base64_image = base64.b64encode(image_file.read()).decode('utf-8')
                
            # 尝试删除临时文件
            try:
                os.remove(temp_file)
            except:
                pass
                
            return base64_image
    
    def analyze_image_layers(self, image_path: str, prompt: Optional[str] = None) -> Dict[str, Any]:
        """
        分析图片并提取图层要素坐标
        
        Args:
            image_path: 图片文件路径（本地文件或URL）
            prompt: 自定义提示词
            
        Returns:
            LLM响应的JSON数据
        """
        # 默认提示词
        if prompt is None:
            prompt = """这是一张茶叶包装设计图。请检测并标注图像中所有属于以下类别的元素：
                *   公司名
                *   公司logo
                *   品名
                *   背景素材
                *   印章
                *   其他元素

                输出要求：​​

                1. 对每个检测到的元素，提供：
                    *   类别名称
                    *   边界框坐标（归一化值 [0,1]，保留3位小数）
                2. 边界框规则：
                    *   完整覆盖：用尽量大的边界框覆盖目标元素, 不要遗漏任何元素；
                    *   禁止嵌套：任何元素的边界框不得完全包含另一元素的边界框；
                    *   最小重叠：允许元素紧密相邻时出现小部分重叠，但需避免非必要重叠。

                请将结果以JSON格式返回。

                返回格式示例：
                {
                    "layers": [
                        {
                        "content": "公司名",
                        "position": {"x1": 0.100, "y1": 0.050, "x2": 0.300, "y2": 0.080},
                        },
                        {
                        "content": "背景素材",
                        "position": {"x1": 0.150, "y1": 0.200, "x2": 0.250, "y2": 0.240},
                        }
                    ]
                }"""

        # 构建消息内容
        content: List[Dict[str, Any]] = [
            {
                "type": "text",
                "text": prompt
            }
        ]
        
        # 处理图片输入
        if image_path.startswith(('http://', 'https://')):
            # 网络图片
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": image_path
                }
            })
        else:
            # 本地图片
            if not os.path.exists(image_path):
                raise FileNotFoundError(f"图片文件不存在: {image_path}")
            
            # 获取图片MIME类型 - 始终使用JPEG
            mime_type = "image/jpeg"
            
            base64_image = self.encode_image_to_base64(image_path)
            
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{base64_image}"
                }
            })
        
        try:
            # 使用OpenAI客户端发送请求
            response = self.client.chat.completions.create(
                model="doubao-1-5-thinking-vision-pro-250428",
                messages=[
                    {
                        "role": "user",
                        "content": content  # type: ignore
                    }
                ],
                max_tokens=2000,
                temperature=0.1
            )
            
            # 返回响应数据
            return {
                "choices": [
                    {
                        "message": {
                            "content": response.choices[0].message.content
                        }
                    }
                ]
            }
            
        except Exception as e:
            raise Exception(f"API请求失败: {str(e)}")
    
    def _get_mime_type(self, file_path: str) -> str:
        """
        根据文件扩展名获取MIME类型
        
        Args:
            file_path: 文件路径
            
        Returns:
            MIME类型字符串
        """
        # 始终返回JPEG MIME类型，因为我们在encode_image_to_base64中已转换为JPEG
        return 'image/jpeg'
    
    def extract_layers_from_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """
        从LLM响应中提取图层信息
        
        Args:
            response: LLM的响应数据
            
        Returns:
            解析后的图层信息
        """
        try:
            # 获取LLM的回复内容
            content = response['choices'][0]['message']['content']
            
            # 直接解析JSON内容
            layers_data = json.loads(content)
            return layers_data
                
        except (KeyError, json.JSONDecodeError) as e:
            return {
                "raw_response": content,
                "error": f"解析响应失败: {str(e)}"
            }
    
    def _get_most_common_color(self, image: Image.Image, layers_data: Dict[str, Any]) -> tuple:
        """
        获取图片中最常见的颜色（排除透明色和图层区域）
        
        Args:
            image: PIL图片对象
            layers_data: 图层数据，用于排除图层区域
            
        Returns:
            最常见的颜色元组 (R, G, B)
        """
        # 转换为RGB模式
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # 获取图像尺寸
        img_width, img_height = image.size
        
        # 创建掩码，标记需要排除的区域
        mask = np.ones((img_height, img_width), dtype=np.uint8) * 255  # 255表示保留，0表示排除
        
        # 将图像转换为numpy数组以加快处理速度
        img_array = np.array(image)
        
        # 根据图层数据标记需要排除的区域
        excluded_pixels = 0
        if "layers" in layers_data and layers_data["layers"]:
            for layer in layers_data["layers"]:
                if "position" not in layer:
                    continue
                
                pos = layer["position"]
                
                coords = normalize_to_absolute_coords(pos, img_width, img_height, self.EXPAND_PX)
                if coords is None:
                    continue
                
                x1, y1, x2, y2, x1_exp, y1_exp, x2_exp, y2_exp = coords

                # 在掩码上标记排除区域（设为0）
                mask[y1_exp:y2_exp, x1_exp:x2_exp] = 0
                excluded_pixels += (x2_exp - x1_exp) * (y2_exp - y1_exp)
        
        # 使用掩码筛选有效像素
        valid_pixels = img_array[mask == 255]
        
        if len(valid_pixels) > 0:
            # 使用numpy的unique函数统计颜色频率
            colors, counts = np.unique(valid_pixels.reshape(-1, 3), axis=0, return_counts=True)
            
            # 找到出现次数最多的颜色
            most_common_idx = np.argmax(counts)
            most_common_color = tuple(colors[most_common_idx])
            
            # 如果最常见的颜色是白色，尝试找到第二常见的非白色颜色
            if most_common_color == (255, 255, 255):
                # 找出非白色颜色的索引
                non_white_indices = np.where(~np.all(colors == [255, 255, 255], axis=1))[0]
                if len(non_white_indices) > 0:
                    # 从非白色颜色中找出出现次数最多的颜色
                    non_white_counts = counts[non_white_indices]
                    second_most_common_idx = non_white_indices[np.argmax(non_white_counts)]
                    # 如果第二常见的颜色出现次数足够多，使用它
                    if counts[second_most_common_idx] > counts[most_common_idx] * 0.1:  # 至少是白色的10%
                        most_common_color = tuple(colors[second_most_common_idx])
            
            return most_common_color
        else:
            # 如果没有有效颜色，使用默认的浅灰色
            return (240, 240, 240)

    def create_background_image(self, image_path: str, layers_data: Dict[str, Any], output_path: Optional[str] = None) -> Optional[str]:
        """
        在原图基础上抠掉每个图层的非透明区域，创建背景图
        背景图使用原图非透明部分最常见的颜色填充
        
        Args:
            image_path: 原始图片路径
            layers_data: 图层数据
            output_path: 输出图片路径，如果为None则自动生成
            
        Returns:
            背景图片的保存路径
        """
        try:
            # 打开原始图片
            original_image = Image.open(image_path)
            
            # 转换为RGBA模式以支持透明度
            if original_image.mode != 'RGBA':
                original_image = original_image.convert('RGBA')
            
            # 获取原图中最常见的颜色
            most_common_color = self._get_most_common_color(original_image, layers_data)
            
            # 创建背景图（使用最常见颜色填充）
            img_width, img_height = original_image.size
            
            background_image = Image.new('RGB', (img_width, img_height), most_common_color)
            
            # 检查是否有图层数据
            if "layers" not in layers_data or not layers_data["layers"]:
                return None
            
            # 为每个要素创建透明区域（实际上是保持背景色）
            for i, layer in enumerate(layers_data["layers"]):
                if "position" not in layer or "content" not in layer:
                    continue
                
                pos = layer["position"]
                content = layer["content"]
                
                coords = normalize_to_absolute_coords(pos, img_width, img_height, self.EXPAND_PX)
                if coords is None:
                    continue
                
                x1, y1, x2, y2, x1_exp, y1_exp, x2_exp, y2_exp = coords

                # 创建背景色区域（与背景图颜色相同）
                background_region = Image.new('RGB', (x2_exp - x1_exp, y2_exp - y1_exp), most_common_color)
                
                # 将背景色区域粘贴到背景图上
                background_image.paste(background_region, (x1_exp, y1_exp))
            
            # 生成输出路径
            if output_path is None:
                # 获取原图片所在目录
                original_dir = os.path.dirname(image_path)
                # 创建 layer/cutout 子目录
                layer_dir = os.path.join(original_dir, "layer")
                cutout_dir = os.path.join(layer_dir, "cutout")
                os.makedirs(cutout_dir, exist_ok=True)
                
                # 生成文件名
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                output_path = os.path.join(cutout_dir, f"{base_name}_background.png")
            
            # 保存背景图
            background_image.save(output_path, 'PNG')
            
            return output_path
            
        except Exception as e:
            return None

    def save_individual_layers_with_cutout(self, image_path: str, layers_data: Dict[str, Any], output_dir: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        将每个检测到的要素保存为独立的图片，并进行抠图处理
        
        Args:
            image_path: 原始图片路径
            layers_data: 图层数据
            output_dir: 输出目录，如果为None则使用原图片所在目录的layer子目录
            
        Returns:
            处理结果列表，包含每个要素的保存路径和抠图结果
        """
        logger.info(f"🔄 开始保存图层要素并进行抠图处理...")
        results = []
        
        try:
            # 打开原始图片
            logger.info(f"📖 打开原始图片: {image_path}")
            image = Image.open(image_path)
            img_width, img_height = image.size
            logger.info(f"📐 图片尺寸: {img_width} x {img_height}")
            
            # 确定输出目录
            if output_dir is None:
                # 获取原图片所在目录
                original_dir = os.path.dirname(image_path)
                # 创建 layer 子目录
                output_dir = os.path.join(original_dir, "layer")
            
            logger.info(f"📁 输出目录: {output_dir}")
            # 创建输出目录（如果不存在）
            os.makedirs(output_dir, exist_ok=True)
            
            # 获取原图片文件名（不含扩展名）
            base_name = os.path.splitext(os.path.basename(image_path))[0]
            
            # 检查是否有图层数据
            if "layers" not in layers_data or not layers_data["layers"]:
                logger.warning("⚠️ 没有检测到图层数据")
                return results
            
            layer_count = len(layers_data["layers"])
            logger.info(f"🎯 检测到 {layer_count} 个图层，开始并发处理...")
            
            # 存储裁剪后的图片路径和信息
            layer_info = []
            
            # 为每个要素保存独立图片
            for i, layer in enumerate(layers_data["layers"]):
                logger.info(f"\n--- 处理第 {i+1}/{layer_count} 个图层 ---")
                
                if "position" not in layer or "content" not in layer:
                    logger.warning(f"⚠️ 跳过：图层缺少position或content信息")
                    continue
                
                pos = layer["position"]
                content = layer["content"]
                logger.info(f"📝 图层内容: {content}")
                
                coords = normalize_to_absolute_coords(pos, img_width, img_height, self.EXPAND_PX)
                if coords is None:
                    logger.warning(f"❌ 跳过：坐标无效")
                    continue
                
                x1, y1, x2, y2, x1_exp, y1_exp, x2_exp, y2_exp = coords
                
                logger.debug(f"📍 绝对坐标: ({x1}, {y1}) -> ({x2}, {y2})")
                logger.debug(f"📍 扩展后坐标: ({x1_exp}, {y1_exp}) -> ({x2_exp}, {y2_exp})")

                # 裁剪要素区域（使用扩展后的坐标）
                logger.info("✂️ 裁剪图层区域...")
                cropped_image = image.crop((x1_exp, y1_exp, x2_exp, y2_exp))
                
                # 记录原始裁剪尺寸
                original_crop_width = x2_exp - x1_exp
                original_crop_height = y2_exp - y1_exp
                logger.debug(f"📐 裁剪区域尺寸: {original_crop_width} x {original_crop_height}")
                
                # 生成输出文件名
                # 清理内容名称，移除特殊字符
                safe_content = "".join(c for c in content if c.isalnum() or c in (' ', '-', '_')).rstrip()
                safe_content = safe_content.replace(' ', '_')
                
                output_filename = f"{base_name}_{safe_content}_{i+1}.png"
                output_path = os.path.join(output_dir, output_filename)
                
                logger.info(f"💾 保存图层图片: {output_path}")
                # 保存裁剪后的图片
                cropped_image.save(output_path)
                
                # 计算边界框尺寸
                box_width = x2 - x1
                box_height = y2 - y1
                
                logger.debug(f"📏 图层尺寸: {box_width} x {box_height}")
                
                # 收集图层信息，准备并发处理
                layer_info.append({
                    "index": i,
                    "content": content,
                    "layer_path": output_path,
                    "position": {
                        "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                        "x1_exp": x1_exp, "y1_exp": y1_exp, "x2_exp": x2_exp, "y2_exp": y2_exp
                    },
                    "size": {
                        "width": box_width, 
                        "height": box_height,
                        "crop_width": original_crop_width,
                        "crop_height": original_crop_height
                    }
                })
            
            # 创建线程锁，用于保护打印输出
            print_lock = threading.Lock()
            
            # 定义并发处理函数
            def process_layer_cutout(layer_info):
                layer_idx = layer_info["index"]
                content = layer_info["content"]
                layer_path = layer_info["layer_path"]
                
                with print_lock:
                    logger.info(f"\n🔄 开始并发处理第 {layer_idx+1}/{layer_count} 个图层: {content}")
                
                # 进行抠图处理
                cutout_result = self._process_cutout(layer_path, content)
                
                with print_lock:
                    logger.info(f"✅ 抠图处理完成 [{layer_idx+1}/{layer_count}]: {cutout_result.get('status', 'unknown')}")
                
                # 如果抠图成功，确保尺寸正确
                if cutout_result.get('status') == 'success' and cutout_result.get('cutout_path'):
                    self._resize_cutout_image(
                        cutout_result['cutout_path'], 
                        layer_info["size"]["crop_width"], 
                        layer_info["size"]["crop_height"]
                    )
                
                # 构建完整结果
                result = {**layer_info, "cutout": cutout_result}
                return result
            
            # 使用线程池并发处理抠图任务，限制最大线程数为4
            max_workers = 4  # 限制最大线程数为4
            logger.info(f"\n🚀 启动并发抠图处理，共 {len(layer_info)} 个任务，最大并行数: {max_workers}")
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                # 提交所有抠图任务
                future_to_layer = {
                    executor.submit(process_layer_cutout, info): info 
                    for info in layer_info
                }
                
                # 收集结果
                for future in concurrent.futures.as_completed(future_to_layer):
                    info = future_to_layer[future]
                    try:
                        result = future.result()
                        results.append(result)
                        with print_lock:
                            logger.info(f"✅ 第 {info['index']+1} 个图层 '{info['content']}' 处理完成")
                    except Exception as e:
                        with print_lock:
                            logger.error(f"❌ 第 {info['index']+1} 个图层处理失败: {str(e)}")
                            logger.exception("图层处理失败详细错误信息:")
            
            # 按原始索引排序结果
            results.sort(key=lambda x: x["index"])
            
            logger.info(f"\n🎉 所有图层处理完成，共处理 {len(results)} 个图层")
            return results
            
        except Exception as e:
            logger.error(f"❌ 图层处理过程中发生错误: {str(e)}")
            logger.exception("图层处理过程中发生异常:")
            return results
    
    def _process_cutout(self, layer_path: str, content: str) -> Dict[str, Any]:
        """
        对单个要素进行抠图处理
        
        Args:
            layer_path: 要素图片路径
            content: 要素内容名称
            
        Returns:
            抠图处理结果
        """
        try:
            # 创建线程本地临时文件名，避免多线程冲突
            thread_id = threading.get_ident()
            temp_suffix = f"{thread_id}_{int(time.time() * 1000)}"
            
            # 上传文件并获取预签名URL
            image_url = self.tos_uploader.upload_file_and_get_url(layer_path)
            
            if not image_url:
                return {"status": "upload_failed", "error": "文件上传失败"}
            
            # 运行抠图工作流
            result = self.coze_client.run_cutout_workflow(image_url=image_url)
            
            if "error" in result:
                return {"status": "workflow_failed", "error": result['error']}
            
            # 解析结果并下载图片
            output_url = self.coze_client.parse_workflow_result(result)
            
            if not output_url:
                return {"status": "parse_failed", "error": "解析结果失败"}
            
            # 确定保存目录为 cutout
            save_dir = os.path.join(os.path.dirname(layer_path), "cutout")
            # 确保保存目录存在
            os.makedirs(save_dir, exist_ok=True)
            
            # 下载抠图结果
            saved_path = self.tos_uploader.download_and_save_image(output_url, layer_path, save_dir)
            
            if saved_path:
                # 获取原始图片尺寸
                try:
                    original_img = Image.open(layer_path)
                    original_width, original_height = original_img.size
                    
                    self._resize_cutout_image(saved_path, original_width, original_height)
                    
                except Exception as e:
                    pass
                
                return {
                    "status": "success",
                    "cutout_path": saved_path,
                    "output_url": output_url
                }
            else:
                return {"status": "save_failed", "error": "保存抠图结果失败"}
                
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            return {"status": "exception", "error": str(e), "details": error_details}
    
    def _resize_cutout_image(self, cutout_path: str, target_width: int, target_height: int) -> bool:
        """
        调整抠图结果的尺寸
        
        Args:
            cutout_path: 抠图文件路径
            target_width: 目标宽度
            target_height: 目标高度
            
        Returns:
            调整是否成功
        """
        try:
            # 检查抠图结果尺寸
            cutout_img = Image.open(cutout_path)
            cutout_width, cutout_height = cutout_img.size
            
            # 如果尺寸已匹配，无需调整
            if cutout_width == target_width and cutout_height == target_height:
                return True
                
            # 确保图像为RGBA模式以保留透明度
            if cutout_img.mode != 'RGBA':
                cutout_img = cutout_img.convert('RGBA')
                
            # 使用高质量的LANCZOS重采样方法调整尺寸
            resized_img = cutout_img.resize((target_width, target_height), Image.LANCZOS)
            
            # 保存调整后的图片
            resized_img.save(cutout_path)
            return True
            
        except Exception as e:
            return False
    
    def visualize_layers(self, image_path: str, layers_data: Dict[str, Any], output_path: Optional[str] = None) -> Optional[str]:
        """
        在图片上可视化显示不同要素的范围
        
        Args:
            image_path: 原始图片路径
            layers_data: 图层数据
            output_path: 输出图片路径，如果为None则自动生成
            
        Returns:
            可视化图片的保存路径
        """
        try:
            # 打开原始图片
            image = Image.open(image_path)
            draw = ImageDraw.Draw(image)
            
            # 获取图片尺寸
            img_width, img_height = image.size
            
            # 尝试加载字体，如果失败则使用默认字体
            try:
                font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 16)
            except:
                try:
                    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
                except:
                    font = ImageFont.load_default()
            
            # 检查是否有图层数据
            if "layers" not in layers_data or not layers_data["layers"]:
                return None
            
            # 为每个要素绘制边界框
            for i, layer in enumerate(layers_data["layers"]):
                if "position" not in layer or "content" not in layer:
                    continue
                
                pos = layer["position"]
                content = layer["content"]
                
                coords = normalize_to_absolute_coords(pos, img_width, img_height)
                if coords is None:
                    continue
                
                x1, y1, x2, y2 = coords[:4]  # 只使用基本坐标，不需要扩展坐标
                
                # 选择颜色
                color = self.colors[i % len(self.colors)]
                
                # 绘制矩形边界框
                draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
                
                # 绘制标签背景
                label_text = f"{content}"
                bbox = draw.textbbox((0, 0), label_text, font=font)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
                
                # 标签位置（在边界框上方）
                label_x = x1
                label_y = max(0, y1 - text_height - 5)
                
                # 绘制标签背景
                draw.rectangle([
                    label_x, label_y, 
                    label_x + text_width + 10, label_y + text_height + 5
                ], fill=color)
                
                # 绘制标签文字
                draw.text((label_x + 5, label_y + 2), label_text, fill=(255, 255, 255), font=font)
            
            # 生成输出路径
            if output_path is None:
                # 获取原图片所在目录
                original_dir = os.path.dirname(image_path)
                # 创建 vis 子目录
                vis_dir = os.path.join(original_dir, "vis")
                os.makedirs(vis_dir, exist_ok=True)
                
                # 生成文件名
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                output_path = os.path.join(vis_dir, f"{base_name}_visualized.png")
            
            # 保存可视化结果
            image.save(output_path)
            
            return output_path
            
        except Exception as e:
            return None

def normalize_to_absolute_coords(pos, img_width, img_height, expand_px=0):
    """
    将归一化坐标转换为绝对坐标，并可选地扩展边界框
    
    Args:
        pos (dict): 包含归一化坐标 x1, y1, x2, y2 的字典
        img_width (int): 图像宽度
        img_height (int): 图像高度
        expand_px (int): 边界框向外扩展的像素数，默认为0
        
    Returns:
        tuple: (x1, y1, x2, y2, x1_exp, y1_exp, x2_exp, y2_exp) 绝对坐标和扩展后的坐标，如果坐标无效则返回 None
    """
    # 获取归一化坐标
    x1_norm = pos.get("x1", 0)
    y1_norm = pos.get("y1", 0)
    x2_norm = pos.get("x2", 0)
    y2_norm = pos.get("y2", 0)
    
    # 验证坐标范围
    if not (0 <= x1_norm <= 1 and 0 <= y1_norm <= 1 and 0 <= x2_norm <= 1 and 0 <= y2_norm <= 1):
        return None
    
    # 验证坐标逻辑
    if x1_norm >= x2_norm or y1_norm >= y2_norm:
        return None
    
    # 转换为绝对坐标
    x1 = int(x1_norm * img_width)
    y1 = int(y1_norm * img_height)
    x2 = int(x2_norm * img_width)
    y2 = int(y2_norm * img_height)
    
    # 计算扩展后的坐标
    x1_exp = max(0, x1 - expand_px)
    y1_exp = max(0, y1 - expand_px)
    x2_exp = min(img_width, x2 + expand_px)
    y2_exp = min(img_height, y2 + expand_px)
    
    return x1, y1, x2, y2, x1_exp, y1_exp, x2_exp, y2_exp

def main():
    """
    主函数 - 测试图层分析和抠图功能
    
    运行方法:
    1. 从项目根目录运行: python3 -m server.services.extract_layers_service
    2. 或者直接在当前目录运行: python3 extract_layers_service.py
    """
    import time
    
    # 创建分析器实例
    analyzer = LLMImageAnalyzer()
    
    # 分析本地图片
    local_image_path = "/Users/wangxinyue/Documents/jaaz/server/user_data/files/im_1Rk4ZE5q.png"
    
    if os.path.exists(local_image_path):
        try:
            logger.info("🔍 开始分析图片...")
            start_time = time.time()
            
            # 分析图片
            response = analyzer.analyze_image_layers(local_image_path)
            layers = analyzer.extract_layers_from_response(response)
            
            analysis_time = time.time() - start_time
            logger.info(f"✅ 图片分析完成，耗时: {analysis_time:.2f}秒")
            logger.info(f"🎯 检测到 {len(layers.get('layers', []))} 个图层")
            
            # 可视化结果
            if "error" not in layers:
                # 保存每个要素为独立图片并进行抠图
                logger.info("\n🚀 开始并发抠图处理（最大并行数: 4）...")
                cutout_start_time = time.time()
                
                results = analyzer.save_individual_layers_with_cutout(local_image_path, layers)
                
                cutout_time = time.time() - cutout_start_time
                logger.info(f"✅ 并发抠图处理完成，耗时: {cutout_time:.2f}秒")
                
                # 输出处理结果统计
                success_count = sum(1 for r in results if r["cutout"]["status"] == "success")
                logger.info(f"📊 抠图成功: {success_count}/{len(results)} 个要素")
                
                # 可视化结果
                logger.info("\n🎨 开始创建可视化结果...")
                vis_start_time = time.time()
                
                visualized_path = analyzer.visualize_layers(local_image_path, layers)
                
                vis_time = time.time() - vis_start_time
                logger.info(f"✅ 可视化完成，耗时: {vis_time:.2f}秒")
                if visualized_path:
                    logger.info(f"📄 可视化结果保存在: {visualized_path}")

                # 创建背景图（抠掉所有检测到的图层区域）
                logger.info("\n🖼️ 开始创建背景图...")
                bg_start_time = time.time()
                
                background_path = analyzer.create_background_image(local_image_path, layers)
                
                bg_time = time.time() - bg_start_time
                logger.info(f"✅ 背景图创建完成，耗时: {bg_time:.2f}秒")
                if background_path:
                    logger.info(f"📄 背景图保存在: {background_path}")
                
                # 总结处理时间
                total_time = time.time() - start_time
                logger.info(f"\n⏱️ 总处理时间: {total_time:.2f}秒")
                logger.info(f"  - 图片分析: {analysis_time:.2f}秒")
                logger.info(f"  - 并发抠图 (最大4线程): {cutout_time:.2f}秒")
                logger.info(f"  - 可视化: {vis_time:.2f}秒")
                logger.info(f"  - 背景图创建: {bg_time:.2f}秒")
            else:
                logger.error("❌ 无法进行可视化和保存，因为解析失败")
                logger.error(f"错误信息: {layers.get('error', '未知错误')}")
            
        except Exception as e:
            logger.error(f"❌ 分析本地图片失败: {e}")
            logger.exception("分析本地图片失败详细错误信息:")
    else:
        logger.error(f"❌ 本地图片文件不存在: {local_image_path}")

if __name__ == "__main__":
    # 直接运行主函数，不需要重复添加sys.path，因为已在文件开头处理
    main()