import LanguageSwitcher from '@/components/common/LanguageSwitcher'
import { NotificationPanel } from '@/components/common/NotificationPanel'
import ThemeButton from '@/components/theme/ThemeButton'
import { Button } from '@/components/ui/button'
import { LOGO_URL } from '@/constants'
import { useConfigs } from '@/contexts/configs'
import { SettingsIcon, ChevronDown, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { UserMenu } from '@/components/auth/UserMenu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { deleteCanvas, listCanvases } from '@/api/canvas'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/utils/formatDate'
import { ImageIcon } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

function HomeHeader() {
  const { setShowSettingsDialog } = useConfigs()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [canvasToDelete, setCanvasToDelete] = useState<{id: string, name: string} | null>(null)
  
  const { data: canvases } = useQuery({
    queryKey: ['canvases'],
    queryFn: listCanvases,
  })

  const handleCanvasClick = (id: string) => {
    navigate({ to: '/canvas/$id', params: { id } })
  }

  const handleDeleteClick = (e: React.MouseEvent, canvas: {id: string, name: string}) => {
    e.stopPropagation()
    setCanvasToDelete(canvas)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!canvasToDelete) return
    
    try {
      await deleteCanvas(canvasToDelete.id)
      toast.success(t('canvas:messages.canvasDeleted'))
      queryClient.invalidateQueries({ queryKey: ['canvases'] })
    } catch (error) {
      toast.error(t('canvas:messages.failedToDelete'))
      console.error('Failed to delete canvas:', error)
    } finally {
      setDeleteDialogOpen(false)
      setCanvasToDelete(null)
    }
  }

  return (
    <>
      <motion.div
        className="sticky top-0 z-0 flex w-full h-12 bg-background px-4 justify-between items-center select-none"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 p-2 hover:bg-accent">
                <img src={LOGO_URL} alt="logo" className="size-8" draggable={false} />
                <p className="text-xl font-bold">ArtBox</p>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-96 max-h-[70vh] overflow-y-auto">
              <DropdownMenuLabel>{t('home:allProjects')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canvases && canvases.length > 0 ? (
                canvases.map((canvas) => (
                  <DropdownMenuItem
                    key={canvas.id}
                    onClick={() => handleCanvasClick(canvas.id)}
                    className="flex items-start gap-3 p-4 cursor-pointer hover:bg-accent group"
                  >
                    <div className="flex-shrink-0">
                      {canvas.thumbnail ? (
                        <img
                          src={canvas.thumbnail}
                          alt={canvas.name}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 opacity-10" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{canvas.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(canvas.created_at)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDeleteClick(e, canvas)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled className="text-center text-muted-foreground py-8">
                  {t('home:noCanvases')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2">
          <NotificationPanel />
          <Button
            size={'sm'}
            variant="ghost"
            onClick={() => setShowSettingsDialog(true)}
          >
            <SettingsIcon size={30} />
          </Button>
          <LanguageSwitcher />
          <ThemeButton />
          {/* disable user login until cloud server is ready */}
          <UserMenu />
        </div>
      </motion.div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('canvas:deleteDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('canvas:deleteDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('canvas:deleteDialog.cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t('canvas:deleteDialog.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default HomeHeader
