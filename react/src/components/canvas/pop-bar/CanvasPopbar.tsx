import { Button } from '@/components/ui/button'
import { Hotkey } from '@/components/ui/hotkey'
import { useCanvas } from '@/contexts/canvas'
import { eventBus, TCanvasAddImagesToChatEvent } from '@/lib/event'
import { splitLayers } from '@/api/canvas'
import { uploadImage } from '@/api/upload' // 导入上传函数
import { useKeyPress } from 'ahooks'
import { motion } from 'motion/react'
import { memo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { useParams } from '@tanstack/react-router'
import { dataURLToFile } from '@/lib/utils'
import { useMutation } from '@tanstack/react-query'

type CanvasPopbarProps = {
  pos: { x: number; y: number }
  selectedImages: TCanvasAddImagesToChatEvent
}

const CanvasPopbar = ({ pos, selectedImages }: CanvasPopbarProps) => {
  const { t } = useTranslation()
  const { excalidrawAPI } = useCanvas()
  const { id: canvasId } = useParams({ from: '/canvas/$id' })

  // 创建上传图片的mutation
  const { mutateAsync: uploadImageMutation } = useMutation({
    mutationFn: (file: File) => uploadImage(file),
  })

  // 添加到聊天处理函数
  const handleAddToChat = async () => {
    if (!excalidrawAPI || selectedImages.length === 0) {
      toast.error('无法获取画布数据', {
        description: '请确保选择了图像',
      })
      return
    }
    
    try {
      // 获取所有文件
      const files = excalidrawAPI.getFiles() || {}
      
      // 保存要发送到聊天的图像数据
      const chatImages = []
      
      // 处理所有选中的图像
      for (const img of selectedImages) {
        // 获取文件数据
        const fileData = files[img.fileId]
        
        if (!fileData || !fileData.dataURL) {
          console.error('无法获取文件数据:', img.fileId)
          continue // 跳过这个图像
        }
        
        try {
          // 确定MIME类型和文件扩展名
          let mimeType = 'image/png';
          let extension = 'png';
          
          const dataURLString = String(fileData.dataURL);
          if (dataURLString.startsWith('data:')) {
            const matches = dataURLString.match(/^data:([^;]+);/);
            if (matches && matches[1]) {
              mimeType = matches[1];
              if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') extension = 'jpg';
              else if (mimeType === 'image/gif') extension = 'gif';
              else if (mimeType === 'image/webp') extension = 'webp';
            }
          }
          
          // 检查 fileData.dataURL 是否是 URL 路径而不是 dataURL
          const originalDataURL = fileData.dataURL;
          let dataURLStr = typeof originalDataURL === 'string' ? originalDataURL : '';
          
          // 检查是否是URL而不是dataURL
          if (dataURLStr.includes('http://') || dataURLStr.includes('https://')) {
            // 尝试从URL中提取文件ID
            const matches = dataURLStr.match(/\/api\/file\/([^?#]+)/);
            if (matches && matches[1]) {
              const fileId = matches[1];
              
              // 直接使用提取的文件ID
              chatImages.push({
                file_id: fileId,
                width: img.width,
                height: img.height,
              });
              
              continue; // 跳过后续处理，继续处理下一个图像
            }
          }
          
          // 通过检查 dataURL 格式或自定义属性判断是否需要转换
          const needsConversion = typeof originalDataURL === 'string' && 
            (!originalDataURL.startsWith('data:') || 
             (fileData as any).dataURLPreview && 
             (fileData as any).dataURLPreview.includes('/api/file/'));
          
          if (needsConversion) {
            try {
              // 如果是 API 路径，确保使用完整的 URL
              const imgUrl = dataURLStr.startsWith('/') 
                ? `${window.location.origin}${dataURLStr}` 
                : dataURLStr;
              
              // 创建一个临时 canvas 元素来获取图像数据
              const imgElement = document.createElement('img');
              imgElement.crossOrigin = 'anonymous';
              
              // 使用 Promise 等待图像加载
              await new Promise((resolve, reject) => {
                imgElement.onload = resolve;
                imgElement.onerror = () => reject(new Error(`无法加载图像: ${imgUrl}`));
                imgElement.src = imgUrl;
              });
              
              const canvas = document.createElement('canvas');
              canvas.width = imgElement.width;
              canvas.height = imgElement.height;
              
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(imgElement, 0, 0);
              
              // 转换为 dataURL
              dataURLStr = canvas.toDataURL(mimeType);
            } catch (error) {
              console.error('转换 URL 到 dataURL 失败:', error);
              throw new Error('无法将图像 URL 转换为 dataURL');
            }
          }
          
          // 使用时间戳生成唯一文件名
          const fileName = `canvas_image_${Date.now()}.${extension}`;
          
          // 创建File对象并上传
          const file = dataURLToFile(dataURLStr, fileName);
          
          // 上传文件到服务器
          const uploadResult = await uploadImageMutation(file);
          
          // 添加到聊天图像数组
          chatImages.push({
            file_id: uploadResult.file_id,
            width: uploadResult.width,
            height: uploadResult.height,
          });
        } catch (error) {
          console.error('图像处理失败:', error);
          toast.error('图像处理失败', {
            description: '请尝试重新选择图像'
          });
        }
      }
      
      // 如果成功上传了至少一张图像
      if (chatImages.length > 0) {
        // 发送事件到聊天区
        eventBus.emit('Canvas::ImagesToPreview', chatImages)
        
        // 清除选择
        excalidrawAPI.updateScene({
          appState: { selectedElementIds: {} },
        })
        
        // 显示成功提示
        toast.success(t('canvas:popbar.addedToChat'), {
          description: `已添加 ${chatImages.length} 张图像到对话区`,
          duration: 2000,
        })
      } else {
        toast.error('添加图像失败', {
          description: '无法处理选中的图像',
        })
      }
    } catch (error) {
      console.error('添加图像到聊天失败:', error)
      toast.error('添加到对话失败', {
        description: '处理图像时出现错误',
      })
    }
  }



  // 拆分图层处理函数 - 异步版本
  const handleSplitLayers = async () => {
    try {
      if (selectedImages && selectedImages.length === 0) {
        toast.error('请先选择图片', {
          description: '请选择要拆分的图片',
        })
        return
      }
      
      // 立即显示"任务已提交"提示
      toast.info('图层拆分任务已提交', {
        description: '正在后台处理，请稍候',
        duration: 3000,
      })
      
      // 清除选择
      excalidrawAPI?.updateScene({
        appState: { selectedElementIds: {} },
      })
      
      // 提交异步任务
      const result = await splitLayers(canvasId, { selectedImages })
      
      if (result.success) {
        toast.success('任务已提交', {
          description: `任务ID: ${result.task_id}`,
        })
      } else {
        toast.error('提交任务失败', {
          description: result.message,
        })
      }
      
    } catch (error) {
      console.error('拆分图层失败:', error)
      toast.error('拆分图层失败', {
        description: '请稍后重试',
      })
    }
  }

  // 监听websocket消息 - 更新以支持任务进度
  useEffect(() => {
    const handleSplitLayersStarted = (data: any) => {
      if (data.canvas_id === canvasId) {
        toast.info('图层拆分已开始', {
          description: `任务ID: ${data.task_id}`,
        })
      }
    }

    const handleSplitLayersSuccess = (data: any) => {
      if (data.canvas_id === canvasId) {
        toast.success(data.message, {
          description: '图层拆分成功',
        })
      }
    }

    const handleSplitLayersError = (data: any) => {
      if (data.canvas_id === canvasId) {
        toast.error('拆分图层失败', {
          description: data.message,
        })
      }
    }

    const handleTaskProgress = (data: any) => {
      if (data.canvas_id === canvasId) {
        const progress = data.progress
        
        // 可以在这里更新进度条或显示详细进度
        if (progress.percentage > 0 && progress.percentage < 100) {
          toast.info(progress.message, {
            description: `进度: ${progress.percentage.toFixed(1)}%`,
            duration: 2000,
          })
        }
      }
    }

    eventBus.on('Canvas::SplitLayersStarted', handleSplitLayersStarted)
    eventBus.on('Canvas::SplitLayersSuccess', handleSplitLayersSuccess)
    eventBus.on('Canvas::SplitLayersError', handleSplitLayersError)
    eventBus.on('Canvas::TaskProgress', handleTaskProgress)

    return () => {
      eventBus.off('Canvas::SplitLayersStarted', handleSplitLayersStarted)
      eventBus.off('Canvas::SplitLayersSuccess', handleSplitLayersSuccess)
      eventBus.off('Canvas::SplitLayersError', handleSplitLayersError)
      eventBus.off('Canvas::TaskProgress', handleTaskProgress)
    }
  }, [canvasId])

  useKeyPress(['meta.enter', 'ctrl.enter'], handleAddToChat)

  return (
    <motion.div
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="absolute z-20 flex items-center gap-1 -translate-x-1/2 "
      style={{
        left: `${pos.x}px`,
        top: `${pos.y + 5}px`,
      }}
    >
      <div className="flex items-center gap-1 bg-primary-foreground/75 backdrop-blur-lg rounded-lg p-1 shadow-[0_5px_10px_rgba(0,0,0,0.08)] border border-primary/10 pointer-events-auto">
        <Button variant="ghost" size="sm" onClick={handleAddToChat} className="flex items-center gap-1">
          <MessageSquare className="w-4 h-4" />
          <span className="text-xs">{t('canvas:popbar.addToChat')}</span>
        </Button>
        
        {/* 拆分图层按钮 */}
        <Button variant="ghost" size="sm" onClick={handleSplitLayers} className="flex items-center gap-1">
          <Layers className="w-4 h-4" />
          <span className="text-xs">{t('canvas:popbar.splitLayers')}</span>
        </Button>
      </div>
    </motion.div>
  )
}

export default memo(CanvasPopbar)
