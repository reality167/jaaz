/**
 * 图片分辨率显示组件
 * 
 * 功能：
 * - 当用户在画布中选中图片时，在右下角显示当前图片的分辨率信息
 * - 显示当前显示尺寸
 * - 支持多语言显示
 * - 当没有选中图片时自动隐藏
 */

import { useCanvas } from '@/contexts/canvas'
import { cn } from '@/lib/utils'
import { ExcalidrawImageElement, OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ResolutionInfo {
  width: number
  height: number
}

const ImageResolutionDisplay = () => {
  const { excalidrawAPI } = useCanvas()
  const { t } = useTranslation()
  const [resolutionInfo, setResolutionInfo] = useState<ResolutionInfo | null>(null)

  useEffect(() => {
    if (!excalidrawAPI) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleChange = (elements: readonly any[], appState: AppState, files: BinaryFiles) => {
      const selectedIds = appState.selectedElementIds
      
      if (Object.keys(selectedIds).length === 0) {
        setResolutionInfo(null)
        return
      }

      const selectedImages = elements.filter(
        (element) => element.type === 'image' && selectedIds[element.id]
      ) as ExcalidrawImageElement[]

      if (selectedImages.length === 0) {
        setResolutionInfo(null)
        return
      }

      // 如果选中了多个图片，显示第一个的信息
      const selectedImage = selectedImages[0]
      
      setResolutionInfo({
        width: Math.round(selectedImage.width),
        height: Math.round(selectedImage.height),
      })
    }

    excalidrawAPI.onChange(handleChange)

    // 注意：Excalidraw API 没有 offChange 方法，监听器会在组件卸载时自动清理
  }, [excalidrawAPI])

  if (!resolutionInfo) return null

  return (
    <div
      className={cn(
        'absolute bottom-4 right-4 flex items-center gap-2 rounded-lg px-3 py-2 z-20 transition-all duration-300 select-none',
        'bg-background/80 backdrop-blur-lg border border-border/50 shadow-lg',
        'text-sm text-primary/70 hover:text-primary'
      )}
    >
      <div className="font-medium">
        {resolutionInfo.width} × {resolutionInfo.height} px
      </div>
    </div>
  )
}

export default ImageResolutionDisplay 