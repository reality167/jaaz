from typing import Optional
import os
import traceback
import base64
from .base import ImageGenerator, get_image_info_and_save, generate_image_id
from services.config_service import config_service, FILES_DIR
from openai import OpenAI, OpenAIError

# 添加对volcenginesdkarkruntime的条件导入
try:
    from volcenginesdkarkruntime import Ark
    HAS_ARK_SDK = True
except ImportError:
    HAS_ARK_SDK = False
    print("Warning: volcenginesdkarkruntime not installed. Some features may not work.")

class VolcesImageGenerator(ImageGenerator):
    """Volceengine image generator implementation"""

    async def generate(
        self,
        prompt: str,
        model: str,
        aspect_ratio: str = "1:1",
        input_image: Optional[str] = None,
        **kwargs
    ) -> tuple[str, int, int, str]:
        try:
            api_key = config_service.app_config.get(
                'volces', {}).get('api_key', '')
            url = config_service.app_config.get('volces', {}).get('url', '')
            model = model.replace('volces/', '')

            # 检查是否安装了Ark SDK
            if not HAS_ARK_SDK:
                raise ImportError("volcenginesdkarkruntime library is required for Volces API. Please install it with 'pip install volcenginesdkarkruntime[ark]'")
            
            # 初始化Ark客户端
            ark_client = Ark(
                base_url=url,
                api_key=api_key
            )

            if input_image and model == "doubao-seededit-3-0-i2i-250628":
                # 图像编辑模式
                # 设置默认参数
                seed = kwargs.get("seed", 123)
                guidance_scale = kwargs.get("guidance_scale", 5.5)
                size = kwargs.get("size", "adaptive")  # 使用adaptive自适应大小
                watermark = kwargs.get("watermark", False)
                
                # 调用图像编辑API
                result = ark_client.images.generate(
                    model=model,
                    prompt=prompt,
                    image=input_image,  # 传递图像文件路径
                    seed=seed,
                    guidance_scale=guidance_scale,
                    size=size,
                    watermark=watermark
                )
            elif input_image:
                # 其他图像编辑模型的实现可以在这里添加
                raise NotImplementedError(f"Image editing for model {model} is not implemented yet.")
            else:
                # 文生图模式 - 使用Ark SDK
                # Process ratio for size
                w_ratio, h_ratio = map(int, aspect_ratio.split(':'))
                factor = (1024 ** 2 / (w_ratio * h_ratio)) ** 0.5
                width = int((factor * w_ratio) / 64) * 64
                height = int((factor * h_ratio) / 64) * 64
                
                # 调用文生图API
                result = ark_client.images.generate(
                    model=model,
                    prompt=prompt,
                    size=kwargs.get("size", f"{width}x{height}"),
                    watermark=kwargs.get("watermark", False)
                )
            
            if not result or not result.data or len(result.data) == 0:
                raise ValueError("No image data returned from Volces Ark API")
            
            image_url = result.data[0].url

            # 处理结果
            image_id = generate_image_id()
            mime_type, width, height, extension = await get_image_info_and_save(
                image_url, os.path.join(FILES_DIR, f'{image_id}'), is_b64=False
            )

            # Ensure mime_type is not None
            if mime_type is None:
                mime_type = "image/png"  # Default to PNG if mime_type is None

            filename = f'{image_id}.{extension}'
            return mime_type, width, height, filename

        except Exception as e:
            print('Error generating image with Volces:', e)
            traceback.print_exc()
            raise e
