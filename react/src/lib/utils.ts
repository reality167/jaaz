import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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
  } catch (error) {
    console.error('Error in dataURLToFile:', error)
    
    // 创建一个1x1透明PNG作为后备
    console.warn('Creating fallback empty PNG image')
    const emptyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    const arr = emptyPng.split(',')
    const bstr = atob(arr[1])
    const u8arr = new Uint8Array(bstr.length)
    
    for (let i = 0; i < bstr.length; i++) {
      u8arr[i] = bstr.charCodeAt(i)
    }
    
    return new File([u8arr], filename, { type: 'image/png' })
  }
}
