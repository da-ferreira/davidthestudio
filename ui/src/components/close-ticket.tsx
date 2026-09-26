import { useState } from 'react'
import { Archive } from 'lucide-react'
import type { Ticket } from '@studio/shared'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ApiError, api } from '@/lib/api'

export function CloseTicketButton({ ticket }: { ticket: Ticket }) {
  const [open, setOpen] = useState(false)
  const [reasons, setReasons] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = async (discard: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await api(`/tickets/${ticket.id}/close`, { method: 'POST', body: { discard } })
      setOpen(false)
    } catch (err) {
      if (err instanceof ApiError && err.reasons.length) setReasons(err.reasons)
      else setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const discard = !!reasons?.length

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto"
        onClick={() => {
          setReasons(null)
          setError(null)
          setOpen(true)
        }}
      >
        <Archive />
        Encerrar
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar {ticket.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              {discard
                ? 'Há trabalho que ainda não foi para o GitHub. Se descartar, ele se perde.'
                : `As worktrees saem de ${ticket.taskDir}; a branch ${ticket.branch} e os PRs ficam. O log, o chat e o diff continuam gravados no ticket.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {discard && (
            <ul className="list-disc pl-5 text-[13px]">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={discard ? 'destructive' : 'default'}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                close(discard)
              }}
            >
              {busy ? 'Encerrando…' : discard ? 'Descartar e encerrar' : 'Encerrar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
