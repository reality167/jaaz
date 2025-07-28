import { createCanvas } from '@/api/canvas'
import ChatTextarea from '@/components/chat/ChatTextarea'
import HomeHeader from '@/components/home/HomeHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useConfigs } from '@/contexts/configs'
import { DEFAULT_SYSTEM_PROMPT, TEA_PACKAGING_PROMPT } from '@/constants'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { nanoid } from 'nanoid'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import ProjectFormDialog from '@/components/home/ProjectFormDialog'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { setInitCanvas, textModel, imageModel } = useConfigs()

  const { mutate: createCanvasMutation, isPending } = useMutation({
    mutationFn: createCanvas,
    onSuccess: (data) => {
      // 移除设置 initCanvas 为 true 的代码
      // 这样可以避免聊天区域的输入按钮一直显示加载状态
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

  // 修改表单提交处理函数
  const handleFormSubmit = (formData: {
    companyName: string
    productName: string
    dimensions: string
    style: string
    backgroundColor: string
    description: string
    imageCount: number
  }) => {
    // 检查是否有配置的模型
    if (!textModel || !imageModel) {
      toast.error('请先在设置中配置文本模型和图像模型')
      return
    }

    // 使用localStorage中存储的提示词，如果没有则使用默认值
    const teaPrompt = localStorage.getItem('tea_packaging_prompt') || TEA_PACKAGING_PROMPT
    
    // 使用提示词并替换变量
    const formPrompt = teaPrompt
      .replace(/\${formData.companyName}/g, formData.companyName)
      .replace(/\${formData.productName}/g, formData.productName)
      .replace(/\${formData.dimensions}/g, formData.dimensions)
      .replace(/\${formData.style}/g, formData.style)
      .replace(/\${formData.backgroundColor}/g, formData.backgroundColor)
      .replace(/\${formData.description}/g, formData.description)
      .replace(/\${formData.imageCount}/g, String(formData.imageCount))

    // 创建包含表单信息的消息
    const messages = [
      {
        role: 'user' as const,
        content: formPrompt,
      },
    ]

    // 调用创建画布，使用当前配置的模型
    createCanvasMutation({
      name: `${formData.productName} - ${formData.companyName}`,
      canvas_id: nanoid(),
      messages: messages,
      session_id: nanoid(),
      text_model: textModel,
      image_model: imageModel,
      system_prompt:
        localStorage.getItem('system_prompt') ||
        DEFAULT_SYSTEM_PROMPT,
    })

    toast.success('项目信息已提交，正在生成茶叶包装设计...')
  }

  return (
    <div className="flex flex-col h-screen">
      <ScrollArea className="h-full">
        <HomeHeader />

        <div className="relative flex flex-col items-center justify-center h-fit min-h-[calc(100vh-200px)] pt-[80px] select-none">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-5xl font-bold mb-2 mt-8 text-center">
              {t('home:title')}
            </h1>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-xl text-gray-500 mb-12 text-center">
              {t('home:subtitle')}
            </p>
          </motion.div>

          <ChatTextarea
            className="w-full max-w-xl"
            messages={[]}
            sessionId="" // 明确传递空的sessionId
            onSendMessages={(messages, configs) => {
              createCanvasMutation({
                name: t('home:newCanvas'),
                canvas_id: nanoid(),
                messages: messages,
                session_id: nanoid(),
                text_model: configs.textModel,
                image_model: configs.imageModel,
                system_prompt:
                  localStorage.getItem('system_prompt') ||
                  DEFAULT_SYSTEM_PROMPT,
              })
            }}
            pending={isPending}
            onFormSubmit={handleFormSubmit}
          />
        </div>
      </ScrollArea>
    </div>
  )
}
