import json
import base64
from typing import Dict, List, Any, Optional, Union
import os
import time
import requests
import tos
import threading

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
        self._lock = threading.Lock()  # 添加线程锁，用于保护关键操作
        
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
            
            # 从文件路径中提取文件名，并添加时间戳和线程ID，确保唯一性
            file_basename = os.path.basename(local_file_path)
            name_without_ext = os.path.splitext(file_basename)[0]
            file_ext = os.path.splitext(file_basename)[1]
            timestamp = int(time.time() * 1000)
            thread_id = threading.get_ident()
            object_key = f"{name_without_ext}_{timestamp}_{thread_id}{file_ext}"
            
            # 创建TOS客户端 - 每个请求创建新的客户端，避免共享状态
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
            
            # 生成保存文件名，添加线程ID确保唯一性
            original_basename = os.path.basename(original_file_path)
            name_without_ext = os.path.splitext(original_basename)[0]
            thread_id = threading.get_ident()
            timestamp = int(time.time() * 1000)
            save_filename = f"{name_without_ext}_cutout_{thread_id}_{timestamp}.png"
            save_path = os.path.join(save_dir, save_filename)
            
            # 保存文件
            with open(save_path, 'wb') as f:
                f.write(response.content)
            
            return save_path
            
        except requests.exceptions.RequestException as e:
            return None
        except Exception as e:
            return None
