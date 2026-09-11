import { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appScopedMutationOptions } from '~/features/apps/requests/apps.ts'
import { ApiError } from '~/lib/api.ts'
import { en } from '~/lib/i18n/en.ts'

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

describe('appScopedMutationOptions onError', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
  })

  it('toasts the translated message for a known ApiError code', () => {
    const queryClient = new QueryClient()
    const options = appScopedMutationOptions({
      slug: 'demo',
      queryClient,
      t: en,
      mutationFn: async () => undefined,
    })

    options.onError?.(new ApiError(404, 'not_found', 'gone'), undefined, undefined, {
      client: queryClient,
      meta: undefined,
    })

    expect(toast.error).toHaveBeenCalledWith(en.errors.not_found)
  })
})
