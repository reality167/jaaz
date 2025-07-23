import { createCanvas } from '@/api/canvas'
import ChatTextarea from '@/components/chat/ChatTextarea'
import HomeHeader from '@/components/home/HomeHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useConfigs } from '@/contexts/configs'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
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
      setInitCanvas(true)
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

    // 构建包含表单信息的提示词，强调茶叶包装设计
    const formPrompt = `设计需求：为一家茶叶厂家设计包装平面图

项目信息：
公司名：${formData.companyName}
品名：${formData.productName}
尺寸：${formData.dimensions}
风格：${formData.style}
底色：${formData.backgroundColor}
文字介绍：${formData.description}
设计图数量：${formData.imageCount}张

设计要求：
1. 这是一个茶叶产品的包装平面图设计
2. 需要体现茶叶产品的特色和品质
3. 包装设计要符合茶叶行业的审美标准
4. 包含产品名称、品牌标识、产品信息等必要元素
5. 设计风格要符合茶叶产品的定位和目标消费群体
6. 请生成${formData.imageCount}张不同的设计方案供选择

请根据以上信息生成专业的茶叶包装平面图设计。`

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
