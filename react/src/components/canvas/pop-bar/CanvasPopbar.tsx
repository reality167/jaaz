import { Button } from '@/components/ui/button'
import { Hotkey } from '@/components/ui/hotkey'
import { useCanvas } from '@/contexts/canvas'
import { eventBus, TCanvasAddImagesToChatEvent } from '@/lib/event'
import { splitLayers } from '@/api/canvas'
import { useKeyPress } from 'ahooks'
import { motion } from 'motion/react'
import { memo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useParams } from '@tanstack/react-router'

type CanvasPopbarProps = {
  pos: { x: number; y: number }
  selectedImages: TCanvasAddImagesToChatEvent
}

const CanvasPopbar = ({ pos, selectedImages }: CanvasPopbarProps) => {
  const { t } = useTranslation()
  const { excalidrawAPI } = useCanvas()
  const { id: canvasId } = useParams({ from: '/canvas/$id' })

  const handleAddToChat = () => {
    eventBus.emit('Canvas::AddImagesToChat', selectedImages)
    excalidrawAPI?.updateScene({
      appState: { selectedElementIds: {} },
    })
  }

  // 拆分图层处理函数
  const handleSplitLayers = async () => {
    try {
      console.log('=== 前端调试信息 ===')
      console.log('画布ID:', canvasId)
      console.log('选中的图片:', selectedImages)
      console.log('selectedImages类型:', typeof selectedImages)
      console.log('selectedImages长度:', selectedImages?.length || 0)
      
      if (selectedImages && selectedImages.length > 0) {
        selectedImages.forEach((img, index) => {
          console.log(`图片 ${index + 1}:`, {
            fileId: img.fileId,
            base64长度: img.base64?.length || 0,
            width: img.width,
            height: img.height,
            x: img.x,
            y: img.y
          })
        })
      } else {
        console.log('⚠️ 没有选中任何图片')
        toast.error('请先选择图片', {
          description: '请选择要拆分的图片',
        })
        return
      }
      
      // 立即显示"已在后台执行"提示
      toast.info('图层拆分已开始', {
        description: '正在后台执行',
        duration: 3000,
      })
      
      // 清除选择
      excalidrawAPI?.updateScene({
        appState: { selectedElementIds: {} },
      })
      
      // 异步调用拆分图层API（不等待结果）
      splitLayers(canvasId, { selectedImages }).catch((error) => {
        console.error('拆分图层失败:', error)
        // 错误处理已经在WebSocket监听器中处理
      })
      
    } catch (error) {
      console.error('拆分图层失败:', error)
      toast.error('拆分图层失败', {
        description: '请稍后重试',
      })
    }
  }

  // 监听websocket消息
  useEffect(() => {
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

    eventBus.on('Canvas::SplitLayersSuccess', handleSplitLayersSuccess)
    eventBus.on('Canvas::SplitLayersError', handleSplitLayersError)

    return () => {
      eventBus.off('Canvas::SplitLayersSuccess', handleSplitLayersSuccess)
      eventBus.off('Canvas::SplitLayersError', handleSplitLayersError)
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
          <span className="text-xs">{t('canvas:popbar.addToChat')}</span>
          <Hotkey keys={['⌘', '↩︎']} />
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
