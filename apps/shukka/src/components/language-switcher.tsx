import { useLocale, useSetLocale, useT } from '~/lib/i18n/index.ts'
import { cn } from '~/lib/utils'

const OPTIONS = [
  { locale: 'en', label: 'EN' },
  { locale: 'zh', label: '中文' },
] as const

/** Quiet text toggle between English and 简体中文; used on auth pages and in the sidebar footer. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale()
  const setLocale = useSetLocale()
  const t = useT()

  return (
    <div className={cn('flex items-center gap-1.5 text-xs', className)} role="group" aria-label={t.common.language}>
      {OPTIONS.map((option, index) => (
        <span key={option.locale} className="flex items-center gap-1.5">
          {index > 0 ? (
            <span aria-hidden className="text-muted-foreground/40">
              /
            </span>
          ) : null}
          <button
            type="button"
            aria-pressed={locale === option.locale}
            onClick={() => setLocale(option.locale)}
            className={
              locale === option.locale
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
