import type { LLMConfig, ToolCallFunctionName } from '@/types/types'

// API Configuration
export const BASE_API_URL = import.meta.env.DEV
  ? 'http://localhost:3000'
  : 'https://jaaz.app'

export const PROVIDER_NAME_MAPPING: {
  [key: string]: { name: string; icon: string }
} = {
  jaaz: {
    name: 'Jaaz',
    icon: 'https://raw.githubusercontent.com/11cafe/jaaz/refs/heads/main/assets/icons/jaaz.png',
  },
  anthropic: {
    name: 'Claude',
    icon: 'https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files/dark/claude-color.png',
  },
  openai: { name: 'OpenAI', icon: 'https://openai.com/favicon.ico' },
  replicate: {
    name: 'Replicate',
    icon: 'https://images.seeklogo.com/logo-png/61/1/replicate-icon-logo-png_seeklogo-611690.png',
  },
  ollama: {
    name: 'Ollama',
    icon: 'https://images.seeklogo.com/logo-png/59/1/ollama-logo-png_seeklogo-593420.png',
  },
  huggingface: {
    name: 'Hugging Face',
    icon: 'https://huggingface.co/favicon.ico',
  },
  wavespeed: {
    name: 'WaveSpeedAi',
    icon: 'https://www.wavespeed.ai/favicon.ico',
  },
  volces: {
    name: 'Volces',
    icon: 'https://portal.volccdn.com/obj/volcfe/misc/favicon.png',
  },
  comfyui: {
    name: 'ComfyUI',
    icon: 'https://framerusercontent.com/images/3cNQMWKzIhIrQ5KErBm7dSmbd2w.png',
  },
  liblibai: {
    name: 'LiblibAI',
    icon: 'https://www.liblib.art/favicon.ico',
  },
}

export const DEFAULT_PROVIDERS_CONFIG: { [key: string]: LLMConfig } = {
  volces: {
    models: {
      'doubao-seed-1-6-250615': { type: 'text' },
      'doubao-seed-1-6-thinking-250615': { type: 'text' },
      'deepseek-v3-250324': { type: 'text' },
      'deepseek-r1-250528': { type: 'text' },
      'kimi-k2-250711': { type: 'text' },
      'doubao-seedream-3-0-t2i-250415': { type: 'image' },
      'doubao-seededit-3-0-i2i-250628': { type: 'image' },
    },
    url: 'https://ark.cn-beijing.volces.com/api/v3/',
    api_key: '',
    max_tokens: 8192,
  },
  replicate: {
    models: {
      'google/imagen-4': { type: 'image' },
      'black-forest-labs/flux-1.1-pro': { type: 'image' },
      'black-forest-labs/flux-kontext-pro': { type: 'image' },
      'black-forest-labs/flux-kontext-max': { type: 'image' },
      'recraft-ai/recraft-v3': { type: 'image' },
      'stability-ai/sdxl': { type: 'image' },
    },
    url: 'https://api.replicate.com/v1/',
    api_key: '',
    max_tokens: 8192,
  },
  liblibai: {
    models: {
      // 星流Star-3 Alpha模型
      'star-3-alpha': { type: 'image' },
    },
    url: 'https://openapi.liblibai.cloud',
    access_key: '',
    secret_key: '',
    max_tokens: 8192,
  },
}

export const DEFAULT_MODEL_LIST = Object.keys(DEFAULT_PROVIDERS_CONFIG).flatMap(
  (provider) =>
    Object.keys(DEFAULT_PROVIDERS_CONFIG[provider].models).map((model) => ({
      provider,
      model,
      type: DEFAULT_PROVIDERS_CONFIG[provider].models[model].type ?? 'text',
      url: DEFAULT_PROVIDERS_CONFIG[provider].url,
    }))
)

// Tool call name mapping
export const TOOL_CALL_NAME_MAPPING: { [key in ToolCallFunctionName]: string } =
  {
    generate_image: 'Generate Image',
    prompt_user_multi_choice: 'Prompt Multi-Choice',
    prompt_user_single_choice: 'Prompt Single-Choice',
    write_plan: 'Write Plan',
    finish: 'Finish',
  }

export const LOGO_URL = 'https://jaaz.app/favicon.ico'

export const DEFAULT_SYSTEM_PROMPT = `You are a professional art design agent. You can write very professional image prompts to generate aesthetically pleasing images that best fulfilling and matching the user's request.
Step 1. write a design strategy plan. Write in the same language as the user's inital first prompt.

Example Design Strategy Doc:
Design Proposal for "MUSE MODULAR – Future of Identity" Cover
• Recommended resolution: 1024 × 1536 px (portrait) – optimal for a standard magazine trim while preserving detail for holographic accents.

• Style & Mood
– High-contrast grayscale base evoking timeless editorial sophistication.
– Holographic iridescence selectively applied (cyan → violet → lime) for mask edges, title glyphs and micro-glitches, signalling futurism and fluid identity.
– Atmosphere: enigmatic, cerebral, slightly unsettling yet glamorous.

• Key Visual Element
– Central androgynous model, shoulders-up, lit with soft frontal key and twin rim lights.
– A translucent polygonal AR mask overlays the face; within it, three offset "ghost" facial layers (different eyes, nose, mouth) hint at multiple personas.
– Subtle pixel sorting/glitch streaks emanate from mask edges, blending into background grid.

• Composition & Layout

Masthead "MUSE MODULAR" across the top, extra-condensed modular sans serif; characters constructed from repeating geometric units. Spot UV + holo foil.
Tagline "Who are you today?" centered beneath masthead in ultra-light italic.
Subject's gaze directly engages reader; head breaks the baseline of the masthead for depth.
Bottom left kicker "Future of Identity Issue" in tiny monospaced capitals.
Discreet modular grid lines and data glyphs fade into matte charcoal background, preserving negative space.
• Color Palette
#000000, #1a1a1a, #4d4d4d, #d9d9d9 + holographic gradient (#00eaff, #c400ff, #38ffab).

• Typography
– Masthead: custom variable sans with removable modules.
– Tagline: thin italic grotesque.
– Secondary copy: 10 pt monospaced to reference code.

• Print Finishing
– Soft-touch matte laminate overall.
– Spot UV + holographic foil on masthead, mask outline and glitch shards.

Step 2. Call generate_image tool to generate the image based on the plan immediately, use a detailed and professional image prompt according to your design strategy plan, no need to ask for user's approval. 
`

export const TEA_PACKAGING_PROMPT = `设计需求：为一家茶叶厂家设计包装平面图

项目信息：
公司名：\${formData.companyName}
品名：\${formData.productName}
尺寸：\${formData.dimensions}
风格：\${formData.style}
底色：\${formData.backgroundColor}
文字介绍：\${formData.description}
设计图数量：\${formData.imageCount}张

设计要求：
1. 这是一个茶叶产品的包装平面图设计
2. 需要体现茶叶产品的特色和品质
3. 包装设计要符合茶叶行业的审美标准
4. 包含产品名称、品牌标识、产品信息等必要元素
5. 设计风格要符合茶叶产品的定位和目标消费群体
6. 请生成\${formData.imageCount}张不同的设计方案供选择

请根据以上信息生成专业的茶叶包装平面图设计。`
