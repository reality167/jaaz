import { getCanvas, renameCanvas } from '@/api/canvas'
import CanvasExcali from '@/components/canvas/CanvasExcali'
import CanvasHeader from '@/components/canvas/CanvasHeader'
import CanvasMenu from '@/components/canvas/menu'
import CanvasPopbarWrapper from '@/components/canvas/pop-bar'
import ChatInterface from '@/components/chat/Chat'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { CanvasProvider } from '@/contexts/canvas'
import { Session } from '@/types/types'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/canvas/$id')({
  component: Canvas,
})

function Canvas() {
  const { id } = useParams({ from: '/canvas/$id' })
  const [canvas, setCanvas] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [canvasName, setCanvasName] = useState('')
  const [sessionList, setSessionList] = useState<Session[]>([])

  useEffect(() => {
    let mounted = true

    const fetchCanvas = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const data = await getCanvas(id)
        if (mounted) {
          setCanvas(data)
          setCanvasName(data.name)
          setSessionList(data.sessions)
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err
              : new Error('Failed to fetch canvas data')
          )
          console.error('Failed to fetch canvas data:', err)
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchCanvas()

    return () => {
      mounted = false
    }
  }, [id])

  const handleNameSave = async () => {
    await renameCanvas(id, canvasName)
  }

  return (
    <CanvasProvider>
      <div className="flex flex-col w-screen h-screen">
        <CanvasHeader
          canvasName={canvasName}
          canvasId={id}
          onNameChange={setCanvasName}
          onNameSave={handleNameSave}
        />
        <ResizablePanelGroup
          direction="horizontal"
          className="w-screen h-screen"
          autoSaveId="jaaz-chat-panel"
        >
          <ResizablePanel className="relative" defaultSize={80}>
            <div className="w-full h-full">
              {isLoading ? (
                <div className="flex-1 flex-grow px-4 bg-accent w-[24%] absolute right-0">
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              ) : (
                <>
                  <CanvasExcali canvasId={id} initialData={canvas?.data} />
                  <CanvasMenu />
                  <CanvasPopbarWrapper />
                </>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={25} maxSize={40} minSize={20}>
            <div className="flex-1 flex-grow bg-accent/50 w-full">
              <ChatInterface
                canvasId={id}
                sessionList={sessionList}
                setSessionList={setSessionList}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </CanvasProvider>
  )
}
