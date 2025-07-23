import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  showValue?: boolean
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  value?: number
  onValueChange?: (value: number) => void
  showMinMax?: boolean
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ 
    className, 
    label, 
    showValue = true, 
    min = 1, 
    max = 10, 
    step = 1, 
    defaultValue = 1,
    value,
    onValueChange,
    showMinMax = true,
    ...props 
  }, ref) => {
    const [currentValue, setCurrentValue] = React.useState(value ?? defaultValue)
    const [isDragging, setIsDragging] = React.useState(false)

    React.useEffect(() => {
      if (value !== undefined) {
        setCurrentValue(value)
      }
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseInt(e.target.value)
      setCurrentValue(newValue)
      onValueChange?.(newValue)
    }

    const handleMouseDown = () => {
      setIsDragging(true)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    React.useEffect(() => {
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }, [])

    const percentage = ((currentValue - min) / (max - min)) * 100

    return (
      <div className="space-y-3">
        {label && (
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">{label}</label>
            {showValue && (
              <span className="text-sm font-semibold text-primary bg-primary/10 px-2 py-1 rounded-md">
                {currentValue}
              </span>
            )}
          </div>
        )}
        <div className="relative flex items-center">
          <div className="relative w-full">
            <input
              ref={ref}
              type="range"
              min={min}
              max={max}
              step={step}
              value={currentValue}
              onChange={handleChange}
              onMouseDown={handleMouseDown}
              className={cn(
                'slider-enhanced',
                isDragging && 'slider-dragging',
                className
              )}
              style={{ ['--percent' as any]: `${percentage}%` }}
              {...props}
            />
            
            {/* 进度条背景 */}
            <div className="absolute inset-0 pointer-events-none">
              <div 
                className="h-2 bg-muted rounded-full"
                style={{ width: '100%' }}
              />
              <div 
                className="h-2 bg-primary rounded-full transition-all duration-200 ease-out"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
          
          {/* 两端数字 */}
          {showMinMax && (
            <>
              <div className="absolute left-0 -bottom-6 text-xs text-muted-foreground font-medium">
                {min}
              </div>
              <div className="absolute right-0 -bottom-6 text-xs text-muted-foreground font-medium">
                {max}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
)

Slider.displayName = "Slider"

export { Slider }

/*
使用示例：

// 基础用法
<Slider
  label="数量"
  min={1}
  max={10}
  value={5}
  onValueChange={(value) => console.log(value)}
/>

// 隐藏最小最大值
<Slider
  label="透明度"
  min={0}
  max={100}
  step={5}
  showMinMax={false}
  onValueChange={(value) => console.log(value)}
/>

// 自定义样式
<Slider
  label="音量"
  min={0}
  max={100}
  className="w-64"
  onValueChange={(value) => console.log(value)}
/>
*/ 