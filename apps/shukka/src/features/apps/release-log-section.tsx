import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { translateError, useT } from '~/lib/i18n/index.ts'
import type { NotesConfig } from '~/lib/release-log.ts'
import { ReleaseLogConfigFields } from './release-log-fields.tsx'
import { updateNotesConfigMutationOptions } from './requests/notes.ts'
import type { PublicApp } from '~/server/dashboard.ts'

/**
 * Settings → Release log section. Saves through the dedicated notes-config
 * endpoint, not AppForm's PATCH, so saving never fires the S3 storage probe
 * (ADR: release-log).
 */
export function ReleaseLogSection({ slug, app }: { slug: string; app: PublicApp }) {
  const t = useT()
  const queryClient = useQueryClient()
  const updateConfig = useMutation(updateNotesConfigMutationOptions({ queryClient }))
  const [value, setValue] = useState<NotesConfig>({
    enabled: app.releaseLogEnabled,
    locales: app.releaseLogLocales,
    fallbackLocale: app.releaseLogFallbackLocale,
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save() {
    setError(null)
    setSaved(false)
    try {
      await updateConfig.mutateAsync({ slug, ...value })
      setSaved(true)
    } catch (cause) {
      setError(translateError(t, cause, t.common.requestFailed))
    }
  }

  return (
    <section>
      <h3 className="text-base">{t.releaseLog.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t.releaseLog.detail}</p>
      <div className="mt-5 max-w-md">
        <ReleaseLogConfigFields
          value={value}
          onChange={(next) => {
            setValue(next)
            setSaved(false)
          }}
        />
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void save()} disabled={updateConfig.isPending}>
            {t.releaseLog.saveConfig}
          </Button>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : saved ? (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <Check className="size-3.5" />
              {t.releaseLog.saved}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
