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
      // Get all elements
      const appState = excalidrawAPI.getAppState()
      const elements = excalidrawAPI.getSceneElements()
      const files = excalidrawAPI.getFiles()

      if (elements.length === 0) {
        toast.error(t('canvas:messages.noElementsSelected'))
        return
      }

      // Calculate bounding box for all elements
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      
      elements.forEach(element => {
        if (element.type === 'rectangle') {
          minX = Math.min(minX, element.x)
          minY = Math.min(minY, element.y)
          maxX = Math.max(maxX, element.x + element.width)
          maxY = Math.max(maxY, element.y + element.height)
        } else if (element.type === 'ellipse') {
          minX = Math.min(minX, element.x)
          minY = Math.min(minY, element.y)
          maxX = Math.max(maxX, element.x + element.width)
          maxY = Math.max(maxY, element.y + element.height)
        } else if (element.type === 'text') {
          minX = Math.min(minX, element.x)
          minY = Math.min(minY, element.y)
          maxX = Math.max(maxX, element.x + (element.width || 100))
          maxY = Math.max(maxY, element.y + (element.height || 20))
        } else if (element.type === 'image') {
          minX = Math.min(minX, element.x)
          minY = Math.min(minY, element.y)
          maxX = Math.max(maxX, element.x + element.width)
          maxY = Math.max(maxY, element.y + element.height)
        }
      })
      
      // Add padding to bounding box
      const padding = 20
      minX = Math.max(0, minX - padding)
      minY = Math.max(0, minY - padding)
      maxX = maxX + padding
      maxY = maxY + padding
      
      // Calculate dimensions
      const width = maxX - minX
      const height = maxY - minY
      
      // Helper function to convert image URL to base64
      const convertImageToBase64 = async (imageUrl: string): Promise<string> => {
        try {
          // If it's already a data URL, return it
          if (imageUrl.startsWith('data:')) {
            return imageUrl
          }
          
          // If it's a relative URL, convert to absolute URL
          let absoluteUrl = imageUrl
          if (imageUrl.startsWith('/')) {
            absoluteUrl = `${window.location.origin}${imageUrl}`
          }
          
          // Fetch the image and convert to base64
          const response = await fetch(absoluteUrl)
          const blob = await response.blob()
          
          return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
        } catch (error) {
          console.error('Error converting image to base64:', error)
          // Return a placeholder image if conversion fails
          return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2NjYyIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+RXJyb3I8L3RleHQ+PC9zdmc+'
        }
      }
      
      // Generate SVG elements with embedded base64 images
      const svgElementsPromises = elements.map(async element => {
        if (element.type === 'rectangle') {
          return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" 
                    fill="none" stroke="#000000" stroke-width="2"/>`
        } else if (element.type === 'ellipse') {
          return `<ellipse cx="${element.x + element.width/2}" cy="${element.y + element.height/2}" 
                       rx="${element.width/2}" ry="${element.height/2}" 
                       fill="none" stroke="#000000" stroke-width="2"/>`
        } else if (element.type === 'text') {
          return `<text x="${element.x}" y="${element.y + 16}" 
                    font-family="Arial, sans-serif" font-size="16" fill="#000000">${element.text || ''}</text>`
        } else if (element.type === 'image' && element.fileId) {
          const file = files[element.fileId]
          if (file?.dataURL) {
            // Convert image to base64
            const base64Data = await convertImageToBase64(file.dataURL)
            return `<image x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" 
                       xlink:href="${base64Data}"/>`
          }
        }
        return ''
      })
      
      // Wait for all image conversions to complete
      const svgElements = await Promise.all(svgElementsPromises)
      const svgElementsString = svgElements.join('')
      
      // Create a simple SVG
      const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" 
        fill="${appState.viewBackgroundColor || '#ffffff'}" stroke="none"/>
  ${svgElementsString}
</svg>`

      // Create blob and download
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
