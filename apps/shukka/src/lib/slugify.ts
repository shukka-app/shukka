import { slug } from 'github-slugger'
import { pinyin } from 'pinyin-pro'

const SLUG_MAX = 63

/** Turn a display name into a URL slug. Chinese goes through pinyin first. */
export function slugFromName(name: string): string {
  const latin = pinyin(name.trim(), { toneType: 'none', type: 'array', nonZh: 'consecutive' })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!latin) return ''
  return slug(latin).slice(0, SLUG_MAX)
}
