import type { FormEvent, ReactNode } from 'react'
import { PackageIcon } from './brand.tsx'
import { LanguageSwitcher } from './language-switcher.tsx'

type AuthShellProps = {
  title: string
  description: string
  error: string | null
  children: ReactNode
  onSubmit: (event: FormEvent) => void
}

/** Quiet, borderless auth surface: brand mark, modest heading, one narrow column. */
export function AuthCard({ title, description, error, children, onSubmit }: AuthShellProps) {
  return (
    <main className="relative flex min-h-svh items-center justify-center p-6">
      <div className="absolute top-5 right-6">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-xs">
        <PackageIcon className="size-8" />
        <h1 className="mt-6 text-2xl tracking-tight text-balance">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <form onSubmit={onSubmit} className="mt-8 grid gap-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {children}
        </form>
      </div>
    </main>
  )
}
