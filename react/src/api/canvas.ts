import { CanvasData, Message, Session } from '@/types/types'

export type ListCanvasesResponse = {
  id: string
  name: string
  description?: string
  thumbnail?: string
  created_at: string
}

export async function listCanvases(): Promise<ListCanvasesResponse[]> {
  const response = await fetch('/api/canvas/list')
  return await response.json()
}

export async function createCanvas(data: {
  name: string
  canvas_id: string
  messages: Message[]
  session_id: string
  text_model: {
    provider: string
    model: string
    url: string
  }
  image_model: {
    provider: string
    model: string
    url: string
  }
  system_prompt: string
}): Promise<{ id: string }> {
  const response = await fetch('/api/canvas/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return await response.json()
}

export async function getCanvas(
  id: string
): Promise<{ data: CanvasData; name: string; sessions: Session[] }> {
  const response = await fetch(`/api/canvas/${id}`)
  return await response.json()
}

export async function saveCanvas(
  id: string,
  payload: {
    data: CanvasData
    thumbnail: string
  }
): Promise<void> {
  const response = await fetch(`/api/canvas/${id}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return await response.json()
}

export async function renameCanvas(id: string, name: string): Promise<void> {
  const response = await fetch(`/api/canvas/${id}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return await response.json()
}

export async function deleteCanvas(id: string): Promise<void> {
  const response = await fetch(`/api/canvas/${id}/delete`, {
    method: 'DELETE',
  })
  return await response.json()
}

export async function splitLayers(
  id: string,
  data?: any
): Promise<{ success: boolean; message: string; canvas_id: string; task_id?: string; status?: string }> {
  const response = await fetch(`/api/canvas/${id}/split-layers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  })
  return await response.json()
}

export async function getSplitLayersStatus(
  id: string,
  taskId: string
): Promise<{ success: boolean; task_status?: any; message?: string }> {
  const response = await fetch(`/api/canvas/${id}/split-layers/${taskId}`)
  return await response.json()
}

export async function cancelSplitLayers(
  id: string,
  taskId: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`/api/canvas/${id}/split-layers/${taskId}`, {
    method: 'DELETE',
  })
  return await response.json()
}

export async function listSplitLayersTasks(
  id: string
): Promise<{ success: boolean; tasks?: any[]; message?: string }> {
  const response = await fetch(`/api/canvas/${id}/split-layers`)
  return await response.json()
}
