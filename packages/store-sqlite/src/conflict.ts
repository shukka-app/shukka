export function isUniqueConstraint(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (uniqueConstraintCode(current)) return true
    current =
      typeof current === 'object' && current !== null && 'cause' in current
        ? (current as { cause: unknown }).cause
        : undefined
  }
  return false
}

function uniqueConstraintCode(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const record = error as { code?: unknown; extendedCode?: unknown; message?: unknown }
  const tokens = [record.code, record.extendedCode, record.message].map((value) => String(value ?? ''))
  return tokens.some((token) => token.includes('SQLITE_CONSTRAINT_UNIQUE') || token.includes('UNIQUE constraint'))
}
