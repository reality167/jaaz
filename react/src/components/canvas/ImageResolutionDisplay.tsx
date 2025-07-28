/**
 * 图片分辨率显示与调整组件
 * 
 * 功能：
 * - 当用户在画布中选中图片时，在右下角显示当前图片的分辨率信息
 * - 允许用户调整图片尺寸
 * - 支持多语言显示
 * - 当没有选中图片时自动隐藏
 */

import { useCanvas } from '@/contexts/canvas'
import { cn } from '@/lib/utils'
import { ExcalidrawElement, ExcalidrawImageElement } from '@excalidraw/excalidraw/element/types'
import { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

interface ResolutionInfo {
  width: number
  height: number
  elementId: string
}

const ImageResolutionDisplay = () => {
  const { excalidrawAPI } = useCanvas()
  const { t } = useTranslation('canvas')
  const [resolutionInfo, setResolutionInfo] = useState<ResolutionInfo | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [newWidth, setNewWidth] = useState<string>('')
  const [newHeight, setNewHeight] = useState<string>('')
  const [keepRatio, setKeepRatio] = useState(true)
  const [originalRatio, setOriginalRatio] = useState(1)
  
  // 使用ref来跟踪编辑状态，以便在事件处理器中访问最新值
  const isEditingRef = useRef(isEditing)
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);
  
  // 使用useCallback包装onChange处理函数，确保它不会频繁重建
  const handleExcalidrawChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
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
    
    const width = Math.round(selectedImage.width)
    const height = Math.round(selectedImage.height)
    
    // 更新分辨率信息
    setResolutionInfo({
      width,
      height,
      elementId: selectedImage.id
    })
    
    // 只有在不处于编辑模式时才更新输入框的值
    if (!isEditingRef.current) {
      setNewWidth(width.toString())
      setNewHeight(height.toString())
      setOriginalRatio(width / height)
    }
  }, []);

  // 设置Excalidraw的onChange监听器
  useEffect(() => {
    if (!excalidrawAPI) return
    
    excalidrawAPI.onChange(handleExcalidrawChange)
    
    // 注意：Excalidraw API 没有 offChange 方法，监听器会在组件卸载时自动清理
  }, [excalidrawAPI, handleExcalidrawChange]);
  
  // 处理编辑状态变化
  const handleEditingChange = useCallback((open: boolean) => {
    if (open && resolutionInfo) {
      // 打开编辑器时，初始化宽高值
      setNewWidth(resolutionInfo.width.toString())
      setNewHeight(resolutionInfo.height.toString())
      setOriginalRatio(resolutionInfo.width / resolutionInfo.height)
    }
    setIsEditing(open)
  }, [resolutionInfo]);
  
  // 处理宽度变化，保持比例
  const handleWidthChange = (value: string) => {
    setNewWidth(value)
    // 只有当值非空且为有效数字时才进行比例计算
    if (keepRatio && value !== '' && !isNaN(Number(value)) && Number(value) > 0) {
      const calculatedHeight = Math.round(Number(value) / originalRatio)
      setNewHeight(calculatedHeight.toString())
    }
  }
  
  // 处理高度变化，保持比例
  const handleHeightChange = (value: string) => {
    setNewHeight(value)
    // 只有当值非空且为有效数字时才进行比例计算
    if (keepRatio && value !== '' && !isNaN(Number(value)) && Number(value) > 0) {
      const calculatedWidth = Math.round(Number(value) * originalRatio)
      setNewWidth(calculatedWidth.toString())
    }
  }
  
  // 应用尺寸调整
  const applyResize = () => {
    if (!excalidrawAPI || !resolutionInfo || !newWidth || !newHeight) return
    
    const width = Number(newWidth)
    const height = Number(newHeight)
    
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) return
    
    const elements = excalidrawAPI.getSceneElements()
    
    excalidrawAPI.updateScene({
      elements: elements.map(el => {
        if (el.id === resolutionInfo.elementId) {
          return {
            ...el,
            width,
            height,
          }
        }
        return el
      })
    })
    
    setIsEditing(false)
  }

  if (!resolutionInfo) return null

  return (
    <div
      className={cn(
        'absolute bottom-4 right-4 flex items-center gap-2 rounded-lg px-3 py-2 z-20 transition-all duration-300 select-none',
        'bg-background/80 backdrop-blur-lg border border-border/50 shadow-lg',
        'text-sm text-primary/70 hover:text-primary'
      )}
    >
      <Popover open={isEditing} onOpenChange={handleEditingChange}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="font-medium">
            {resolutionInfo.width} × {resolutionInfo.height} px
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3">
          <div className="space-y-2">
            <div className="text-base font-bold mb-1">{t('resize_image')}</div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs block mb-1">{t('width')}</label>
                <Input
                  value={newWidth}
                  onChange={(e) => handleWidthChange(e.target.value)}
                  type="number"
                  min="1"
                  className="h-7"
                />
              </div>
              <div>
                <label className="text-xs block mb-1">{t('height')}</label>
                <Input
                  value={newHeight}
                  onChange={(e) => handleHeightChange(e.target.value)}
                  type="number"
                  min="1"
                  className="h-7"
                />
              </div>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="keep-ratio"
                checked={keepRatio}
                onChange={(e) => setKeepRatio(e.target.checked)}
                className="mr-1"
              />
              <label htmlFor="keep-ratio" className="text-xs">
                {t('keep_aspect_ratio')}
              </label>
            </div>
            
            <div className="flex justify-end gap-1 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
                className="h-7 px-2 py-0"
              >
                {t('buttons.cancel', { ns: 'common' })}
              </Button>
              <Button 
                size="sm" 
                onClick={applyResize}
                className="h-7 px-2 py-0"
              >
                {t('buttons.apply', { ns: 'common' })}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default ImageResolutionDisplay 