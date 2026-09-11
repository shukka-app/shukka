import { describe, expect, it } from 'vitest'
import { slugFromName } from '~/lib/slugify.ts'

describe('slugFromName', () => {
  it('kebab-cases a Latin display name', () => {
    expect(slugFromName('Acme Desktop')).toBe('acme-desktop')
  })

  it('romanizes Chinese through pinyin before slugifying', () => {
    expect(slugFromName('你好世界')).toBe('ni-hao-shi-jie')
  })

  it('keeps mixed Chinese and Latin as one slug', () => {
    expect(slugFromName('我的 App')).toBe('wo-de-app')
  })

  it('returns empty for blank input', () => {
    expect(slugFromName('   ')).toBe('')
  })
})
