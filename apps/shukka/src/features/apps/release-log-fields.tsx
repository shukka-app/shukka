import { X } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { useFormatters, useT } from '~/lib/i18n/index.ts'
import { DEFAULT_FALLBACK_LOCALE, type NotesConfig } from '~/lib/release-log.ts'
import { LocaleCombobox } from './locale-combobox.tsx'

/**
 * The release-log controls shared by the creation wizard's step 3 and the app
 * settings section: enable toggle, locale list editor, fallback picker.
 * Picking a locale from the combobox stages it immediately — nothing persists
 * until the surrounding form submits. Enabling with an empty list seeds it
 * with the fallback locale so the form starts valid; removing the fallback
 * moves it to the first remaining locale.
 */
export function ReleaseLogConfigFields({
  value,
  onChange,
}: {
  value: NotesConfig
  onChange: (value: NotesConfig) => void
}) {
  const t = useT()
  const format = useFormatters()

  function setEnabled(enabled: boolean) {
    if (enabled && value.locales.length === 0) {
      onChange({ enabled, locales: [value.fallbackLocale], fallbackLocale: value.fallbackLocale })
    } else {
      onChange({ ...value, enabled })
    }
  }

  function addLocale(locale: string) {
    if (!locale || value.locales.includes(locale)) return
    onChange({ ...value, locales: [...value.locales, locale] })
  }

  function removeLocale(locale: string) {
    const locales = value.locales.filter((entry) => entry !== locale)
    const fallbackLocale = locale === value.fallbackLocale ? (locales[0] ?? DEFAULT_FALLBACK_LOCALE) : value.fallbackLocale
    onChange({ ...value, locales, fallbackLocale })
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2.5">
        <Switch id="release-log-enabled" checked={value.enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="release-log-enabled">
          {t.releaseLog.enable}
          <span className="text-muted-foreground">{t.releaseLog.enableHint}</span>
        </Label>
      </div>

      {value.enabled ? (
        <>
          <div className="grid content-start gap-2">
            <Label>{t.releaseLog.locales}</Label>
            {value.locales.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {value.locales.map((locale) => (
                  <Badge key={locale} variant="outline" className="gap-1 pr-1" title={locale}>
                    {format.localeName(locale)}
                    <button
                      type="button"
                      aria-label={t.releaseLog.removeLocale(locale)}
                      onClick={() => removeLocale(locale)}
                      className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
            <LocaleCombobox
              value=""
              onChange={addLocale}
              suggestions={value.locales}
              placeholder={t.releaseLog.localePlaceholder}
              ariaLabel={t.releaseLog.localeComboboxLabel}
            />
            <p className="text-xs text-muted-foreground">{t.releaseLog.localesHint}</p>
          </div>

          {value.locales.length > 0 ? (
            <div className="grid content-start gap-2">
              <Label>{t.releaseLog.fallback}</Label>
              <Select value={value.fallbackLocale} onValueChange={(fallbackLocale) => onChange({ ...value, fallbackLocale })}>
                <SelectTrigger className="w-full shadow-none" aria-label={t.releaseLog.fallback}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="shadow-none">
                  {value.locales.map((locale) => (
                    <SelectItem key={locale} value={locale}>
                      {format.localeName(locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t.releaseLog.fallbackHint}</p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
