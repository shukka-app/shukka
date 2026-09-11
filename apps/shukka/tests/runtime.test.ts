import { runtime } from 'std-env'
import { describe, expect, it } from 'vitest'
import { isCloudFunction, isNodeRuntime, libsqlClientEntry } from '~/lib/runtime.ts'

describe('runtime detection', () => {
  it('treats vitest Node as not a cloud function', () => {
    expect(runtime).toBe('node')
    expect(isCloudFunction()).toBe(false)
    expect(isNodeRuntime()).toBe(true)
    expect(libsqlClientEntry()).toBe('@libsql/client')
  })
})
