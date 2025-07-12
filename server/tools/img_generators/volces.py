from typing import Optional
import os
import traceback
from .base import ImageGenerator, get_image_info_and_save, generate_image_id
from services.config_service import config_service, FILES_DIR
from openai import OpenAI, OpenAIError

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

            client = OpenAI(api_key=api_key, base_url=url)

            # Process ratio
            w_ratio, h_ratio = map(int, aspect_ratio.split(':'))

            factor = (1024 ** 2 / (w_ratio * h_ratio)) ** 0.5

            width = int((factor * w_ratio) / 64) * 64
            height = int((factor * h_ratio) / 64) * 64

            if input_image:
                # input_image should be the file path for OpenAI
                raise NotImplementedError("Doubao Image Edit are still in progress.")
            else:
                result = client.images.generate(
                    model=model,
                    prompt=prompt,
                    size=kwargs.get("size", f"{width}x{height}"),
                    extra_body={
                        "watermark": False
                    }
                )

            if not result or not result.data or len(result.data) == 0:
                raise ValueError("No image data returned from Volces API")

            image_url = result.data[0].url
            image_id = generate_image_id()
            mime_type, width, height, extension = await get_image_info_and_save(
                image_url, os.path.join(FILES_DIR, f'{image_id}'), is_b64=False
            )

            # Ensure mime_type is not None
            if mime_type is None:
                mime_type = "image/png"  # Default to PNG if mime_type is None

            filename = f'{image_id}.{extension}'
            return mime_type, width, height, filename

        except OpenAIError as e:
            print('Error generating image with Volces:', e)
            traceback.print_exc()
            raise e
