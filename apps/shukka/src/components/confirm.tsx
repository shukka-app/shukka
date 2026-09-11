'use client'

import { useState } from 'react'
import { createCallable } from 'react-call'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { useT } from '~/lib/i18n/index.ts'

export type ConfirmProps = {
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export type PromptProps = {
  title: React.ReactNode
  description?: React.ReactNode
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
}

/**
 * Promise-backed confirmation dialog built on the AlertDialog primitive.
 * Mount `<Confirm />` once in the panel layout; call sites do
 * `const ok = await Confirm.call({ title, destructive: true })`.
 */
export const Confirm = createCallable<ConfirmProps, boolean>(({ call, ...props }) => {
  const t = useT()
  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) call.end(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          {props.description ? (
            <AlertDialogDescription>{props.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => call.end(false)}>
            {props.cancelLabel ?? t.common.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={props.destructive ? 'destructive' : 'default'}
            onClick={() => call.end(true)}
          >
            {props.confirmLabel ?? t.common.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
})
Confirm.displayName = 'Confirm'

/**
 * Promise-backed text input dialog built on the Dialog primitive.
 * Resolves with the entered string, or `null` if cancelled.
 */
export const Prompt = createCallable<PromptProps, string | null>(({ call, ...props }) => {
  const t = useT()
  const [value, setValue] = useState(props.defaultValue ?? '')
  return (
    <Dialog open onOpenChange={(open) => { if (!open) call.end(null) }}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            call.end(value)
          }}
        >
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            {props.description ? (
              <DialogDescription>{props.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={props.placeholder}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => call.end(null)}>
              {props.cancelLabel ?? t.common.cancel}
            </Button>
            <Button type="submit">{props.confirmLabel ?? t.common.confirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
})
Prompt.displayName = 'Prompt'
