from typing import Optional
import os
import traceback
import asyncio
import time
import hmac
from hashlib import sha1
import base64
import uuid
from .base import ImageGenerator, get_image_info_and_save, generate_image_id
from services.config_service import config_service, FILES_DIR
from utils.http_client import HttpClient


class LiblibaiGenerator(ImageGenerator):
    """LiblibAI星流大模型图像生成器实现"""

    def __init__(self):
        self.base_url = "https://openapi.liblibai.cloud"  # LiblibAI API 基础URL
        # 星流Star-3 Alpha模板ID
        self.star3_template_uuid = "5d7e67009b344550bc1aa6ccbfa1d7f4"

    def _make_sign(self, uri: str) -> tuple[str, str, str]:
        """
        生成签名
        返回: (signature, timestamp, signature_nonce)
        """
        # 获取密钥
        liblibai_config = config_service.app_config.get('liblibai', {})
        secret_key = liblibai_config.get('secret_key', '')
        if not secret_key:
            raise ValueError("图像生成失败：LiblibAI SecretKey未设置")

        # 当前毫秒时间戳
        timestamp = str(int(time.time() * 1000))
        # 随机字符串
        signature_nonce = str(uuid.uuid4())
        
        # 拼接请求数据 - 严格按照官方文档格式
        content = uri + "&" + timestamp + "&" + signature_nonce
        
        # 生成签名 - 按照Java示例的算法
        digest = hmac.new(secret_key.encode('utf-8'), content.encode('utf-8'), sha1).digest()
        
        # 使用Base64 URL安全编码，不包含填充符（与Java的encodeBase64URLSafeString一致）
        signature = base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')
        
        return signature, timestamp, signature_nonce

    def _prepare_headers(self, uri: str) -> dict:
        """准备请求头，只包含基本头信息"""        
        return {
            "Content-Type": "application/json",
            "User-Agent": "Jaaz/1.0.0"
        }

    def _build_url_with_auth(self, uri: str) -> str:
        """构建包含认证参数的完整URL"""
        # 获取AccessKey
        liblibai_config = config_service.app_config.get('liblibai', {})
        access_key = liblibai_config.get('access_key', '')
        if not access_key:
            raise ValueError("图像生成失败：LiblibAI AccessKey未设置")

        # 生成签名
        signature, timestamp, signature_nonce = self._make_sign(uri)
        
        # 构建包含认证参数的完整URL
        url = f"{self.base_url}{uri}?AccessKey={access_key}&Signature={signature}&Timestamp={timestamp}&SignatureNonce={signature_nonce}"
        
        return url

    def _convert_aspect_ratio_to_size(self, aspect_ratio: str) -> dict:
        """将纵横比转换为具体的图片尺寸"""
        size_map = {
            "1:1": {"width": 1024, "height": 1024},
            "16:9": {"width": 1344, "height": 768},
            "9:16": {"width": 768, "height": 1344},
            "3:4": {"width": 896, "height": 1152},
            "4:3": {"width": 1152, "height": 896},
            "3:2": {"width": 1216, "height": 832},
            "2:3": {"width": 832, "height": 1216}
        }
        
        return size_map.get(aspect_ratio, {"width": 1024, "height": 1024})

    def _get_aspect_ratio_name(self, aspect_ratio: str) -> str:
        """将纵横比转换为LiblibAI API支持的aspectRatio参数"""
        ratio_name_map = {
            "1:1": "square",
            "16:9": "landscape", 
            "9:16": "portrait",
            "3:4": "portrait",
            "4:3": "landscape",
            "3:2": "landscape",
            "2:3": "portrait"
        }
        
        return ratio_name_map.get(aspect_ratio, "square")
        
    async def generate(
        self,
        prompt: str,
        model: str,
        aspect_ratio: str = "1:1",
        input_image: Optional[str] = None,
        **kwargs
    ) -> tuple:
        try:
            # 构建生成参数 - 只使用aspectRatio，移除imageSize避免参数冲突
            aspect_ratio_name = self._get_aspect_ratio_name(aspect_ratio)
            
            # 检测是否包含中文文字生成需求
            has_chinese_text = self._detect_chinese_text_need(prompt)
            
            # 如果包含中文文字，优化提示词
            if has_chinese_text:
                prompt = self._optimize_chinese_text_prompt(prompt)
                print(f"🈳 检测到中文文字生成需求，已优化提示词")
            
            generate_params = {
                "prompt": prompt,
                "aspectRatio": aspect_ratio_name,
                "imgCount": kwargs.get("img_count", 1),
                "steps": kwargs.get("steps", 40 if has_chinese_text else 30),  # 中文文字需要更多步数
            }

            # 处理负面提示词
            negative_prompt = kwargs.get("negative_prompt", "")
            if has_chinese_text:
                # 为中文文字生成添加专门的负面提示词
                chinese_negative = "blurry text, distorted characters, illegible text, broken strokes, overlapping text, malformed characters, watermark, signature, username, artist name, copyright, logo, text artifacts, unreadable font, pixelated text, corrupted text"
                if negative_prompt:
                    negative_prompt = f"{negative_prompt}, {chinese_negative}"
                else:
                    negative_prompt = chinese_negative
            
            if negative_prompt:
                generate_params["negativePrompt"] = negative_prompt

            # 如果有输入图像，添加ControlNet参数
            if input_image:
                generate_params["controlnet"] = {
                    "controlType": kwargs.get("control_type", "depth"),
                    "controlImage": input_image
                }

            # 构建请求数据
            data = {
                "templateUuid": self.star3_template_uuid,
                "generateParams": generate_params
            }

            print(f"🎨 开始使用LiblibAI星流Star-3 Alpha生成图像，提示词: {prompt[:50]}...")
            print(f"📐 使用纵横比: {aspect_ratio} -> {aspect_ratio_name}")

            # 发起生成请求
            generate_uuid = await self._create_generation_task(data)
            
            # 等待生成完成
            image_url = await self._wait_for_completion(generate_uuid)
            
            # 下载并保存图像
            image_id = generate_image_id()
            print(f'🦄 图像生成完成，image_id: {image_id}')

            mime_type, width, height, extension = await get_image_info_and_save(
                image_url, os.path.join(FILES_DIR, f'{image_id}')
            )
            filename = f'{image_id}.{extension}'
            return mime_type, width, height, filename

        except Exception as e:
            print(f'LiblibAI图像生成错误: {e}')
            traceback.print_exc()
            raise e
    
    def _detect_chinese_text_need(self, prompt: str) -> bool:
        """检测是否需要生成中文文字"""
        import re
        
        # 检测中文字符
        chinese_chars = re.findall(r'[\u4e00-\u9fff]', prompt)
        
        # 检测文字生成相关关键词
        text_keywords = ['标题', '文字', '字体', '海报', '横幅', 'banner', 'poster', 'title', 'text', '书法', '字', '题字']
        
        # 如果包含中文字符且包含文字相关关键词，则认为需要生成中文文字
        has_chinese = len(chinese_chars) > 0
        has_text_keywords = any(keyword in prompt.lower() for keyword in text_keywords)
        
        return has_chinese and has_text_keywords
    
    def _optimize_chinese_text_prompt(self, prompt: str) -> str:
        """优化中文文字生成的提示词"""
        # 添加文字质量增强关键词
        quality_enhancers = [
            "high quality typography",
            "clear readable Chinese text", 
            "professional font design",
            "sharp text details",
            "perfect character strokes",
            "clean typography layout"
        ]
        
        # 将质量增强词添加到提示词末尾
        enhanced_prompt = f"{prompt}, {', '.join(quality_enhancers)}"
        
        return enhanced_prompt

    async def _create_generation_task(self, data: dict) -> str:
        """创建星流Star-3 Alpha图像生成任务"""
        uri = "/api/generate/webui/text2img/ultra"
        url = self._build_url_with_auth(uri)
        headers = self._prepare_headers(uri)
        
        async with HttpClient.create() as client:
            response = await client.post(url, headers=headers, json=data)
            result = response.json()
            
            if response.status_code != 200:
                error_msg = result.get('msg', result.get('error', '未知错误'))
                raise Exception(f'LiblibAI API请求失败: {error_msg}')
            
            # 检查API返回的code字段
            if result.get('code') != 0:
                error_msg = result.get('msg', 'API返回错误')
                raise Exception(f'LiblibAI API返回错误: {error_msg}')
            
            # 从data字段中获取generateUuid
            data_obj = result.get('data', {})
            generate_uuid = data_obj.get('generateUuid')
            
            if not generate_uuid:
                raise Exception('LiblibAI API响应中未找到generateUuid')
                
            print(f"🎯 LiblibAI星流Star-3 Alpha生成任务已创建，generateUuid: {generate_uuid}")
            return generate_uuid

    async def _wait_for_completion(self, generate_uuid: str, max_wait_time: int = 300) -> str:
        """等待星流Star-3 Alpha图像生成完成"""
        # 根据官方文档，查询生图结果的API端点
        uri = "/api/generate/webui/status"
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            url = self._build_url_with_auth(uri)
            headers = self._prepare_headers(uri)
            
            # 请求体需要包含generateUuid
            query_data = {
                "generateUuid": generate_uuid
            }
            
            async with HttpClient.create() as client:
                response = await client.post(url, headers=headers, json=query_data)
                result = response.json()
                
                if response.status_code != 200:
                    error_msg = result.get('msg', '查询任务状态失败')
                    raise Exception(f'LiblibAI任务查询失败: {error_msg}')
                
                # 检查API返回的code字段
                if result.get('code') != 0:
                    error_msg = result.get('msg', '查询任务状态失败')
                    raise Exception(f'LiblibAI任务查询失败: {error_msg}')
                
                data = result.get('data', {})
                status = data.get('generateStatus')
                progress = data.get('percentCompleted', 0)
                message = data.get('generateMsg', '')
                
                # 根据官方文档显示状态
                status_desc = {
                    1: "等待执行",
                    2: "执行中", 
                    3: "已生图",
                    4: "审核中",
                    5: "成功",
                    6: "失败",
                    7: "超时"
                }.get(status, f"未知状态({status})")
                
                # 只在关键状态变化时输出信息
                if status in [2, 3, 4]:  # 执行中、已生图、审核中
                    if progress > 0:
                        print(f"🔄 {status_desc}, 进度: {progress*100:.0f}%")
                    else:
                        print(f"🔄 {status_desc}")
                elif status == 1:  # 等待执行
                    print(f"⏳ {status_desc}")
                
                # 状态5：成功 - 可以获取图片
                if status == 5:
                    images = data.get('images', [])
                    if images and len(images) > 0:
                        # 获取第一张图片的URL
                        image_url = images[0].get('imageUrl', '')
                        if image_url:
                            print(f"✅ 图片生成成功")
                            return image_url
                    else:
                        raise Exception('LiblibAI生成完成但未找到图像')
                
                # 状态6：失败
                elif status == 6:
                    error_msg = message or '生成失败'
                    raise Exception(f'LiblibAI图像生成失败: {error_msg}')
                
                # 状态7：超时
                elif status == 7:
                    error_msg = message or '任务超时'
                    raise Exception(f'LiblibAI图像生成超时: {error_msg}')
                
                # 状态1,2,3,4：进行中 - 继续等待
                elif status in [1, 2, 3, 4]:
                    await asyncio.sleep(3)  # 等待3秒后重试
                    continue
                
                # 未知状态
                else:
                    raise Exception(f'LiblibAI未知任务状态: {status} ({status_desc})')
        
        raise Exception('LiblibAI图像生成等待超时')

    def _parse_aspect_ratio(self, aspect_ratio: str) -> tuple[int, int]:
        """解析纵横比参数（保留向后兼容）"""
        size = self._convert_aspect_ratio_to_size(aspect_ratio)
        return size["width"], size["height"]

    @staticmethod
    def get_available_models() -> list[dict]:
        """获取可用的模型列表"""
        return [
            {
                "id": "star-3-alpha",
                "name": "星流Star-3 Alpha",
                "description": "LiblibAI星流Star-3 Alpha文生图模型，支持高质量图像生成"
            }
        ]

    @staticmethod
    def get_supported_aspects() -> list[str]:
        """获取支持的纵横比"""
        return ["1:1", "16:9", "9:16", "3:4", "4:3", "3:2", "2:3"] 