import { useMutation } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AuthCard } from '~/components/auth-card.tsx'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { loginMutationOptions } from '~/features/auth/requests/session.ts'
import { translateError, useT } from '~/lib/i18n/index.ts'
import { getSessionState } from '~/server/session-fn.ts'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const session = await getSessionState()
    if (!session.initialized) throw redirect({ to: '/setup' })
    if (session.authenticated) throw redirect({ to: '/apps' })
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const t = useT()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const login = useMutation(loginMutationOptions())

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await login.mutateAsync({ password })
      await router.navigate({ to: '/apps' })
    } catch (cause) {
      setError(translateError(t, cause, t.auth.loginFailed))
    }
  }

  return (
    <AuthCard title={t.auth.loginTitle} description={t.auth.loginDescription} error={error} onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="password">{t.auth.password}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={login.isPending} className="w-full">
        {login.isPending ? t.auth.signingIn : t.auth.signIn}
      </Button>
    </AuthCard>
  )
}
