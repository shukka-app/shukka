import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CopyBlock } from '~/components/copy-block.tsx'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Badge } from '~/components/ui/badge'
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
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { Confirm } from '~/components/confirm.tsx'
import { useFormatters, useT } from '~/lib/i18n/index.ts'
import { createApiKeyMutationOptions, deleteApiKeyMutationOptions, revokeApiKeyMutationOptions } from './requests/apps.ts'
import type { AppDetail } from '~/server/dashboard.ts'

type ApiKey = AppDetail['keys'][number]

export function ApiKeysPanel({ slug, keys }: { slug: string; keys: AppDetail['keys'] }) {
  const [plaintext, setPlaintext] = useState<string | null>(null)
  const t = useT()

  return (
    <section className="max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-base">{t.apiKeys.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t.apiKeys.description}</p>
        </div>
        <NewKeyDialog slug={slug} onCreated={setPlaintext} />
      </div>

      <div className="mt-5 space-y-4">
        {plaintext ? <PlaintextAlert plaintext={plaintext} /> : null}
        {keys.length > 0 ? <KeysTable slug={slug} keys={keys} /> : <EmptyState />}
      </div>
    </section>
  )
}

/** One-time reveal of a just-created key — the only moment the plaintext exists. */
function PlaintextAlert({ plaintext }: { plaintext: string }) {
  const t = useT()
  return (
    <Alert className="border-flare/40 bg-flare/5">
      <KeyRound className="text-flare" />
      <AlertTitle className="font-normal">{t.apiKeys.copyNow}</AlertTitle>
      <AlertDescription className="block space-y-2.5">
        <span>{t.apiKeys.shownOnce}</span>
        <CopyBlock value={plaintext} className="w-full" />
      </AlertDescription>
    </Alert>
  )
}

function KeysTable({ slug, keys }: { slug: string; keys: ApiKey[] }) {
  const t = useT()
  return (
    <div className="overflow-hidden rounded-2xl bg-card px-4">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs font-normal text-muted-foreground">{t.apiKeys.name}</TableHead>
            <TableHead className="text-xs font-normal text-muted-foreground">{t.apiKeys.key}</TableHead>
            <TableHead className="text-xs font-normal text-muted-foreground">{t.apiKeys.created}</TableHead>
            <TableHead className="text-xs font-normal text-muted-foreground">{t.apiKeys.lastUsed}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => (
            <KeyRow key={key.id} slug={slug} apiKey={key} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Hierarchy runs down the ink ladder, never weight: the name at full ink, the
 * machine hint in mono one step down, dates at the tertiary step. Revoked rows
 * are capped at the secondary step so they read as inactive.
 */
function KeyRow({ slug, apiKey }: { slug: string; apiKey: ApiKey }) {
  const queryClient = useQueryClient()
  const t = useT()
  const revoke = useMutation(revokeApiKeyMutationOptions({ slug, queryClient, t }))
  const deleteKey = useMutation(deleteApiKeyMutationOptions({ slug, queryClient, t }))
  const format = useFormatters()

  return (
    <TableRow className={apiKey.revokedAt ? 'text-muted-foreground' : undefined}>
      <TableCell>{apiKey.name}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{apiKey.hint}</TableCell>
      <TableCell className="text-foreground/40">{format.date(apiKey.createdAt)}</TableCell>
      <TableCell className="text-foreground/40">
        {apiKey.lastUsedAt ? format.dateTime(apiKey.lastUsedAt) : t.apiKeys.never}
      </TableCell>
      <TableCell className="text-right">
        {apiKey.revokedAt ? (
          <div className="flex items-center justify-end gap-2">
            <Badge variant="outline" className="text-muted-foreground">
              {t.apiKeys.revoked}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              aria-label={t.apiKeys.delete}
              onClick={async () => {
                const ok = await Confirm.call({
                  title: t.apiKeys.deleteConfirm(apiKey.name),
                  destructive: true,
                  confirmLabel: t.common.delete,
                })
                if (ok) deleteKey.mutate(apiKey.id)
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={async () => {
              const ok = await Confirm.call({
                title: t.apiKeys.revokeConfirm(apiKey.name),
                destructive: true,
                confirmLabel: t.apiKeys.revoke,
              })
              if (ok) revoke.mutate(apiKey.id)
            }}
          >
            {t.apiKeys.revoke}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

function EmptyState() {
  const t = useT()
  return (
    <div className="grid justify-items-center gap-3 rounded-2xl bg-card px-6 py-14">
      <KeyRound className="size-5 text-foreground/30" />
      <p className="text-sm text-muted-foreground">{t.apiKeys.none}</p>
    </div>
  )
}

function NewKeyDialog({ slug, onCreated }: { slug: string; onCreated: (plaintext: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const queryClient = useQueryClient()
  const t = useT()
  const createKey = useMutation(createApiKeyMutationOptions({ slug, queryClient, t }))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> {t.apiKeys.newKey}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              const result = await createKey.mutateAsync(name)
              onCreated(result.plaintext)
              setName('')
              setOpen(false)
            } catch {
              // toast handled by mutation options
            }
          }}
        >
          <DialogHeader>
            <KeyRound className="size-5 text-muted-foreground" />
            <DialogTitle>{t.apiKeys.newTitle}</DialogTitle>
            <DialogDescription>{t.apiKeys.newDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="key-name">{t.apiKeys.name}</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="github-actions"
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createKey.isPending}>
              {t.apiKeys.createKey}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
