/**
 * Simple image processing utilities
 */

// No need to import dataURLToFile as it's now defined in this file

interface ProcessedImage {
  url: string
  filename: string
}

/**
 * Convert file to base64 data URL
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () =>
      reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/**
 * Compress large image (>2MB) to ~1MB
 */
function compressLargeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      try {
        // Calculate new dimensions (max 2048px)
        let { width, height } = img
        const maxSize = 2048

        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        canvas.width = width
        canvas.height = height

        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height)

        // Try different quality levels to get under 2MB
        let quality = 1
        let dataUrl: string
        let attempts = 0

        do {
          dataUrl = canvas.toDataURL('image/jpeg', quality)
          const size = Math.round(dataUrl.length * 0.75) // Estimate size

          // Stop if under 2MB or tried 5 times
          if (size <= 2048 * 1024 || attempts >= 5) {
            resolve(dataUrl)
            return
          }

          quality *= 0.8
          attempts++
        } while (attempts < 5)

        resolve(dataUrl)
      } catch (error) {
        reject(new Error(`Failed to compress image: ${file.name}`))
      }
    }

    img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`))

    // Create object URL for the image
    const objectUrl = URL.createObjectURL(file)
    const originalOnload = img.onload
    img.onload = function (ev: Event) {
      URL.revokeObjectURL(objectUrl)
      return originalOnload?.call(this, ev)
    }

    img.src = objectUrl
  })
}

/**
 * Compress image file and return compressed File object
 */
export async function compressImageFile(file: File): Promise<File> {
  // Check file size (2MB = 2048KB)
  const fileSizeKB = file.size / 1024

  // If file is small enough, return as is
  if (fileSizeKB <= 2048) {
    return file
  }

  console.log(
    `Compressing large image: ${file.name} (${Math.round(fileSizeKB)}KB)`
  )

  try {
    const compressedDataURL = await compressLargeImage(file)
    const compressedFile = dataURLToFile(compressedDataURL, file.name)

    console.log(
      `Image compressed: ${file.name} (${Math.round(fileSizeKB)}KB → ${Math.round(compressedFile.size / 1024)}KB)`
    )

    return compressedFile
  } catch (error) {
    console.warn(
      `Failed to compress image ${file.name}, using original:`,
      error
    )
    return file
  }
}

/**
 * Process image files - compress only if larger than 2MB
 */
/**
 * 将 dataURL 转换为 File 对象
 * 增强版本，增加了错误处理和边缘情况检查
 */
export function dataURLToFile(dataURL: string, filename: string): File {
  try {
    // 检查 dataURL 是否为空
    if (!dataURL) {
      console.error('dataURL is empty')
      throw new Error('Empty dataURL provided')
    }

    // 检查 dataURL 格式
    if (!dataURL.startsWith('data:')) {
      console.error('Invalid dataURL format, missing "data:" prefix')
      throw new Error('Invalid dataURL format')
    }

    // 分割 dataURL
    const arr = dataURL.split(',')
    if (arr.length !== 2) {
      console.error('Invalid dataURL format, cannot split properly')
      throw new Error('Invalid dataURL format')
    }

    // 获取 MIME 类型
    let mime = 'image/png' // 默认类型
    const mimeMatch = arr[0].match(/:(.*?);/)
    if (mimeMatch && mimeMatch.length > 1) {
      mime = mimeMatch[1]
    }
    
    // 检查是否是 base64 编码
    if (!arr[0].includes(';base64')) {
      console.error('dataURL is not base64 encoded')
      throw new Error('Only base64 encoded dataURLs are supported')
    }

    try {
      // 解码 base64
      const bstr = atob(arr[1])
      
      // 创建 Uint8Array
      const n = bstr.length
      const u8arr = new Uint8Array(n)
      
      for (let i = 0; i < n; i++) {
        u8arr[i] = bstr.charCodeAt(i)
      }
      
      // 创建文件对象
      return new File([u8arr], filename, { type: mime })
    } catch (decodeError) {
      console.error('Failed to decode base64 data:', decodeError)
      throw new Error('Failed to decode base64 data')
    }
  } catch (error: unknown) {
    console.error('Error in dataURLToFile:', error)
    // 直接抛出错误，让调用方处理
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to convert dataURL to File: ${errorMessage}`)
  }
}

export async function processImageFiles(
  files: File[]
): Promise<ProcessedImage[]> {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      // Check file size (2MB = 2048KB)
      const fileSizeKB = file.size / 1024

      let url: string
      if (fileSizeKB > 2048) {
        // Large file - compress it
        console.log(
          `[Silent] Compressing large image: ${file.name} (${Math.round(fileSizeKB)}KB)`
        )
        url = await compressLargeImage(file)
      } else {
        // Small file - use as is
        url = await fileToBase64(file)
      }

      return {
        url,
        filename: file.name,
      }
    })
  )

  // Extract successful results
  const processedImages: ProcessedImage[] = []
  const errors: string[] = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      processedImages.push(result.value)
    } else {
      errors.push(`${files[index].name}: ${result.reason.message}`)
    }
  })

  // Handle errors
  if (errors.length > 0 && processedImages.length === 0) {
    throw new Error(`All images failed to process:\n${errors.join('\n')}`)
  }

  if (errors.length > 0) {
    console.warn('Some images failed to process:', errors)
  }

  return processedImages
}
