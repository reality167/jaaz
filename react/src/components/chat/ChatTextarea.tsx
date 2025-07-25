import { cancelChat } from '@/api/chat'
import { uploadImage } from '@/api/upload'
import { createCanvas } from '@/api/canvas'
import { Button } from '@/components/ui/button'
import { useConfigs } from '@/contexts/configs'
import { eventBus, TCanvasAddImagesToChatEvent, TImagePreviewEvent } from '@/lib/event'
import { cn, dataURLToFile } from '@/lib/utils'
import { Message, Model } from '@/types/types'
import { SessionEventType } from '@/types/socket'
import { useMutation } from '@tanstack/react-query'
import { useDrop } from 'ahooks'
import { produce } from 'immer'
import { ArrowUp, Loader2, PlusIcon, Square, XIcon, FileText, AlertCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import Textarea, { TextAreaRef } from 'rc-textarea'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import ModelSelector from './ModelSelector'
import ProjectFormDialog from '@/components/home/ProjectFormDialog'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { nanoid } from 'nanoid'
import { useNavigate } from '@tanstack/react-router'

// 调试组件：显示图像加载问题
const ImageDebug = ({ src, file_id }: { src: string, file_id: string }) => {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  
  return (
    <div className="relative">
      <img
        src={src}
        alt="Debug image"
        className={cn(
          "w-full h-full object-cover rounded-md",
          error && "border-2 border-red-500"
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        draggable={false}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-100/50">
          <AlertCircle className="text-red-500 w-4 h-4" />
        </div>
      )}
    </div>
  )
}

type ChatTextareaProps = {
  pending: boolean
  className?: string
  messages: Message[]
  sessionId?: string
  onSendMessages: (
    data: Message[],
    configs: {
      textModel: Model
      imageModel: Model
      systemPrompt?: string
    }
  ) => void
  onCancelChat?: () => void
  onFormSubmit?: (formData: {
    companyName: string
    productName: string
    dimensions: string
    style: string
    backgroundColor: string
    description: string
    imageCount: number
  }) => void
}

const ChatTextarea: React.FC<ChatTextareaProps> = ({
  pending,
  className,
  messages,
  sessionId,
  onSendMessages,
  onCancelChat,
  onFormSubmit,
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { textModel, imageModel, imageModels, setShowInstallDialog } =
    useConfigs()
  const [prompt, setPrompt] = useState('')
  const textareaRef = useRef<TextAreaRef>(null)
  const [images, setImages] = useState<
    {
      file_id: string
      width: number
      height: number
    }[]
  >([])
  const [isFocused, setIsFocused] = useState(false)
  const [isComposing, setIsComposing] = useState(false) // 添加输入法状态

  const imageInputRef = useRef<HTMLInputElement>(null)

  // 保留原有的uploadImageMutation
  const { mutate: uploadImageMutation } = useMutation({
    mutationFn: (file: File) => uploadImage(file),
    onSuccess: (data) => {
      console.log('🦄uploadImageMutation onSuccess', data)
      setImages((prev) => [
        ...prev,
        {
          file_id: data.file_id,
          width: data.width,
          height: data.height,
        },
      ])
    },
  })

  // 添加createCanvasMutation
  const { mutate: createCanvasMutation, isPending: isCreatingCanvas } = useMutation({
    mutationFn: createCanvas,
    onSuccess: (data) => {
      // 创建成功后导航到新画布
      navigate({
        to: '/canvas/$id',
        params: { id: data.id },
      })
    },
    onError: (error) => {
      toast.error(t('common:messages.error'), {
        description: error.message,
      })
    },
  })

  const handleImagesUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files) {
        for (const file of files) {
          uploadImageMutation(file)
        }
      }
    },
    [uploadImageMutation]
  )

  const handleCancelChat = useCallback(async () => {
    if (sessionId) {
      await cancelChat(sessionId)
    }
    onCancelChat?.()
  }, [sessionId, onCancelChat])

  // Send Prompt
  const handleSendPrompt = useCallback(() => {
    if (pending) return
    if (!textModel) {
      toast.error(t('chat:textarea.selectModel'))
      return
    }
    // Check if there are image models, if not, prompt to install ComfyUI
    // if (!imageModel || imageModels.length === 0) {
    //   setShowInstallDialog(true)
    //   return
    // }
    let value = prompt
    
    // 移除空文本检查，允许空文本提交
    // if (value.length === 0 || value.trim() === '') {
    //   toast.error(t('chat:textarea.enterPrompt'))
    //   return
    // }

    if (images.length > 0) {
      images.forEach((image) => {
        value += `\n\n ![Attached image - width: ${image.width} height: ${image.height} filename: ${image.file_id}](/api/file/${image.file_id})`
      })
    }

    // 创建新消息数组
    let newMessage = [...messages]
    
    // 只有当文本不为空或有图片时，才添加用户消息
    if (value.trim() !== '') {
      newMessage = messages.concat([
        {
          role: 'user',
          content: value,
        },
      ])
    }
    setImages([])
    setPrompt('')

    // 确保从localStorage获取system_prompt
    const systemPrompt = localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT

    // 判断是否在画布页面
    if (sessionId) {
      // 在画布页面，使用onSendMessages回调
      onSendMessages(newMessage, {
        textModel: textModel,
        imageModel: imageModel || {
          provider: '',
          model: '',
          url: '',
        },
        systemPrompt: systemPrompt,
      })
    } else {
      // 不在画布页面，直接创建新画布，与首页有文本进入保持一致
      createCanvasMutation({
        name: t('home:newCanvas'),
        canvas_id: nanoid(),
        messages: newMessage,
        session_id: nanoid(),
        text_model: textModel,
        image_model: imageModel || {
          provider: '',
          model: '',
          url: '',
        },
        system_prompt: systemPrompt,
      })
    }
  }, [
    pending,
    textModel,
    imageModel,
    imageModels,
    prompt,
    onSendMessages,
    images,
    messages,
    t,
    sessionId,
    createCanvasMutation,
  ])

  // Drop Area
  const dropAreaRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFilesDrop = useCallback(
    (files: File[]) => {
      for (const file of files) {
        uploadImageMutation(file)
      }
    },
    [uploadImageMutation]
  )

  useDrop(dropAreaRef, {
    onDragOver() {
      setIsDragOver(true)
    },
    onDragLeave() {
      setIsDragOver(false)
    },
    onDrop() {
      setIsDragOver(false)
    },
    onFiles: handleFilesDrop,
  })

  useEffect(() => {
    // 处理旧版图像添加事件
    const handleAddImagesToChat = (data: TCanvasAddImagesToChatEvent) => {
      console.log('聊天区接收到图片数据(旧版事件):', data)
      
      if (!data || data.length === 0) {
        console.error('接收到的图片数据为空')
        return
      }
      
      data.forEach(async (image, index) => {
        console.log(`处理图片 ${index + 1}/${data.length}:`, {
          fileId: image.fileId,
          hasBase64: !!image.base64,
          base64Length: image.base64 ? image.base64.length : 0
        })
        
        // 在这里，我们需要处理两种情况
        if (image.base64) {
          try {
            console.log('图片有base64数据，使用base64上传新图片')
            const file = dataURLToFile(image.base64, `image_${Date.now()}.png`)
            console.log('文件创建成功, 大小:', file.size, '字节, 类型:', file.type)
            uploadImageMutation(file)
          } catch (error) {
            console.error('处理图片失败:', error)
            toast.error('图片处理失败', { 
              description: '无法处理图片数据'
            })
          }
        } else {
          // 从文件ID中提取真实的文件名
          // Excalidraw使用的fileId可能不是完整的文件名，需要从中提取原始文件名
          console.log('图片没有base64数据，使用原始文件ID')
          
          let originalFileId = image.fileId
          
          // 检查fileId是否包含文件扩展名，如果没有，尝试添加通用扩展名
          if (!originalFileId.includes('.')) {
            // 我们在这里不确定扩展名，尝试获取完整文件名
            // 例如：从im_mjgLAkgV提取为im_mjgLAkgV.jpeg
            console.log('文件ID没有扩展名，尝试获取原始文件名')
            
            // 在这种情况下，我们应该尝试使用原始base64上传新图片
            if (image.base64) {
              try {
                console.log('尝试使用base64重新上传图片')
                const file = dataURLToFile(image.base64, `image_${Date.now()}.png`)
                uploadImageMutation(file)
                return
              } catch (error) {
                console.error('使用base64重新上传失败:', error)
              }
            }
            
            // 如果都失败了，直接使用原始ID并添加通用扩展名
            originalFileId = `${originalFileId}.jpeg`
            console.log('使用添加扩展名后的文件ID:', originalFileId)
          }
          
          // 添加文件到图片列表
          setImages(
            produce((prev) => {
              prev.push({
                file_id: originalFileId,
                width: image.width,
                height: image.height,
              })
            })
          )
        }
      })

      textareaRef.current?.focus()
    }
    
    // 处理新版图像预览事件 - 直接添加服务器上已有的图像
    const handleImagesToPreview = (images: TImagePreviewEvent) => {
      console.log('聊天区接收到图片预览数据:', images)
      
      if (!images || images.length === 0) {
        console.error('接收到的预览图片数据为空')
        return
      }
      
      // 直接将图像添加到预览区
      setImages(
        produce((prev) => {
          // 合并新的图像数据到预览列表
          images.forEach(image => {
            prev.push({
              file_id: image.file_id,
              width: image.width,
              height: image.height
            })
          })
        })
      )
      
      console.log('图像已添加到预览区，总数:', images.length)
      
      // 聚焦到文本输入框
      textareaRef.current?.focus()
    }
    
    // 注册事件监听
    eventBus.on('Canvas::AddImagesToChat', handleAddImagesToChat)
    eventBus.on('Canvas::ImagesToPreview', handleImagesToPreview)
    
    return () => {
      // 移除事件监听
      eventBus.off('Canvas::AddImagesToChat', handleAddImagesToChat)
      eventBus.off('Canvas::ImagesToPreview', handleImagesToPreview)
    }
  }, [uploadImageMutation])

  // 添加表单对话框状态
  const [showFormDialog, setShowFormDialog] = useState(false)

  return (
    <motion.div
      ref={dropAreaRef}
      className={cn(
        'w-full flex flex-col items-center border border-primary/20 rounded-2xl p-3 hover:border-primary/40 transition-all duration-300 cursor-text gap-5 bg-background/80 backdrop-blur-xl relative',
        isFocused && 'border-primary/40',
        className
      )}
      style={{
        boxShadow: isFocused
          ? '0 0 0 4px color-mix(in oklab, var(--primary) 10%, transparent)'
          : 'none',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: 'linear' }}
      onClick={() => textareaRef.current?.focus()}
    >
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            className="absolute top-0 left-0 right-0 bottom-0 bg-background/50 backdrop-blur-xl rounded-2xl z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                Drop images here to upload
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {images.length > 0 && (
          <motion.div
            className="flex items-center gap-2 w-full"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {images.map((image) => {
              // 构建图像URL
              const imageUrl = `/api/file/${image.file_id}`
              
              return (
                <motion.div
                  key={image.file_id}
                  className="relative size-10"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                >
                  <ImageDebug 
                    src={imageUrl} 
                    file_id={image.file_id}
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute -top-1 -right-1 size-4"
                    onClick={() =>
                      setImages((prev) =>
                        prev.filter((i) => i.file_id !== image.file_id)
                      )
                    }
                    title={`删除图像 ${image.file_id}`}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <Textarea
        ref={textareaRef}
        className="w-full border-none outline-none resize-none"
        placeholder={t('chat:textarea.placeholder')}
        value={prompt}
        autoSize={{ minRows: 1, maxRows: 8 }}
        onChange={(e) => setPrompt(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
            e.preventDefault()
            handleSendPrompt()
          }
        }}
      />

      <div className="flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2 max-w-[calc(100%-100px)]">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImagesUpload}
            hidden
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => imageInputRef.current?.click()}
          >
            <PlusIcon className="size-4" />
          </Button>

          {/* 新增表单按钮 */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFormDialog(true)}
            title="填写项目信息"
          >
            <FileText className="size-4" />
          </Button>

          <ModelSelector />
        </div>

        {pending ? (
          <Button
            className="shrink-0 relative"
            variant="default"
            size="icon"
            onClick={handleCancelChat}
          >
            <Loader2 className="size-5.5 animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            <Square className="size-2 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </Button>
        ) : (
          <Button
            className="shrink-0"
            variant="default"
            size="icon"
            onClick={handleSendPrompt}
            disabled={!textModel || !imageModel}
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>

      {/* 添加表单对话框 */}
      <ProjectFormDialog
        open={showFormDialog}
        onOpenChange={setShowFormDialog}
        onSubmit={onFormSubmit || (() => {})}
      />
    </motion.div>
  )
}

export default ChatTextarea
