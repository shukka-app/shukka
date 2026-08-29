/**
 * electron-updater rejects versions whose numeric identifiers have leading
 * zeroes (`2.0.023294`). Use this for generated e2e version patches.
 */
export function semverPatchStamp(raw = String((Date.now() % 900_000) + 100_000)) {
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`E2E_VERSION_STAMP must be a positive integer, got ${JSON.stringify(raw)}`)
  }
  return String(n)
}
