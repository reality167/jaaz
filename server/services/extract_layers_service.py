import json
import base64
from typing import Dict, List, Any, Optional, Union
import os
import time
import requests
import tos
from PIL import Image, ImageDraw, ImageFont
from openai import OpenAI

# 尝试加载环境变量
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

class CozeWorkflowClient:
    def __init__(self, api_token: str):
        """
        初始化Coze工作流客户端
        
        Args:
            api_token: Coze API令牌
        """
        self.api_token = api_token
        self.base_url = "https://api.coze.cn/v1"
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
    
    def run_workflow(self, workflow_id: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        运行工作流
        
        Args:
            workflow_id: 工作流ID
            parameters: 工作流参数
            
        Returns:
            响应数据
        """
        url = f"{self.base_url}/workflow/run"
        payload = {
            "workflow_id": workflow_id,
            "parameters": parameters
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=payload, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                return result
            else:
                return {"error": response.text, "status_code": response.status_code}
                
        except requests.exceptions.RequestException as e:
            return {"error": str(e)}
        except json.JSONDecodeError as e:
            return {"error": f"JSON解析错误: {e}"}
    
    def run_cutout_workflow(self, image_url: str) -> Dict[str, Any]:
        """
        运行抠图工作流
        
        Args:
            image_url: 图片URL
            
        Returns:
            响应数据
        """
        workflow_id = "7526719168868237347"
        parameters = {
            "input": image_url
        }
        
        return self.run_workflow(workflow_id, parameters)
    
    def parse_workflow_result(self, result: Dict[str, Any]) -> Optional[str]:
        """
        解析工作流返回的结果，提取output URL
        
        Args:
            result: 工作流返回的结果
            
        Returns:
            解析出的output URL，失败时返回None
        """
        try:
            if "error" in result:
                return None
            
            if "data" not in result:
                return None
            
            # 检查data字段是否为字符串（JSON字符串）
            data = result["data"]
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except json.JSONDecodeError:
                    return None
            
            if "output" not in data:
                return None
            
            output_url = data["output"]
            return output_url
            
        except Exception as e:
            return None

class TOSUploader:
    def __init__(self, ak: str, sk: str, endpoint: str, region: str, bucket_name: str):
        """
        初始化TOS上传器
        
        Args:
            ak: 访问密钥ID
            sk: 访问密钥Secret
            endpoint: TOS端点
            region: 区域
            bucket_name: 存储桶名称
        """
        self.ak = ak
        self.sk = sk
        self.endpoint = endpoint
        self.region = region
        self.bucket_name = bucket_name
        
    def upload_file_and_get_url(self, local_file_path: str) -> Optional[str]:
        """
        上传文件到TOS并获取预签名URL
        
        Args:
            local_file_path: 本地文件路径
            
        Returns:
            预签名URL，失败时返回None
        """
        try:
            # 检查文件是否存在
            if not os.path.exists(local_file_path):
                return None
            
            # 从文件路径中提取文件名，并添加时间戳
            file_basename = os.path.basename(local_file_path)
            name_without_ext = os.path.splitext(file_basename)[0]
            file_ext = os.path.splitext(file_basename)[1]
            timestamp = int(time.time())
            object_key = f"{name_without_ext}_{timestamp}{file_ext}"
            
            # 创建TOS客户端
            client = tos.TosClientV2(self.ak, self.sk, self.endpoint, self.region)
            
            # 上传文件
            client.put_object_from_file(self.bucket_name, object_key, local_file_path)
            
            # 生成下载文件的预签名URL，有效时间为3600s
            download_url = client.pre_signed_url(
                tos.HttpMethodType.Http_Method_Get, 
                bucket=self.bucket_name, 
                key=object_key, 
                expires=3600
            )
            
            return download_url.signed_url
            
        except tos.exceptions.TosClientError as e:
            return None
        except tos.exceptions.TosServerError as e:
            return None
        except Exception as e:
            return None
    
    def download_and_save_image(self, image_url: str, original_file_path: str, save_dir: Optional[str] = None) -> Optional[str]:
        """
        下载图片并保存到本地
        
        Args:
            image_url: 图片URL
            original_file_path: 原始文件路径（用于生成保存文件名）
            save_dir: 保存目录，默认为原始文件所在目录
            
        Returns:
            保存的文件路径，失败时返回None
        """
        try:
            # 下载图片
            response = requests.get(image_url, timeout=30)
            
            if response.status_code != 200:
                return None
            
            # 确定保存目录
            if save_dir is None:
                save_dir = os.path.dirname(original_file_path)
            
            # 确保保存目录存在
            os.makedirs(save_dir, exist_ok=True)
            
            # 生成保存文件名
            original_basename = os.path.basename(original_file_path)
            name_without_ext = os.path.splitext(original_basename)[0]
            save_filename = f"{name_without_ext}_cutout.png"
            save_path = os.path.join(save_dir, save_filename)
            
            # 保存文件
            with open(save_path, 'wb') as f:
                f.write(response.content)
            
            return save_path
            
        except requests.exceptions.RequestException as e:
            return None
        except Exception as e:
            return None

class LLMImageAnalyzer:
    def __init__(self, base_url: str = "https://ark.cn-beijing.volces.com/api/v3"):
        """
        初始化LLM图片分析器
        
        Args:
            base_url: API基础URL
        """
        # 直接使用写死的API密钥
        api_key = "4cdaf093-d604-4407-a979-a978d3090afa"
        
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
            print("⚠️  警告: COZE_API_TOKEN 环境变量未设置")
        if not ak or not sk:
            print("⚠️  警告: VOLCENGINE_ACCESS_KEY 或 VOLCENGINE_SECRET_KEY 环境变量未设置")
        
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
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    
    def analyze_image_layers(self, image_path: str, prompt: Optional[str] = None) -> Dict[str, Any]:
        """
        分析图片并提取图层要素坐标
        
        Args:
            image_path: 图片文件路径（本地文件或URL）
            prompt: 自定义提示词
            
        Returns:
            LLM响应的JSON数据
        """
        print(f"🔍 开始分析图片: {image_path}")
        
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
            print("🌐 处理网络图片...")
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": image_path
                }
            })
        else:
            # 本地图片
            print("📁 处理本地图片...")
            if not os.path.exists(image_path):
                raise FileNotFoundError(f"图片文件不存在: {image_path}")
            
            # 获取图片MIME类型
            mime_type = self._get_mime_type(image_path)
            print(f"📄 图片MIME类型: {mime_type}")
            
            print("🔄 编码图片为base64...")
            base64_image = self.encode_image_to_base64(image_path)
            print(f"✅ 图片编码完成，base64长度: {len(base64_image)}")
            
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{base64_image}"
                }
            })
        
        try:
            print("🚀 发送请求到豆包VLM API...")
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
            
            print("✅ 豆包VLM API响应成功")
            
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
            print(f"❌ 豆包VLM API请求失败: {str(e)}")
            raise Exception(f"API请求失败: {str(e)}")
    
    def _get_mime_type(self, file_path: str) -> str:
        """
        根据文件扩展名获取MIME类型
        
        Args:
            file_path: 文件路径
            
        Returns:
            MIME类型字符串
        """
        ext = os.path.splitext(file_path)[1].lower()
        mime_types = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.webp': 'image/webp'
        }
        return mime_types.get(ext, 'image/jpeg')
    
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
        
        # 创建掩码，标记需要排除的区域
        img_width, img_height = image.size
        mask = Image.new('L', (img_width, img_height), 255)  # 255表示保留，0表示排除
        
        # 根据图层数据标记需要排除的区域
        excluded_pixels = 0
        if "layers" in layers_data and layers_data["layers"]:
            draw = ImageDraw.Draw(mask)
            
            for layer in layers_data["layers"]:
                if "position" not in layer:
                    continue
                
                pos = layer["position"]
                
                # 获取归一化坐标
                x1_norm = pos.get("x1", 0)
                y1_norm = pos.get("y1", 0)
                x2_norm = pos.get("x2", 0)
                y2_norm = pos.get("y2", 0)
                
                # 验证坐标范围
                if not (0 <= x1_norm <= 1 and 0 <= y1_norm <= 1 and 0 <= x2_norm <= 1 and 0 <= y2_norm <= 1):
                    continue
                
                # 验证坐标逻辑
                if x1_norm >= x2_norm or y1_norm >= y2_norm:
                    continue
                
                # 转换为绝对坐标
                x1 = int(x1_norm * img_width)
                y1 = int(y1_norm * img_height)
                x2 = int(x2_norm * img_width)
                y2 = int(y2_norm * img_height)

                # 向外扩展像素
                expand_px = 4
                x1_exp = max(0, x1 - expand_px)
                y1_exp = max(0, y1 - expand_px)
                x2_exp = min(img_width, x2 + expand_px)
                y2_exp = min(img_height, y2 + expand_px)

                # 在掩码上标记排除区域（黑色）
                draw.rectangle([x1_exp, y1_exp, x2_exp, y2_exp], fill=0)
                excluded_pixels += (x2_exp - x1_exp) * (y2_exp - y1_exp)
        
        # 获取所有像素的颜色和对应的掩码值
        pixels = list(image.getdata())
        mask_pixels = list(mask.getdata())
        
        # 统计颜色出现次数（只统计非排除区域）
        color_counts = {}
        valid_pixels = 0
        for i, pixel in enumerate(pixels):
            # 只统计掩码值为255（保留）的像素
            if mask_pixels[i] == 255:
                valid_pixels += 1
                if pixel not in color_counts:
                    color_counts[pixel] = 0
                color_counts[pixel] += 1
        
        # 找到出现次数最多的颜色
        if color_counts:
            most_common_color = max(color_counts.items(), key=lambda x: x[1])
            
            # 如果最常见的颜色是白色，尝试找到第二常见的非白色颜色
            if most_common_color[0] == (255, 255, 255):
                non_white_colors = [(color, count) for color, count in color_counts.items() if color != (255, 255, 255)]
                if non_white_colors:
                    second_most_common = max(non_white_colors, key=lambda x: x[1])
                    # 如果第二常见的颜色出现次数足够多，使用它
                    if second_most_common[1] > most_common_color[1] * 0.1:  # 至少是白色的10%
                        most_common_color = second_most_common
            
            return most_common_color[0]
        else:
            # 如果没有有效颜色，使用默认的浅灰色
            most_common_color = (240, 240, 240)
            return most_common_color

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
            
            # 调试：保存掩码图像
            try:
                debug_dir = os.path.join(os.path.dirname(image_path), "debug")
                os.makedirs(debug_dir, exist_ok=True)
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                
                # 创建掩码用于调试
                mask = Image.new('L', (img_width, img_height), 255)
                if "layers" in layers_data and layers_data["layers"]:
                    draw = ImageDraw.Draw(mask)
                    for layer in layers_data["layers"]:
                        if "position" not in layer:
                            continue
                        pos = layer["position"]
                        x1_norm, y1_norm, x2_norm, y2_norm = pos.get("x1", 0), pos.get("y1", 0), pos.get("x2", 0), pos.get("y2", 0)
                        if 0 <= x1_norm <= 1 and 0 <= y1_norm <= 1 and 0 <= x2_norm <= 1 and 0 <= y2_norm <= 1 and x1_norm < x2_norm and y1_norm < y2_norm:
                            x1, y1, x2, y2 = int(x1_norm * img_width), int(y1_norm * img_height), int(x2_norm * img_width), int(y2_norm * img_height)
                            expand_px = 4
                            x1_exp, y1_exp = max(0, x1 - expand_px), max(0, y1 - expand_px)
                            x2_exp, y2_exp = min(img_width, x2 + expand_px), min(img_height, y2 + expand_px)
                            draw.rectangle([x1_exp, y1_exp, x2_exp, y2_exp], fill=0)
                
                mask_path = os.path.join(debug_dir, f"{base_name}_mask.png")
                mask.save(mask_path)
            except Exception as e:
                pass
            
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
                
                # 获取归一化坐标
                x1_norm = pos.get("x1", 0)
                y1_norm = pos.get("y1", 0)
                x2_norm = pos.get("x2", 0)
                y2_norm = pos.get("y2", 0)
                
                # 验证坐标范围
                if not (0 <= x1_norm <= 1 and 0 <= y1_norm <= 1 and 0 <= x2_norm <= 1 and 0 <= y2_norm <= 1):
                    continue
                
                # 验证坐标逻辑
                if x1_norm >= x2_norm or y1_norm >= y2_norm:
                    continue
                
                # 转换为绝对坐标
                x1 = int(x1_norm * img_width)
                y1 = int(y1_norm * img_height)
                x2 = int(x2_norm * img_width)
                y2 = int(y2_norm * img_height)

                # 向外扩展像素
                expand_px = 4  # 可根据需要调整扩展像素数
                x1_exp = max(0, x1 - expand_px)
                y1_exp = max(0, y1 - expand_px)
                x2_exp = min(img_width, x2 + expand_px)
                y2_exp = min(img_height, y2 + expand_px)

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
        print(f"🔄 开始保存图层要素并进行抠图处理...")
        results = []
        
        try:
            # 打开原始图片
            print(f"📖 打开原始图片: {image_path}")
            image = Image.open(image_path)
            img_width, img_height = image.size
            print(f"📐 图片尺寸: {img_width} x {img_height}")
            
            # 确定输出目录
            if output_dir is None:
                # 获取原图片所在目录
                original_dir = os.path.dirname(image_path)
                # 创建 layer 子目录
                output_dir = os.path.join(original_dir, "layer")
            
            print(f"📁 输出目录: {output_dir}")
            # 创建输出目录（如果不存在）
            os.makedirs(output_dir, exist_ok=True)
            
            # 获取原图片文件名（不含扩展名）
            base_name = os.path.splitext(os.path.basename(image_path))[0]
            
            # 检查是否有图层数据
            if "layers" not in layers_data or not layers_data["layers"]:
                print("⚠️ 没有检测到图层数据")
                return results
            
            layer_count = len(layers_data["layers"])
            print(f"🎯 检测到 {layer_count} 个图层，开始逐个处理...")
            
            # 为每个要素保存独立图片并进行抠图
            for i, layer in enumerate(layers_data["layers"]):
                print(f"\n--- 处理第 {i+1}/{layer_count} 个图层 ---")
                
                if "position" not in layer or "content" not in layer:
                    print(f"⚠️ 跳过：图层缺少position或content信息")
                    continue
                
                pos = layer["position"]
                content = layer["content"]
                print(f"📝 图层内容: {content}")
                
                # 获取归一化坐标
                x1_norm = pos.get("x1", 0)
                y1_norm = pos.get("y1", 0)
                x2_norm = pos.get("x2", 0)
                y2_norm = pos.get("y2", 0)
                
                print(f"📍 归一化坐标: ({x1_norm:.3f}, {y1_norm:.3f}) -> ({x2_norm:.3f}, {y2_norm:.3f})")
                
                # 验证坐标范围
                if not (0 <= x1_norm <= 1 and 0 <= y1_norm <= 1 and 0 <= x2_norm <= 1 and 0 <= y2_norm <= 1):
                    print(f"❌ 跳过：坐标超出范围")
                    continue
                
                # 验证坐标逻辑
                if x1_norm >= x2_norm or y1_norm >= y2_norm:
                    print(f"❌ 跳过：坐标逻辑错误")
                    continue
                
                # 转换为绝对坐标
                x1 = int(x1_norm * img_width)
                y1 = int(y1_norm * img_height)
                x2 = int(x2_norm * img_width)
                y2 = int(y2_norm * img_height)
                
                print(f"📍 绝对坐标: ({x1}, {y1}) -> ({x2}, {y2})")

                # 向外扩展像素
                expand_px = 4  # 可根据需要调整扩展像素数
                x1_exp = max(0, x1 - expand_px)
                y1_exp = max(0, y1 - expand_px)
                x2_exp = min(img_width, x2 + expand_px)
                y2_exp = min(img_height, y2 + expand_px)
                
                print(f"📍 扩展后坐标: ({x1_exp}, {y1_exp}) -> ({x2_exp}, {y2_exp})")

                # 裁剪要素区域（使用扩展后的坐标）
                print("✂️ 裁剪图层区域...")
                cropped_image = image.crop((x1_exp, y1_exp, x2_exp, y2_exp))
                
                # 生成输出文件名
                # 清理内容名称，移除特殊字符
                safe_content = "".join(c for c in content if c.isalnum() or c in (' ', '-', '_')).rstrip()
                safe_content = safe_content.replace(' ', '_')
                
                output_filename = f"{base_name}_{safe_content}_{i+1}.png"
                output_path = os.path.join(output_dir, output_filename)
                
                print(f"💾 保存图层图片: {output_path}")
                # 保存裁剪后的图片
                cropped_image.save(output_path)
                
                # 计算边界框尺寸
                box_width = x2 - x1
                box_height = y2 - y1
                
                print(f"📏 图层尺寸: {box_width} x {box_height}")
                
                # 进行抠图处理
                print("🎨 开始抠图处理...")
                cutout_result = self._process_cutout(output_path, content)
                print(f"✅ 抠图处理完成: {cutout_result.get('status', 'unknown')}")
                
                result = {
                    "content": content,
                    "layer_path": output_path,
                    "position": {
                        "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                        "x1_exp": x1_exp, "y1_exp": y1_exp, "x2_exp": x2_exp, "y2_exp": y2_exp
                    },
                    "size": {"width": box_width, "height": box_height},
                    "cutout": cutout_result
                }
                
                results.append(result)
                print(f"✅ 第 {i+1} 个图层处理完成")
            
            print(f"\n🎉 所有图层处理完成，共处理 {len(results)} 个图层")
            return results
            
        except Exception as e:
            print(f"❌ 图层处理过程中发生错误: {str(e)}")
            import traceback
            print(f"错误详情: {traceback.format_exc()}")
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
        print(f"🎨 开始抠图处理: {content}")
        try:
            # 上传文件并获取预签名URL
            print("☁️ 上传文件到TOS云存储...")
            image_url = self.tos_uploader.upload_file_and_get_url(layer_path)
            
            if not image_url:
                print("❌ 文件上传失败")
                return {"status": "upload_failed", "error": "文件上传失败"}
            
            print(f"✅ 文件上传成功，URL: {image_url[:50]}...")
            
            # 运行抠图工作流
            print("🔄 调用Coze抠图工作流...")
            result = self.coze_client.run_cutout_workflow(image_url=image_url)
            
            if "error" in result:
                print(f"❌ 抠图工作流失败: {result['error']}")
                return {"status": "workflow_failed", "error": result['error']}
            
            print("✅ 抠图工作流执行成功")
            
            # 解析结果并下载图片
            print("🔍 解析工作流结果...")
            output_url = self.coze_client.parse_workflow_result(result)
            
            if not output_url:
                print("❌ 解析结果失败")
                return {"status": "parse_failed", "error": "解析结果失败"}
            
            print(f"✅ 解析成功，输出URL: {output_url[:50]}...")
            
            # 确定保存目录为 cutout
            save_dir = os.path.join(os.path.dirname(layer_path), "cutout")
            # 确保保存目录存在
            os.makedirs(save_dir, exist_ok=True)
            print(f"📁 抠图保存目录: {save_dir}")
            
            print("⬇️ 下载抠图结果...")
            saved_path = self.tos_uploader.download_and_save_image(output_url, layer_path, save_dir)
            
            if saved_path:
                print(f"✅ 抠图结果保存成功: {saved_path}")
                return {
                    "status": "success",
                    "cutout_path": saved_path,
                    "output_url": output_url
                }
            else:
                print("❌ 保存抠图结果失败")
                return {"status": "save_failed", "error": "保存抠图结果失败"}
                
        except Exception as e:
            print(f"❌ 抠图处理异常: {str(e)}")
            return {"status": "exception", "error": str(e)}
    
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
                
                # 获取归一化坐标（左上角和右下角）
                x1_norm = pos.get("x1", 0)
                y1_norm = pos.get("y1", 0)
                x2_norm = pos.get("x2", 0)
                y2_norm = pos.get("y2", 0)
                
                # 验证坐标范围
                if not (0 <= x1_norm <= 1 and 0 <= y1_norm <= 1 and 0 <= x2_norm <= 1 and 0 <= y2_norm <= 1):
                    continue
                
                # 验证坐标逻辑
                if x1_norm >= x2_norm or y1_norm >= y2_norm:
                    continue
                
                # 转换为绝对坐标
                x1 = int(x1_norm * img_width)
                y1 = int(y1_norm * img_height)
                x2 = int(x2_norm * img_width)
                y2 = int(y2_norm * img_height)
                
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

def main():
    """
    主函数
    """
    # 创建分析器实例（API密钥已写死）
    analyzer = LLMImageAnalyzer()
    
    # 分析本地图片
    local_image_path = "/Users/wangxinyue/Documents/jaaz/temp/images/original/4.png"
    
    if os.path.exists(local_image_path):
        try:
            # 分析图片
            response = analyzer.analyze_image_layers(local_image_path)
            layers = analyzer.extract_layers_from_response(response)
            
            print("分析结果:")
            print(json.dumps(layers, ensure_ascii=False, indent=2))
            
            # 可视化结果
            if "error" not in layers:
                # 保存每个要素为独立图片并进行抠图
                results = analyzer.save_individual_layers_with_cutout(local_image_path, layers)
                print(f"要素处理和抠图完成，共处理 {len(results)} 个要素")
                
                # 输出处理结果统计
                success_count = sum(1 for r in results if r["cutout"]["status"] == "success")
                print(f"抠图成功: {success_count}/{len(results)} 个要素")
                
                for result in results:
                    status_icon = "✅" if result["cutout"]["status"] == "success" else "❌"
                    print(f"{status_icon} {result['content']}: {result['cutout']['status']}")
                    if result["cutout"]["status"] == "success":
                        print(f"   抠图路径: {result['cutout']['cutout_path']}")
                
                # 可视化结果
                visualized_path = analyzer.visualize_layers(local_image_path, layers)
                if visualized_path:
                    print(f"可视化完成，结果保存在: {visualized_path}")

                # 创建背景图（抠掉所有检测到的图层区域）
                print("\n开始创建背景图...")
                background_path = analyzer.create_background_image(local_image_path, layers)
                if background_path:
                    print(f"✅ 背景图已创建，结果保存在: {background_path}")
                else:
                    print("❌ 背景图创建失败")
            else:
                print("无法进行可视化和保存，因为解析失败")
            
        except Exception as e:
            print(f"分析本地图片失败: {e}")
    else:
        print(f"本地图片文件不存在: {local_image_path}")

if __name__ == "__main__":
    main()