/** "2.1 MB" style sizes for artifact listings. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let unit = 'B'
  for (const next of units) {
    if (value < 1024) break
    value /= 1024
    unit = next
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`
}

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>()

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
  let formatter = relativeFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    relativeFormatters.set(locale, formatter)
  }
  return formatter
}

/** Relative within a week ("3 hours ago"), plain date beyond that. `justNow` comes from the dictionary. */
export function formatWhen(unixSeconds: number, { locale, justNow }: { locale: string; justNow: string }): string {
  const deltaSeconds = unixSeconds - Math.floor(Date.now() / 1000)
  const absolute = Math.abs(deltaSeconds)
  if (absolute < 60) return justNow
  const relative = relativeFormatter(locale)
  if (absolute < 3600) return relative.format(Math.trunc(deltaSeconds / 60), 'minute')
  if (absolute < 86400) return relative.format(Math.trunc(deltaSeconds / 3600), 'hour')
  if (absolute < 7 * 86400) return relative.format(Math.trunc(deltaSeconds / 86400), 'day')
  return formatDate(unixSeconds, locale)
}

export function formatDate(unixSeconds: number, locale: string): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(unixSeconds: number, locale: string): string {
  return new Date(unixSeconds * 1000).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const numberFormatters = new Map<string, Intl.NumberFormat>()

function numberFormatter(locale: string): Intl.NumberFormat {
  let formatter = numberFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale)
    numberFormatters.set(locale, formatter)
  }
  return formatter
}

/** Grouped counts ("12,345") for chart ticks and tooltips. */
export function formatNumber(value: number, locale: string): string {
  return numberFormatter(locale).format(value)
}

/** UTC-pinned day label ("Aug 3") so axis labels match the UTC day bucketing of hit trends. */
export function formatChartDay(unixSeconds: number, locale: string): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** UTC-pinned hour label ("14:00") so axis labels match the UTC hour bucketing of hit trends. */
export function formatChartHour(unixSeconds: number, locale: string): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  })
}
