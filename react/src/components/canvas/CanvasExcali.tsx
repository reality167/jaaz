import { saveCanvas } from '@/api/canvas'
import { useCanvas } from '@/contexts/canvas'
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

  const { i18n } = useTranslation()

  const handleChange = useDebounce(
    (
      elements: Readonly<OrderedExcalidrawElement[]>,
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (elements.length === 0 || !appState) {
        return
      }

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
        console.log('❌ excalidrawAPI不存在')
        return
      }

      console.log('👇 添加文件到Excalidraw:', file)
      excalidrawAPI.addFiles([file])

      const currentElements = excalidrawAPI.getSceneElements()
      console.log('👇 当前画布元素数量:', currentElements?.length || 0)
      console.log('👇 要添加的元素:', imageElement)
      
      excalidrawAPI.updateScene({
        elements: [...(currentElements || []), imageElement],
      })

      console.log('✅ 图层已添加到画布')

      localStorage.setItem(
        'excalidraw-last-image-position',
        JSON.stringify(lastImagePosition.current)
      )
    },
    [excalidrawAPI]
  )

  const handleImageGenerated = useCallback(
    (imageData: ISocket.SessionImageGeneratedEvent) => {
      console.log('👇image_generated', imageData)
      if (imageData.canvas_id !== canvasId) {
        return
      }

      addImageToExcalidraw(imageData.element, imageData.file)
    },
    [addImageToExcalidraw]
  )

  const handleLayerAdded = useCallback(
    (layerData: ISocket.SessionLayerAddedEvent) => {
      console.log('👇layer_added 事件收到:', layerData)
      console.log('👇当前canvasId:', canvasId)
      console.log('👇事件canvas_id:', layerData.canvas_id)
      console.log('👇图层元素:', layerData.element)
      console.log('👇文件数据:', layerData.file)
      
      if (layerData.canvas_id !== canvasId) {
        console.log('⚠️ Canvas ID不匹配，跳过图层添加')
        return
      }

      console.log('✅ Canvas ID匹配，开始添加图层到画布')
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
    <Excalidraw
      theme={theme as Theme}
      langCode={i18n.language}
      excalidrawAPI={(api) => {
        setExcalidrawAPI(api)
      }}
      onChange={handleChange}
      initialData={() => {
        const data = initialData
        console.log('👇initialData', data)
        if (data?.appState) {
          data.appState = {
            ...data.appState,
            collaborators: undefined!,
          }
        }
        return data || null
      }}
    />
  )
}
export default CanvasExcali
