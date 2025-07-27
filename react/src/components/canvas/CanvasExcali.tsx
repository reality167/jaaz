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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import '@/assets/style/canvas.css'
import ImageResolutionDisplay from './ImageResolutionDisplay'

// 删除自定义的 ClipboardData 类型定义

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
  const [recentlyAddedImage, setRecentlyAddedImage] = useState<string | null>(null)

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

  // 添加函数处理图片的大小，确保保持原始尺寸
  const handleImageSizeAdjustment = useCallback(async (elements: readonly OrderedExcalidrawElement[], files: BinaryFiles) => {
    if (!excalidrawAPI || !elements.length) return;
    
    // 查找最近添加的图片元素
    const imageElements = elements.filter(el => el.type === 'image') as ExcalidrawImageElement[];
    if (!imageElements.length) return;
    
    // 找到最近更新的图片元素
    const latestImage = imageElements.sort((a, b) => b.updated - a.updated)[0];
    
    // 防止重复处理同一图片
    if (recentlyAddedImage === latestImage.id) return;
    
    const fileData = files[latestImage.fileId || ''];
    if (!fileData || !fileData.dataURL) return;
    
    console.log('🖼️ 检测到新图片添加，准备调整尺寸:', latestImage.id);
    
    // 获取原始图片尺寸
    const img = new Image();
    img.onload = () => {
      const originalWidth = img.naturalWidth;
      const originalHeight = img.naturalHeight;
      
      console.log(`📏 图片原始尺寸: ${originalWidth} x ${originalHeight}`);
      console.log(`📏 当前图片尺寸: ${latestImage.width} x ${latestImage.height}`);
      
      // 如果尺寸不同，调整为原始尺寸
      if (Math.abs(latestImage.width - originalWidth) > 5 || Math.abs(latestImage.height - originalHeight) > 5) {
        console.log('🔄 调整图片尺寸为原始尺寸');
        
        // 更新场景中的元素
        excalidrawAPI.updateScene({
          elements: elements.map(el => {
            if (el.id === latestImage.id) {
              return {
                ...el,
                width: originalWidth,
                height: originalHeight,
              };
            }
            return el;
          }),
        });
        
        console.log(`✅ 图片尺寸已调整为: ${originalWidth} x ${originalHeight}`);
      }
    };
    
    // 记录已处理的图片ID
    setRecentlyAddedImage(latestImage.id);
    
    img.src = fileData.dataURL;
    
  }, [excalidrawAPI, recentlyAddedImage]);

  // 添加粘贴事件处理函数，在粘贴图片时将 initCanvas 设置为 false
  const handlePasteEvent = useCallback((data: any, event: ClipboardEvent | null) => {
    // 当用户粘贴内容到画布时，将 initCanvas 设置为 false
    // 这样粘贴的图片会保存到永久文件目录而不是临时目录
    setInitCanvas(false)
    
    console.log('📋 处理粘贴事件', event?.clipboardData?.types);
    
    // 检查是否粘贴的是图片
    if (event?.clipboardData?.items) {
      for (const item of event.clipboardData.items) {
        if (item.type.indexOf('image') === 0) {
          console.log('📸 检测到图片粘贴');
          
          // 使用setTimeout等待Excalidraw处理完粘贴事件
          setTimeout(() => {
            const elements = excalidrawAPI?.getSceneElements() || [];
            const files = excalidrawAPI?.getFiles() || {};
            handleImageSizeAdjustment(elements, files);
          }, 100);
          break;
        }
      }
    }
    
    // 返回 true 以允许 Excalidraw 继续处理粘贴事件
    return true
  }, [setInitCanvas, handleImageSizeAdjustment, excalidrawAPI])

  // 修改handleChange函数，添加对新图片的检测
  const handleChange = useDebounce(
    (
      elements: Readonly<OrderedExcalidrawElement[]>,
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (elements.length === 0 || !appState) {
        return;
      }

      // 当画布有元素时，将 initCanvas 设置为 false
      // 这样可以避免聊天区域的输入按钮一直显示加载状态
      setInitCanvas(false);

      // 调用图片尺寸调整函数
      handleImageSizeAdjustment(elements, files);

      const data: CanvasData = {
        elements,
        appState: {
          ...appState,
          collaborators: undefined!,
        },
        files,
      };

      let thumbnail = '';
      const latestImage = elements
        .filter((element) => element.type === 'image')
        .sort((a, b) => b.updated - a.updated)[0];
      if (latestImage) {
        const file = files[latestImage.fileId!];
        if (file) {
          thumbnail = file.dataURL;
        }
      }

      saveCanvas(canvasId, { data, thumbnail });
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
        console.error('❌ excalidrawAPI is not initialized')
        return
      }

      try {
        console.log('🔍 Adding image to Excalidraw:', imageElement.id, 'File:', file.id)
        console.log('📄 Image element details:', {
          id: imageElement.id,
          x: imageElement.x,
          y: imageElement.y,
          width: imageElement.width,
          height: imageElement.height,
          fileId: imageElement.fileId
        })
        console.log('📄 File details:', {
          id: file.id,
          dataURL: file.dataURL,
          mimeType: file.mimeType,
          created: file.created
        })
        
        // 测试文件URL是否可访问
        if (file.dataURL && file.dataURL.startsWith('/api/')) {
          const testUrl = file.dataURL
          console.log(`🧪 测试文件URL是否可访问: ${testUrl}`)
          
          try {
            const testResponse = await fetch(testUrl, { method: 'HEAD' })
            if (testResponse.ok) {
              console.log(`✅ 文件URL可访问: ${testUrl}, 状态码: ${testResponse.status}`)
            } else {
              console.error(`❌ 文件URL不可访问: ${testUrl}, 状态码: ${testResponse.status}`)
            }
          } catch (error) {
            console.error(`❌ 测试文件URL时出错: ${testUrl}`, error)
          }
        }
        
        // 检查文件是否已经存在
        const existingFiles = excalidrawAPI.getFiles()
        if (existingFiles[file.id]) {
          console.log('⚠️ File already exists in Excalidraw:', file.id)
        }
        
        // 检查元素是否已经存在
        const currentElements = excalidrawAPI.getSceneElements()
        const elementExists = currentElements.some(el => el.id === imageElement.id)
        if (elementExists) {
          console.log('⚠️ Element already exists in Excalidraw:', imageElement.id)
          return
        }
        
        // 添加文件到Excalidraw
        console.log('🔄 Adding file to Excalidraw:', file.id)
      excalidrawAPI.addFiles([file])

        // 添加元素到场景
        console.log('🔄 Updating scene with new element:', imageElement.id)
      excalidrawAPI.updateScene({
        elements: [...(currentElements || []), imageElement],
      })
        
        console.log('✅ Image added successfully to Excalidraw:', imageElement.id)

      localStorage.setItem(
        'excalidraw-last-image-position',
        JSON.stringify(lastImagePosition.current)
      )
      } catch (error) {
        console.error('❌ Error adding image to Excalidraw:', error)
      }
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
        console.log('⏭️ Skipping layer event for different canvas:', layerData.canvas_id, 'Current canvas:', canvasId)
        return
      }

      console.log('🔍 Layer added event received for canvas:', canvasId, 'Layer content:', layerData.content)
      console.log('📄 Full layer data:', JSON.stringify(layerData))
      
      try {
        // 检查必要的数据是否存在
        if (!layerData.element || !layerData.file) {
          console.error('❌ Layer data missing element or file:', layerData)
          return
        }
        
        // 检查元素ID是否存在
        if (!layerData.element.id || !layerData.element.fileId) {
          console.error('❌ Layer element missing id or fileId:', layerData.element)
          return
        }
        
        // 检查文件数据是否完整
        if (!layerData.file.id || !layerData.file.dataURL) {
          console.error('❌ Layer file missing id or dataURL:', layerData.file)
          return
        }
        
        // 检查元素位置和尺寸是否合理
        const { x, y, width, height } = layerData.element
        if (width <= 0 || height <= 0) {
          console.error('❌ Layer element has invalid dimensions:', { width, height })
          return
        }
        
        console.log('🔄 Adding layer to canvas:', layerData.content)
        addImageToExcalidraw(layerData.element, layerData.file)
        console.log('✅ Layer added successfully:', layerData.content)
        
        // 在添加图层后，自动调整视图以显示所有内容
        setTimeout(() => {
          if (excalidrawAPI) {
            console.log('🔍 自动调整视图以显示所有内容')
            // 使用scrollToContent来调整视图
            excalidrawAPI.scrollToContent(undefined, {
              fitToContent: true,
              animate: true,
            })
            
            // 打印画布中的所有元素，以便调试
            const elements = excalidrawAPI.getSceneElements()
            console.log(`🔍 画布中共有 ${elements.length} 个元素:`)
            elements.forEach((element, index) => {
              if (element.type === 'image') {
                const imageElement = element as ExcalidrawImageElement
                console.log(`  ${index + 1}. 图像元素:`, {
                  id: imageElement.id,
                  fileId: imageElement.fileId,
                  x: imageElement.x,
                  y: imageElement.y,
                  width: imageElement.width,
                  height: imageElement.height,
                  isVisible: !imageElement.isDeleted
                })
                
                // 检查文件是否存在
                const files = excalidrawAPI.getFiles()
                const file = files[imageElement.fileId || '']
                if (file) {
                  console.log(`     文件存在: ✅ URL: ${file.dataURL}`)
                } else {
                  console.log(`     文件不存在: ❌`)
                }
              } else {
                console.log(`  ${index + 1}. 其他元素:`, {
                  id: element.id,
                  type: element.type,
                  x: element.x,
                  y: element.y,
                  isVisible: !element.isDeleted
                })
              }
            })
          }
        }, 500) // 延迟500毫秒，确保图层已添加到画布
      } catch (error) {
        console.error('❌ Error adding layer to canvas:', error)
      }
    },
    [addImageToExcalidraw, canvasId, excalidrawAPI]
  )

  useEffect(() => {
    eventBus.on('Socket::Session::ImageGenerated', handleImageGenerated)
    eventBus.on('Socket::Session::LayerAdded', handleLayerAdded)
    
    // 添加对Canvas::AdjustView事件的监听
    const handleAdjustView = (data: { canvas_id: string }) => {
      if (data.canvas_id !== canvasId) {
        return
      }
      
      console.log('🔍 接收到视图调整事件，画布ID:', canvasId)
      
      // 延迟执行，确保所有图层都已添加
      setTimeout(() => {
        if (excalidrawAPI) {
          console.log('🔄 自动调整视图以显示所有内容')
          excalidrawAPI.scrollToContent(undefined, {
            fitToContent: true,
            animate: true,
          })
        }
      }, 1000) // 延迟1秒，确保所有图层都已添加
    }
    
    eventBus.on('Canvas::AdjustView', handleAdjustView)
    
    // 添加拖拽文件监听
    const handleDragOver = (event: DragEvent) => {
      // 仅在拖拽包含文件时处理
      if (event.dataTransfer?.types.includes('Files')) {
        console.log('📂 检测到文件拖拽事件');
      }
    };
    
    // 文件拖拽放置处理
    const handleDrop = (event: DragEvent) => {
      console.log('📥 检测到文件放置事件');
      // 文件放置后需要延迟一点时间让Excalidraw处理
      setTimeout(() => {
        if (excalidrawAPI) {
          const elements = excalidrawAPI.getSceneElements();
          const files = excalidrawAPI.getFiles();
          console.log('🔍 文件放置后检查画布元素', elements.length);
          handleImageSizeAdjustment(elements, files);
        }
      }, 100);
    };
    
    // 获取画布元素
    const canvasElement = document.querySelector('.excalidraw');
    if (canvasElement) {
      canvasElement.addEventListener('dragover', handleDragOver as EventListener);
      canvasElement.addEventListener('drop', handleDrop as EventListener);
    }
    
    return () => {
      eventBus.off('Socket::Session::ImageGenerated', handleImageGenerated)
      eventBus.off('Socket::Session::LayerAdded', handleLayerAdded)
      eventBus.off('Canvas::AdjustView', handleAdjustView)
      
      // 移除拖拽事件监听
      if (canvasElement) {
        canvasElement.removeEventListener('dragover', handleDragOver as EventListener);
        canvasElement.removeEventListener('drop', handleDrop as EventListener);
      }
    }
  }, [handleImageGenerated, handleLayerAdded, canvasId, excalidrawAPI, handleImageSizeAdjustment])

  return (
    <div className="relative w-full h-full">
      <Excalidraw
        theme={theme as Theme}
        langCode={i18n.language}
        excalidrawAPI={(api) => {
          setExcalidrawAPI(api)
        }}
        onChange={handleChange}
        onPaste={handlePasteEvent}
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
