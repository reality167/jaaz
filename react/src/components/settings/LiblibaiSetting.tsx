import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { LLMConfig } from '@/types/types'
import { useTranslation } from 'react-i18next'
import AddModelsList from './AddModelsList'
import { ExternalLink } from 'lucide-react'

interface LiblibaiSettingProps {
  config: LLMConfig
  onConfigChange: (key: string, newConfig: LLMConfig) => void
}

export default function LiblibaiSetting({
  config,
  onConfigChange,
}: LiblibaiSettingProps) {
  const { t } = useTranslation()

  const handleModelsChange = (
    models: Record<string, { type?: 'text' | 'image' | 'video' }>
  ) => {
    onConfigChange('liblibai', {
      ...config,
      models,
    })
  }

  const handleChange = (field: keyof LLMConfig, value: string | number) => {
    onConfigChange('liblibai', {
      ...config,
      [field]: value,
    })
  }

  return (
    <div className="space-y-4">
      {/* Provider Header */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <img
            src="https://www.liblib.art/favicon.ico"
            alt="LiblibAI"
            className="w-10 h-10 rounded-full"
          />
          <div>
            <p className="font-bold text-2xl w-fit">LiblibAI</p>
            <p className="text-sm text-muted-foreground">星流一站式创意设计 Agent</p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open('https://www.liblib.art', '_blank')}
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          官网
        </Button>
      </div>

      {/* API Configuration */}
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor="liblibai-url">{t('settings:providers.url')}</Label>
          <Input
            id="liblibai-url"
            value={config.url || ''}
            onChange={(e) => handleChange('url', e.target.value)}
            placeholder="https://openapi.liblibai.cloud"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="liblibai-access-key">AccessKey (访问密钥)</Label>
          <Input
            id="liblibai-access-key"
            type="password"
            value={config.access_key || ''}
            onChange={(e) => handleChange('access_key', e.target.value)}
            placeholder="输入你的 LiblibAI AccessKey"
          />
          <p className="text-xs text-muted-foreground">
            用于开放平台授权的访问密钥，唯一识别访问用户，长度通常在20-30位左右
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="liblibai-secret-key">SecretKey (API访问密钥)</Label>
          <Input
            id="liblibai-secret-key"
            type="password"
            value={config.secret_key || ''}
            onChange={(e) => handleChange('secret_key', e.target.value)}
            placeholder="输入你的 LiblibAI SecretKey"
          />
          <p className="text-xs text-muted-foreground">
            用于加密请求参数生成的签名，避免请求参数被恶意篡改，长度通常在30位以上
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="liblibai-max-tokens">{t('settings:providers.maxTokens')}</Label>
          <Input
            id="liblibai-max-tokens"
            type="number"
            value={config.max_tokens || 8192}
            onChange={(e) => handleChange('max_tokens', parseInt(e.target.value))}
            placeholder="8192"
          />
        </div>
      </div>

      {/* Models Configuration */}
      <div className="space-y-2">
        <Label>{t('settings:models.title')}</Label>
        <AddModelsList
          models={config.models || {}}
          onChange={handleModelsChange}
        />
      </div>
    </div>
  )
} 