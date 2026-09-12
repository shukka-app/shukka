import { ApiError } from '~/lib/api.ts'
import type { Dictionary } from './en.ts'

/**
 * Server errors stay English + a fixed code; the panel translates by code and
 * falls back to the server's English message for codes outside the fixed set.
 */
export function translateError(t: Dictionary, cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) {
    return (t.errors as Record<string, string>)[cause.code] ?? cause.message
  }
  return fallback
}
