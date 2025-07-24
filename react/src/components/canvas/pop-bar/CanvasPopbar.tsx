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

  // 添加到聊天处理函数
  const handleAddToChat = () => {
    eventBus.emit('Canvas::AddImagesToChat', selectedImages)
    excalidrawAPI?.updateScene({
      appState: { selectedElementIds: {} },
    })
  }

  // 拆分图层处理函数 - 异步版本
  const handleSplitLayers = async () => {
    try {
      console.log('=== 前端调试信息 ===')
      console.log('画布ID:', canvasId)
      console.log('选中的图片:', selectedImages)
      
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
        console.log('✅ 图层拆分任务已提交:', result.task_id)
        toast.success('任务已提交', {
          description: `任务ID: ${result.task_id}`,
        })
      } else {
        console.error('❌ 提交任务失败:', result.message)
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
        console.log(`任务进度: ${progress.percentage.toFixed(1)}% - ${progress.message}`)
        
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
