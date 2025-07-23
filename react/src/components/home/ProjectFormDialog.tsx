import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import CommonDialogContent from '@/components/common/DialogContent'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

interface ProjectFormData {
  companyName: string
  productName: string
  dimensions: string
  style: string
  backgroundColor: string
  description: string
  imageCount: number
}

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: ProjectFormData) => void
}

export default function ProjectFormDialog({
  open,
  onOpenChange,
  onSubmit,
}: ProjectFormDialogProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<ProjectFormData>({
    companyName: '',
    productName: '',
    dimensions: '',
    style: '',
    backgroundColor: '',
    description: '',
    imageCount: 1,
  })

  const handleSubmit = () => {
    // 验证必填字段
    if (!formData.companyName.trim() || !formData.productName.trim()) {
      toast.error(t('home:form.validationError'))
      return
    }

    onSubmit(formData)
    // 重置表单
    setFormData({
      companyName: '',
      productName: '',
      dimensions: '',
      style: '',
      backgroundColor: '',
      description: '',
      imageCount: 1,
    })
    onOpenChange(false)
  }

  const handleCancel = () => {
    setFormData({
      companyName: '',
      productName: '',
      dimensions: '',
      style: '',
      backgroundColor: '',
      description: '',
      imageCount: 1,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CommonDialogContent open={open} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('home:form.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 公司名 */}
          <div className="space-y-2">
            <Label htmlFor="company-name">{t('home:form.companyName')} *</Label>
            <Input
              id="company-name"
              autoComplete="off"
              placeholder={t('home:form.companyNamePlaceholder')}
              value={formData.companyName}
              onChange={(e) =>
                setFormData({ ...formData, companyName: e.target.value })
              }
            />
          </div>

          {/* 品名 */}
          <div className="space-y-2">
            <Label htmlFor="product-name">{t('home:form.productName')} *</Label>
            <Input
              id="product-name"
              autoComplete="off"
              placeholder={t('home:form.productNamePlaceholder')}
              value={formData.productName}
              onChange={(e) =>
                setFormData({ ...formData, productName: e.target.value })
              }
            />
          </div>

          {/* 尺寸 */}
          <div className="space-y-2">
            <Label htmlFor="dimensions">{t('home:form.dimensions')}</Label>
            <Input
              id="dimensions"
              autoComplete="off"
              placeholder={t('home:form.dimensionsPlaceholder')}
              value={formData.dimensions}
              onChange={(e) =>
                setFormData({ ...formData, dimensions: e.target.value })
              }
            />
          </div>

          {/* 风格 */}
          <div className="space-y-2">
            <Label htmlFor="style">{t('home:form.style')}</Label>
            <Input
              id="style"
              autoComplete="off"
              placeholder={t('home:form.stylePlaceholder')}
              value={formData.style}
              onChange={(e) =>
                setFormData({ ...formData, style: e.target.value })
              }
            />
          </div>

          {/* 底色 */}
          <div className="space-y-2">
            <Label htmlFor="background-color">{t('home:form.backgroundColor')}</Label>
            <Input
              id="background-color"
              autoComplete="off"
              placeholder={t('home:form.backgroundColorPlaceholder')}
              value={formData.backgroundColor}
              onChange={(e) =>
                setFormData({ ...formData, backgroundColor: e.target.value })
              }
            />
          </div>

          {/* 文字介绍 */}
          <div className="space-y-2">
            <Label htmlFor="description">{t('home:form.description')}</Label>
            <Textarea
              id="description"
              autoComplete="off"
              placeholder={t('home:form.descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
            />
          </div>

          {/* 设计图数量 */}
          <div className="space-y-2">
            <Slider
              label={t('home:form.imageCount')}
              min={1}
              max={10}
              step={1}
              value={formData.imageCount}
              onValueChange={(value) =>
                setFormData({ ...formData, imageCount: value })
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {t('home:form.cancel')}
          </Button>
          <Button onClick={handleSubmit}>
            {t('home:form.submit')}
          </Button>
        </DialogFooter>
      </CommonDialogContent>
    </Dialog>
  )
} 