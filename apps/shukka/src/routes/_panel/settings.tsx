import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { siGithub } from 'simple-icons'
import { repository, version as appVersion } from '../../../package.json'
import { PageHeader } from '~/components/page-header.tsx'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { changePasswordMutationOptions } from '~/features/auth/requests/session.ts'
import { translateError, useT } from '~/lib/i18n/index.ts'

export const Route = createFileRoute('/_panel/settings')({ component: SettingsPage })

function SettingsPage() {
  const t = useT()
  return (
    <>
      <PageHeader title={t.settings.title} />
      <div className="grid max-w-2xl gap-10">
        <PasswordCard />
        <AboutSection />
      </div>
    </>
  )
}

const passwordFormId = 'change-password'

function PasswordCard() {
  const t = useT()
  const [status, setStatus] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)
  const changePassword = useMutation(changePasswordMutationOptions())

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setStatus(null)
    try {
      await changePassword.mutateAsync({
        currentPassword: String(data.get('currentPassword') ?? ''),
        newPassword: String(data.get('newPassword') ?? ''),
      })
      form.reset()
      setStatus({ kind: 'success', message: t.settings.updated })
    } catch (cause) {
      setStatus({ kind: 'error', message: translateError(t, cause, t.settings.updateFailed) })
    }
  }

  return (
    <section>
      <h2 className="text-base">{t.settings.changePassword}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.settings.changePasswordDetail}</p>

      <form id={passwordFormId} onSubmit={onSubmit} className="mt-5 grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="currentPassword">{t.settings.currentPassword}</Label>
          <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="newPassword">{t.settings.newPassword}</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
      </form>

      <div className="mt-5 flex items-center justify-between gap-4">
        {status ? (
          <p className={status.kind === 'error' ? 'text-sm text-destructive' : 'flex items-center gap-1.5 text-sm text-success'}>
            {status.kind === 'success' ? <Check className="size-3.5" /> : null}
            {status.message}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t.auth.passwordHint}</p>
        )}
        <Button type="submit" form={passwordFormId} disabled={changePassword.isPending}>
          {changePassword.isPending ? t.settings.changing : t.settings.changePassword}
        </Button>
      </div>
    </section>
  )
}

const githubUrl = repository.url.replace(/^git\+/, '').replace(/\.git$/, '')

function AboutSection() {
  const t = useT()
  return (
    <section>
      <h2 className="text-base">{t.settings.about}</h2>
      <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">{t.settings.version(appVersion)}</p>
      <Button variant="outline" size="sm" className="mt-5" asChild>
        <a href={githubUrl} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={siGithub.path} />
          </svg>
          {t.settings.github}
        </a>
      </Button>
    </section>
  )
}
