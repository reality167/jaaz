import { CoffeeIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogTrigger } from '../ui/dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { useState } from 'react'
import { toast } from 'sonner'
import { TEA_PACKAGING_PROMPT } from '@/constants'
import { useTranslation } from 'react-i18next'

export default function TeaPromptButton() {
  const { t } = useTranslation()
  const [teaPrompt, setTeaPrompt] = useState(
    localStorage.getItem('tea_packaging_prompt') || TEA_PACKAGING_PROMPT
  )

  const handleSave = () => {
    localStorage.setItem('tea_packaging_prompt', teaPrompt)
    toast.success(t('common:messages.saved'))
  }

  const handleReset = () => {
    localStorage.setItem('tea_packaging_prompt', TEA_PACKAGING_PROMPT)
    setTeaPrompt(TEA_PACKAGING_PROMPT)
    toast.success(t('common:messages.reset'))
  }
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size={'sm'} variant="ghost">
          <CoffeeIcon size={30} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold">{t('common:teaPrompt.title')}</h3>
        </div>
        <div className="flex items-center justify-between">
          <p className="font-bold">{t('common:teaPrompt.description')}</p>
          <Button size={'sm'} variant={'outline'} onClick={handleReset}>
            {t('common:teaPrompt.resetButton')}
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <Textarea
            placeholder={t('common:teaPrompt.placeholder')}
            className="h-[60vh]"
            value={teaPrompt}
            onChange={(e) => setTeaPrompt(e.target.value)}
          />
        </div>
        <Button className="w-full" onClick={handleSave}>
          {t('common:buttons.save')}
        </Button>
      </DialogContent>
    </Dialog>
  )
} 