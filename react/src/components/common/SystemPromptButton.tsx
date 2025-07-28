import { BotIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogTrigger } from '../ui/dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { useState } from 'react'
import { toast } from 'sonner'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { useTranslation } from 'react-i18next'

export default function SystemPromptButton() {
  const { t } = useTranslation()
  const [systemPrompt, setSystemPrompt] = useState(
    localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT
  )

  const handleSave = () => {
    localStorage.setItem('system_prompt', systemPrompt)
    toast.success(t('common:messages.saved'))
  }

  const handleReset = () => {
    localStorage.setItem('system_prompt', DEFAULT_SYSTEM_PROMPT)
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
    toast.success(t('common:messages.reset'))
  }
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size={'sm'} variant="ghost">
          <BotIcon size={30} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold">{t('common:systemPrompt.title')}</h3>
        </div>
        <div className="flex items-center justify-between">
          <p className="font-bold">{t('common:systemPrompt.description')}</p>
          <Button size={'sm'} variant={'outline'} onClick={handleReset}>
            {t('common:systemPrompt.resetButton')}
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <Textarea
            placeholder={t('common:systemPrompt.placeholder')}
            className="h-[60vh]"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </div>
        <Button className="w-full" onClick={handleSave}>
          {t('common:buttons.save')}
        </Button>
      </DialogContent>
    </Dialog>
  )
} 