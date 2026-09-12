import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { useMemo, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { localeTags, useLocale, useT } from '~/lib/i18n/index.ts'
import { isValidLocale } from '~/lib/release-log.ts'
import { cn } from '~/lib/utils.ts'

/** Common BCP-47 suggestions; any valid tag may be typed in addition. */
const COMMON_LOCALES = [
  'en-US',
  'en-GB',
  'zh-CN',
  'zh-TW',
  'zh-HK',
  'ja-JP',
  'ko-KR',
  'de-DE',
  'de-AT',
  'de-CH',
  'fr-FR',
  'fr-CA',
  'fr-BE',
  'fr-CH',
  'es-ES',
  'es-MX',
  'es-AR',
  'pt-BR',
  'pt-PT',
  'it-IT',
  'nl-NL',
  'ru-RU',
  'uk-UA',
  'pl-PL',
  'cs-CZ',
  'tr-TR',
  'ar-SA',
  'he-IL',
  'hi-IN',
  'id-ID',
  'th-TH',
  'vi-VN',
  'sv-SE',
  'nb-NO',
  'da-DK',
  'fi-FI',
  'el-GR',
  'hu-HU',
] as const

/** Canonical form of a typed tag (en-us → en-US), or null when malformed. */
function canonicalize(tag: string): string | null {
  if (!isValidLocale(tag)) return null
  return Intl.getCanonicalLocales(tag)[0] ?? null
}

/**
 * BCP-47 locale picker (ADR: release-log): a Popover combobox with
 * autocomplete over the configured locales plus common tags, displaying
 * localized language names via Intl.DisplayNames. Typing any valid tag offers
 * it as a free-form choice.
 */
export function LocaleCombobox({
  value,
  onChange,
  suggestions = [],
  placeholder,
  ariaLabel,
}: {
  value: string
  onChange: (locale: string) => void
  suggestions?: string[]
  placeholder?: string
  ariaLabel?: string
}) {
  const t = useT()
  const uiLocale = useLocale()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const displayNames = useMemo(() => new Intl.DisplayNames([localeTags[uiLocale]], { type: 'language' }), [uiLocale])

  const label = (tag: string): string => {
    const name = displayNames.of(tag)
    return name && name !== tag ? `${name} — ${tag}` : tag
  }

  const candidates = useMemo(() => {
    const all = [...new Set([...suggestions, ...COMMON_LOCALES])]
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((tag) => {
      if (tag.toLowerCase().includes(q)) return true
      return displayNames.of(tag)?.toLowerCase().includes(q) ?? false
    })
  }, [suggestions, query, displayNames])

  const canonical = canonicalize(query.trim())
  const showFreeform = canonical !== null && !candidates.includes(canonical)

  function pick(tag: string) {
    onChange(tag)
    setOpen(false)
    setQuery('')
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setQuery('')
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="w-full justify-between font-normal shadow-none"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{value ? label(value) : placeholder}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 max-h-72 w-64 overflow-hidden rounded-md border bg-popover p-1.5 text-popover-foreground shadow-md"
        >
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            className="mb-1 h-8"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (canonical) pick(canonical)
                else if (candidates[0]) pick(candidates[0])
              }
            }}
          />
          <ul className="max-h-52 overflow-y-auto">
            {showFreeform ? (
              <li>
                <button
                  type="button"
                  onClick={() => pick(canonical)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                >
                  <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{label(canonical)}</span>
                </button>
              </li>
            ) : null}
            {candidates.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => pick(tag)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                >
                  <Check className={cn('size-3.5 shrink-0', tag === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{label(tag)}</span>
                </button>
              </li>
            ))}
            {candidates.length === 0 && !showFreeform ? (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">{t.releaseLog.invalidLocale}</li>
            ) : null}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
