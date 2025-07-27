import { useCanvas } from '@/contexts/canvas'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { ChevronDown, ImageDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { exportToSvg } from '@excalidraw/excalidraw'

type ExportFormat = 'png' | 'svg'

const CanvasExport = () => {
  const { excalidrawAPI } = useCanvas()
  const { t } = useTranslation()

  const downloadImage = async (imageUrl: string): Promise<string> => {
    const image = new Image()
    image.src = imageUrl
    return new Promise((resolve, reject) => {
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(image, 0, 0)
        const dataURL = canvas.toDataURL('image/png')
        resolve(dataURL)
      }
      image.onerror = () => {
        reject(new Error('Failed to load image'))
      }
    })
  }

  const handleExportImages = async () => {
    if (!excalidrawAPI) return
    const toastId = toast.loading(t('canvas:messages.exportingImages'))
    try {
      const appState = excalidrawAPI.getAppState()
      const elements = excalidrawAPI.getSceneElements()

      const selectedIds = Object.keys(appState.selectedElementIds).filter(
        (id) => appState.selectedElementIds[id]
      )

      const images = elements.filter(
        (element) =>
          selectedIds.includes(element.id) && element.type === 'image'
      )

      if (images.length === 0) {
        toast.error(t('canvas:messages.noImagesSelected'))
        return
      }

      const files = excalidrawAPI.getFiles()

      const imageUrls = images
        .map((image) => {
          if ('fileId' in image && image.fileId) {
            const file = files[image.fileId]
            return file?.dataURL
          }
          return null
        })
        .filter((url) => url !== null)

      if (imageUrls.length === 0) {
        toast.error(t('canvas:messages.noImagesSelected'))
        return
      }

      if (imageUrls.length === 1) {
        const imageUrl = imageUrls[0]
        const dataURL = await downloadImage(imageUrl)
        saveAs(dataURL, 'image.png')
      } else {
        const zip = new JSZip()
        await Promise.all(
          imageUrls.map(async (imageUrl, index) => {
            const dataURL = await downloadImage(imageUrl)
            if (dataURL) {
              zip.file(
                `image-${index}.png`,
                dataURL.replace('data:image/png;base64,', ''),
                { base64: true }
              )
            }
          })
        )
        const content = await zip.generateAsync({ type: 'blob' })
        saveAs(content, 'images.zip')
      }
    } catch (error) {
      toast.error(t('canvas:messages.failedToExportImages'), {
        id: toastId,
      })
    } finally {
      toast.dismiss(toastId)
    }
  }

  const handleExportSVG = async () => {
    if (!excalidrawAPI) return
    const toastId = toast.loading(t('canvas:messages.exportingSVG'))
    try {
      // 获取所有元素
      const elements = excalidrawAPI.getSceneElements()
      const appState = excalidrawAPI.getAppState()
      const files = excalidrawAPI.getFiles()

      if (elements.length === 0) {
        toast.error(t('canvas:messages.noElementsSelected'))
        return
      }

      // 使用Excalidraw的原生exportToSvg API
      // 原来的问题：之前的实现是手动构建SVG，没有正确处理多图层的情况
      // 每个图层被简单地转换为单个SVG元素，丢失了图层的层次结构和一些属性
      // 使用Excalidraw官方的exportToSvg API可以确保正确处理所有图层和元素属性
      const svgElement = await exportToSvg({
        elements,
        appState: {
          ...appState,
          exportWithDarkMode: false,
          exportBackground: true,
          viewBackgroundColor: appState.viewBackgroundColor || '#ffffff',
          exportEmbedScene: true, // 确保场景数据被嵌入SVG
        },
        files,
        exportPadding: 20,
      })

      // 修复图片引用问题：将所有相对路径的图片转换为base64嵌入式图片
      const imageElements = svgElement.querySelectorAll("image");
      await Promise.all(Array.from(imageElements).map(async (imgElement) => {
        const element = imgElement as SVGImageElement;
        const href = element.getAttribute("href");
        if (href && href.startsWith("/api/file/")) {
          try {
            // 获取完整URL
            const fullUrl = `${window.location.origin}${href}`;
            // 获取图片并转换为base64
            const response = await fetch(fullUrl);
            const blob = await response.blob();
            const reader = new FileReader();
            await new Promise((resolve, reject) => {
              reader.onload = resolve;
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            // 替换href属性为base64数据
            element.setAttribute("href", reader.result as string);
          } catch (error) {
            console.error("转换图片失败:", error, href);
          }
        }
      }));

      // 获取SVG内容
      const svgString = new XMLSerializer().serializeToString(svgElement);
      
      // 创建blob并下载
      const blob = new Blob([svgString], { type: 'image/svg+xml' })
      saveAs(blob, 'canvas-export.svg')

      toast.success('SVG exported successfully')
    } catch (error) {
      console.error('SVG export error:', error)
      toast.error(t('canvas:messages.failedToExportSVG'), {
        id: toastId,
      })
    } finally {
      toast.dismiss(toastId)
    }
  }

  const handleExport = async (format: ExportFormat) => {
    if (format === 'png') {
      await handleExportImages()
    } else if (format === 'svg') {
      await handleExportSVG()
    }
  }

  return (
    <div className="inline-flex -space-x-px rounded-md shadow-xs rtl:space-x-reverse">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md h-8"
            variant="outline"
          >
            <ImageDown className="mr-2 h-4 w-4" />
            {t('canvas:export')}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleExport('png')}>
            {t('canvas:exportPNG')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('svg')}>
            {t('canvas:exportSVG')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default CanvasExport
