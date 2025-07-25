import { saveCanvas } from '@/api/canvas'
import { useCanvas } from '@/contexts/canvas'
import { useConfigs } from '@/contexts/configs'
import useDebounce from '@/hooks/use-debounce'
import { useTheme } from '@/hooks/use-theme'
import { eventBus } from '@/lib/event'
import * as ISocket from '@/types/socket'
import { CanvasData } from '@/types/types'
import { Excalidraw } from '@excalidraw/excalidraw'
import {
  ExcalidrawImageElement,
  OrderedExcalidrawElement,
  Theme,
} from '@excalidraw/excalidraw/element/types'
import '@excalidraw/excalidraw/index.css'
import {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import '@/assets/style/canvas.css'
import ImageResolutionDisplay from './ImageResolutionDisplay'

type LastImagePosition = {
  x: number
  y: number
  width: number
  height: number
  col: number // col index
}

type CanvasExcaliProps = {
  canvasId: string
  initialData?: ExcalidrawInitialDataState
}

const CanvasExcali: React.FC<CanvasExcaliProps> = ({
  canvasId,
  initialData,
}) => {
  const { excalidrawAPI, setExcalidrawAPI } = useCanvas()
  const { setInitCanvas } = useConfigs()

  const { i18n } = useTranslation()

  // 移除手动设置initCanvas的代码，使其与首页有文本进入画布的行为保持一致
  // 不再需要监听用户交互来设置initCanvas
  // useEffect(() => {
  //   // 确保初始状态为true，这样首次输入文本时会显示思考过程
  //   setInitCanvas(true)
    
  //   // 添加画布点击事件监听器
  //   const handleCanvasInteraction = () => {
  //     // 用户与画布交互后，不再需要显示思考过程
  //     setInitCanvas(false)
  //   }
    
  //   // 获取画布元素
  //   const canvasElement = document.querySelector('.excalidraw')
  //   if (canvasElement) {
  //     canvasElement.addEventListener('click', handleCanvasInteraction)
  //     canvasElement.addEventListener('touchstart', handleCanvasInteraction)
  //   }
    
  //   return () => {
  //     if (canvasElement) {
  //       canvasElement.removeEventListener('click', handleCanvasInteraction)
  //       canvasElement.removeEventListener('touchstart', handleCanvasInteraction)
  //     }
  //   }
  // }, [setInitCanvas])

  const handleChange = useDebounce(
    (
      elements: Readonly<OrderedExcalidrawElement[]>,
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (elements.length === 0 || !appState) {
        return
      }

      // 当画布有元素时，将 initCanvas 设置为 false
      // 这样可以避免聊天区域的输入按钮一直显示加载状态
      setInitCanvas(false)

      const data: CanvasData = {
        elements,
        appState: {
          ...appState,
          collaborators: undefined!,
        },
        files,
      }

      let thumbnail = ''
      const latestImage = elements
        .filter((element) => element.type === 'image')
        .sort((a, b) => b.updated - a.updated)[0]
      if (latestImage) {
        const file = files[latestImage.fileId!]
        if (file) {
          thumbnail = file.dataURL
        }
      }

      saveCanvas(canvasId, { data, thumbnail })
    },
    1000
  )

  const lastImagePosition = useRef<LastImagePosition | null>(
    localStorage.getItem('excalidraw-last-image-position')
      ? JSON.parse(localStorage.getItem('excalidraw-last-image-position')!)
      : null
  )
  const { theme } = useTheme()

  const addImageToExcalidraw = useCallback(
    async (imageElement: ExcalidrawImageElement, file: BinaryFileData) => {
      if (!excalidrawAPI) {
        return
      }

      excalidrawAPI.addFiles([file])

      const currentElements = excalidrawAPI.getSceneElements()
      
      excalidrawAPI.updateScene({
        elements: [...(currentElements || []), imageElement],
      })

      localStorage.setItem(
        'excalidraw-last-image-position',
        JSON.stringify(lastImagePosition.current)
      )
    },
    [excalidrawAPI]
  )

  const handleImageGenerated = useCallback(
    (imageData: ISocket.SessionImageGeneratedEvent) => {
      if (imageData.canvas_id !== canvasId) {
        return
      }

      addImageToExcalidraw(imageData.element, imageData.file)
    },
    [addImageToExcalidraw]
  )

  const handleLayerAdded = useCallback(
    (layerData: ISocket.SessionLayerAddedEvent) => {
      if (layerData.canvas_id !== canvasId) {
        return
      }

      addImageToExcalidraw(layerData.element, layerData.file)
    },
    [addImageToExcalidraw, canvasId]
  )

  useEffect(() => {
    eventBus.on('Socket::Session::ImageGenerated', handleImageGenerated)
    eventBus.on('Socket::Session::LayerAdded', handleLayerAdded)
    return () => {
      eventBus.off('Socket::Session::ImageGenerated', handleImageGenerated)
      eventBus.off('Socket::Session::LayerAdded', handleLayerAdded)
    }
  }, [handleImageGenerated, handleLayerAdded])

  return (
    <div className="relative w-full h-full">
      <Excalidraw
        theme={theme as Theme}
        langCode={i18n.language}
        excalidrawAPI={(api) => {
          setExcalidrawAPI(api)
        }}
        onChange={handleChange}
        initialData={() => {
          const data = initialData
          if (data?.appState) {
            data.appState = {
              ...data.appState,
              collaborators: undefined!,
            }
          }
          return data || null
        }}
      />
      <ImageResolutionDisplay />
    </div>
  )
}
export default CanvasExcali
