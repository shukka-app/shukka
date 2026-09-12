import { useMutation } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AuthCard } from '~/components/auth-card.tsx'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { setupMutationOptions } from '~/features/auth/requests/session.ts'
import { translateError, useT } from '~/lib/i18n/index.ts'
import { getSessionState } from '~/server/session-fn.ts'

export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    const session = await getSessionState()
    if (session.initialized) throw redirect({ to: session.authenticated ? '/apps' : '/login' })
  },
  component: SetupPage,
})

function SetupPage() {
  const router = useRouter()
  const t = useT()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const setup = useMutation(setupMutationOptions())

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      setError(t.auth.passwordMismatch)
      return
    }
    setError(null)
    try {
      await setup.mutateAsync({ password })
      await router.navigate({ to: '/apps' })
    } catch (cause) {
      setError(translateError(t, cause, t.auth.setupFailed))
    }
  }

  return (
    <AuthCard title={t.auth.setupTitle} description={t.auth.setupDescription} error={error} onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="password">{t.auth.adminPassword}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t.auth.passwordHint}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">{t.auth.confirmPassword}</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={setup.isPending} className="w-full">
        {setup.isPending ? t.auth.creating : t.auth.createAccount}
      </Button>
    </AuthCard>
  )
}
