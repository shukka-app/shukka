import { describe, expect, it } from 'vitest'
import { ShukkaError } from '~/lib/errors.ts'
import { urlBasename } from '~/lib/url-basename.ts'

describe('urlBasename', () => {
  it('decodes absolute URL artifact names', () => {
    expect(urlBasename('https://x/y/App%20Setup.exe')).toBe('App Setup.exe')
  })

  it('keeps bare filenames', () => {
    expect(urlBasename('App.exe')).toBe('App.exe')
  })

  it('rejects malformed percent encoding as metadata_error', () => {
    try {
      urlBasename('App%E0.exe')
      throw new Error('expected urlBasename to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ShukkaError)
      expect((error as ShukkaError).code).toBe('metadata_error')
    }
  })
})
