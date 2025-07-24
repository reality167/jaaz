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

  // ********** Canvas events - Start **********
  'Canvas::AddImagesToChat': TCanvasAddImagesToChatEvent
  'Canvas::SplitLayers': TCanvasAddImagesToChatEvent
  'Canvas::SplitLayersStarted': {
    type: string
    canvas_id: string
    task_id: string
    message: string
    timestamp: number
  }
  'Canvas::SplitLayersSuccess': {
    type: string
    canvas_id: string
    message: string
    timestamp: number
  }
  'Canvas::SplitLayersError': {
    type: string
    canvas_id: string
    message: string
    timestamp: number
  }
  'Canvas::SplitLayersCancelled': {
    type: string
    canvas_id: string
    task_id: string
    message: string
    timestamp: number
  }
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
  // ********** Canvas events - End **********
}

export const eventBus = mitt<TEvents>()
