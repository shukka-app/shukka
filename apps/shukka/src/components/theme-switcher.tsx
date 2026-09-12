import { useState } from 'react'
import { useT } from '~/lib/i18n/index.ts'
import { getStoredTheme, getSystemTheme, setThemePreference, type Theme } from '~/lib/theme.ts'
import { cn } from '~/lib/utils'

/**
 * Quiet text toggle between Light and Dark, mirroring LanguageSwitcher. Reads
 * live DOM/cookie state, so it must only render client-side — it lives inside
 * the footer dropdown, which mounts on open.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useT()
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme())
  const options = [
    { value: 'light', label: t.roles.light },
    { value: 'dark', label: t.roles.dark },
  ] as const

  return (
    <div className={cn('flex items-center gap-1.5 text-xs', className)} role="group" aria-label={t.roles.appearance}>
      {options.map((option, index) => (
        <span key={option.value} className="flex items-center gap-1.5">
          {index > 0 ? (
            <span aria-hidden className="text-muted-foreground/40">
              /
            </span>
          ) : null}
          <button
            type="button"
            aria-pressed={theme === option.value}
            onClick={() => {
              setThemePreference(option.value)
              setTheme(option.value)
            }}
            className={
              theme === option.value
                ? 'font-medium text-foreground'
                : 'text-muted-foreground transition-colors hover:text-foreground'
            }
          >
            {option.label}
          </button>
        </span>
      ))}
    </div>
  )
}
