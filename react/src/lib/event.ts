import mitt from 'mitt'
import * as ISocket from '@/types/socket'

export type TCanvasAddImagesToChatEvent = Array<{
  fileId: string
  base64?: string
  width: number
  height: number
  x: number
  y: number
}>

// 添加图像预览事件类型
export type TImagePreviewEvent = Array<{
  file_id: string
  width: number
  height: number
}>

// 分层操作的基础事件类型
export type TCanvasSplitLayersBaseEvent = {
  type: string
  canvas_id: string
  message: string
  timestamp: number
}

// 带有任务ID的分层事件类型
export type TCanvasSplitLayersTaskEvent = TCanvasSplitLayersBaseEvent & {
  task_id: string
}

export type TEvents = {
  // ********** Socket events - Start **********
  'Socket::Session::Error': ISocket.SessionErrorEvent
  'Socket::Session::Done': ISocket.SessionDoneEvent
  'Socket::Session::Info': ISocket.SessionInfoEvent
  'Socket::Session::ImageGenerated': ISocket.SessionImageGeneratedEvent
  'Socket::Session::Delta': ISocket.SessionDeltaEvent
  'Socket::Session::ToolCall': ISocket.SessionToolCallEvent
  'Socket::Session::ToolCallArguments': ISocket.SessionToolCallArgumentsEvent
  'Socket::Session::AllMessages': ISocket.SessionAllMessagesEvent
  'Socket::Session::ToolCallProgress': ISocket.SessionToolCallProgressEvent
  'Socket::Session::LayerAdded': ISocket.SessionLayerAddedEvent
  // ********** Socket events - End **********
  
  // ********** Task events - Start **********
  'Task::Notification': any // 通用任务通知事件
  // ********** Task events - End **********

  // ********** Canvas events - Start **********
  'Canvas::AddImagesToChat': TCanvasAddImagesToChatEvent
  'Canvas::ImagesToPreview': TImagePreviewEvent  // 添加图像预览事件
  'Canvas::SplitLayers': TCanvasAddImagesToChatEvent
  'Canvas::SplitLayersStarted': TCanvasSplitLayersTaskEvent
  'Canvas::SplitLayersSuccess': TCanvasSplitLayersBaseEvent
  'Canvas::SplitLayersError': TCanvasSplitLayersBaseEvent
  'Canvas::SplitLayersCancelled': TCanvasSplitLayersTaskEvent
  'Canvas::TaskProgress': {
    type: string
    canvas_id: string
    task_id: string
    task_type: string
    status: string
    progress: {
      current_step: number
      total_steps: number
      percentage: number
      message: string
    }
  }
  'Canvas::AdjustView': {
    canvas_id: string
  }
  // ********** Canvas events - End **********
}

export const eventBus = mitt<TEvents>()
