import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Braces } from 'lucide-react'
import { useId, useRef, useState, type FC } from 'react'
import { toast } from 'sonner'
import { Confirm } from '~/components/confirm.tsx'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { translateError, useT } from '~/lib/i18n/index.ts'
import { releaseMetadataSchema } from '~/lib/release-metadata.ts'
import { replaceMetadataMutationOptions, versionMetadataQueryOptions } from './requests/metadata.ts'

type VersionMetadataDialogProps = { slug: string; channel: string; version: string }
type Draft = { original: string; text: string; error: string | null }

export const VersionMetadataDialog: FC<VersionMetadataDialogProps> = (params) => {
  const t = useT()
  const inputId = useId()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const confirming = useRef(false)
  const query = useQuery(versionMetadataQueryOptions({ ...params, enabled: open }))
  const mutation = useMutation(replaceMetadataMutationOptions({ ...params, queryClient }))
  const original = JSON.stringify(query.data?.metadata ?? {}, null, 2)
  const dirty = draft !== null && draft.text !== draft.original
  const loading = draft === null && query.isFetching

  async function changeOpen(next: boolean) {
    if (mutation.isPending || confirming.current) return
    if (!next && dirty) {
      confirming.current = true
      const discard = await Confirm.call({
        title: t.releaseMetadata.discardTitle,
        description: t.releaseMetadata.discardDescription,
        confirmLabel: t.releaseMetadata.discard,
        destructive: true,
      })
      confirming.current = false
      if (!discard) return
    }
    setDraft(null)
    setOpen(next)
  }

  async function save() {
    if (!draft || !dirty || mutation.isPending) return
    let value: unknown
    try {
      value = JSON.parse(draft.text)
    } catch {
      setDraft({ ...draft, error: t.releaseMetadata.invalidJson })
      return
    }
    const result = releaseMetadataSchema.safeParse(value)
    if (!result.success) {
      setDraft({ ...draft, error: t.releaseMetadata.invalidObject })
      return
    }
    try {
      const saved = await mutation.mutateAsync(result.data)
      const text = JSON.stringify(saved.metadata, null, 2)
      setDraft({ original: text, text, error: null })
      toast.success(t.releaseMetadata.saved)
    } catch (cause) {
      setDraft({ ...draft, error: translateError(t, cause, t.common.requestFailed) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void changeOpen(next)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label={t.releaseMetadata.editVersion(params.version)}
            >
              <Braces />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{t.releaseMetadata.title}</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-xl" showCloseButton={!mutation.isPending}>
        <DialogHeader>
          <DialogTitle>{t.releaseMetadata.editVersion(params.version)}</DialogTitle>
          <DialogDescription>{t.releaseMetadata.description}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">{t.releaseMetadata.loading}</p>
        ) : null}
        {!loading && query.isError && !draft ? (
          <div className="grid gap-3">
            <p role="alert" className="text-sm text-destructive">
              {translateError(t, query.error, t.common.requestFailed)}
            </p>
            <Button variant="outline" onClick={() => void query.refetch()}>{t.releaseMetadata.retry}</Button>
          </div>
        ) : null}
        {!loading && (draft || (query.data && !query.isError)) ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={inputId}>{t.releaseMetadata.json}</Label>
              <Textarea
                id={inputId}
                value={draft?.text ?? original}
                onChange={(event) => setDraft({
                  original: draft?.original ?? original,
                  text: event.target.value,
                  error: null,
                })}
                disabled={mutation.isPending}
                spellCheck={false}
                className="min-h-64 max-h-[50vh] font-mono text-xs"
                aria-invalid={Boolean(draft?.error)}
                aria-describedby={draft?.error ? `${inputId}-error` : undefined}
              />
              {draft?.error ? (
                <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{draft.error}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => void changeOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={!dirty || mutation.isPending}>
                {mutation.isPending ? t.releaseMetadata.saving : t.releaseMetadata.save}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
