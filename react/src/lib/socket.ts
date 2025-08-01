import * as ISocket from '@/types/socket'
import { io, Socket } from 'socket.io-client'
import { eventBus } from './event'

export interface SocketConfig {
  serverUrl?: string
  autoConnect?: boolean
}

export class SocketIOManager {
  private socket: Socket | null = null
  private connected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor(private config: SocketConfig = {}) {
    if (config.autoConnect !== false) {
      this.connect()
    }
  }

  connect(serverUrl?: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const url = serverUrl || this.config.serverUrl

      if (this.socket) {
        this.socket.disconnect()
      }

      this.socket = io(url, {
        transports: ['websocket'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        // @ts-ignore - Socket.IO支持这些选项，但TypeScript定义可能不完整
        pingTimeout: 60000,  // 增加到60秒，防止长时间操作时超时
        pingInterval: 25000  // 增加心跳间隔到25秒
      })

      this.socket.on('connect', () => {
        console.log('✅ Socket.IO connected:', this.socket?.id)
        this.connected = true
        this.reconnectAttempts = 0
        resolve(true)
      })

      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket.IO connection error:', error)
        this.connected = false
        this.reconnectAttempts++

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(
            new Error(
              `Failed to connect after ${this.maxReconnectAttempts} attempts`
            )
          )
        }
      })

      this.socket.on('disconnect', (reason) => {
        console.log('🔌 Socket.IO disconnected:', reason)
        this.connected = false
      })

      this.registerEventHandlers()
    })
  }

  private registerEventHandlers() {
    if (!this.socket) return

    this.socket.on('connected', (data) => {
      console.log('🔗 Socket.IO connection confirmed:', data)
    })

    this.socket.on('init_done', (data) => {
      console.log('🔗 Server initialization done:', data)
    })

    this.socket.on('session_update', (data) => {
      this.handleSessionUpdate(data)
    })

    this.socket.on('canvas_notification', (data) => {
      this.handleCanvasNotification(data)
    })
    
    this.socket.on('task_notification', (data) => {
      this.handleTaskNotification(data)
    })

    this.socket.on('pong', (data) => {
      console.log('🔗 Pong received:', data)
    })
  }

  private handleSessionUpdate(data: ISocket.SessionUpdateEvent) {
    const { session_id, type } = data

    console.log('🔍 Session update received:', { session_id, type })
    
    // 详细记录layer_added事件
    if (type === 'layer_added') {
      console.log('📊 Layer added event details:', {
        session_id,
        canvas_id: (data as any).canvas_id,
        content: (data as any).content,
        element_id: (data as any).element?.id,
        file_id: (data as any).file?.id,
        file_url: (data as any).file?.dataURL
      })
    }

    if (!session_id) {
      console.warn('⚠️ Session update missing session_id:', data)
      return
    }

    switch (type) {
      case ISocket.SessionEventType.Delta:
        eventBus.emit('Socket::Session::Delta', data)
        break
      case ISocket.SessionEventType.ToolCall:
        eventBus.emit('Socket::Session::ToolCall', data)
        break
      case ISocket.SessionEventType.ToolCallArguments:
        eventBus.emit('Socket::Session::ToolCallArguments', data)
        break
      case ISocket.SessionEventType.ToolCallProgress:
        eventBus.emit('Socket::Session::ToolCallProgress', data)
        break
      case ISocket.SessionEventType.ImageGenerated:
        eventBus.emit('Socket::Session::ImageGenerated', data)
        break
      case ISocket.SessionEventType.AllMessages:
        eventBus.emit('Socket::Session::AllMessages', data)
        break
      case ISocket.SessionEventType.Done:
        eventBus.emit('Socket::Session::Done', data)
        break
      case ISocket.SessionEventType.Error:
        eventBus.emit('Socket::Session::Error', data)
        break
      case ISocket.SessionEventType.Info:
        eventBus.emit('Socket::Session::Info', data)
        break
      case ISocket.SessionEventType.LayerAdded:
        eventBus.emit('Socket::Session::LayerAdded', data)
        break
      case 'layer_added': // 添加对字符串类型'layer_added'的处理
        eventBus.emit('Socket::Session::LayerAdded', data)
        break
      default:
        console.log('⚠️ Unknown session update type:', type)
    }
  }

  private handleCanvasNotification(data: any) {
    console.log('🎨 Canvas notification received:', data)
    
    // 根据通知类型处理不同的消息
    switch (data.type) {
      case 'layer_added':
        console.log('📊 Layer added event received via canvas_notification:', {
          canvas_id: data.canvas_id,
          content: data.content,
          element_id: data.element?.id,
          file_id: data.file?.id,
          file_url: data.file?.dataURL
        })
        eventBus.emit('Socket::Session::LayerAdded', data)
        break
      case 'adjust_view':
        console.log('🔍 Adjust view event received:', data)
        eventBus.emit('Canvas::AdjustView', { canvas_id: data.canvas_id })
        break
      default:
        console.log('⚠️ Unknown canvas notification type:', data.type)
    }
  }
  
  private handleTaskNotification(data: any) {
    console.log('📋 Task notification received:', data)
    
    // 根据通知类型处理不同的任务消息
    if (data.type === 'split_layers_success') {
      eventBus.emit('Canvas::SplitLayersSuccess', data)
      eventBus.emit('Canvas::AdjustView', { canvas_id: data.canvas_id })
    } else if (data.task_type === 'split_layers') {
      switch (data.status) {
        case 'pending':
          eventBus.emit('Canvas::SplitLayersStarted', data)
          break
        case 'running':
          eventBus.emit('Canvas::TaskProgress', data)
          break
        case 'completed':
          eventBus.emit('Canvas::SplitLayersSuccess', data)
          break
        case 'failed':
          eventBus.emit('Canvas::SplitLayersError', data)
          break
        case 'cancelled':
          eventBus.emit('Canvas::SplitLayersCancelled', data)
          break
        default:
          eventBus.emit('Canvas::TaskProgress', data)
      }
    } else {
      // 其他类型的任务
      eventBus.emit('Task::Notification', data)
    }
  }

  ping(data: unknown) {
    if (this.socket && this.connected) {
      this.socket.emit('ping', data)
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.connected = false
      console.log('🔌 Socket.IO manually disconnected')
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  getSocketId(): string | undefined {
    return this.socket?.id
  }

  getSocket(): Socket | null {
    return this.socket
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts
  }

  isMaxReconnectAttemptsReached(): boolean {
    return this.reconnectAttempts >= this.maxReconnectAttempts
  }
}

export const socketManager = new SocketIOManager({
  serverUrl: 'http://localhost:57988',
})
