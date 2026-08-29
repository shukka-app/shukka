import { describe, expect, it } from 'vitest'
import { semverPatchStamp } from './semver-stamp.ts'

describe('semverPatchStamp', () => {
  it('strips leading zeroes so electron-updater accepts the patch', () => {
    expect(semverPatchStamp('023294')).toBe('23294')
    expect(semverPatchStamp('078693')).toBe('78693')
  })

  it('keeps an already-valid stamp', () => {
    expect(semverPatchStamp('100000')).toBe('100000')
    expect(semverPatchStamp('42')).toBe('42')
  })

  it('defaults to a six-digit stamp without a leading zero', () => {
    const stamp = semverPatchStamp()
    expect(stamp).toMatch(/^[1-9]\d{5}$/)
  })

  it('rejects empty or non-positive values', () => {
    expect(() => semverPatchStamp('0')).toThrow(/positive integer/)
    expect(() => semverPatchStamp('abc')).toThrow(/positive integer/)
  })
})
