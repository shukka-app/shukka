import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

/** Matches `SIDEBAR_COOKIE_NAME` in `src/components/ui/sidebar.tsx`. */
const SIDEBAR_COOKIE_NAME = 'sidebar_state'

/** SSR read of the collapsed/expanded cookie so the first paint matches last toggle. */
export const getSidebarState = createServerFn({ method: 'GET' }).handler(
  async (): Promise<'true' | 'false' | null> => {
    const header = getRequest().headers.get('cookie')
    if (!header) return null
    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=')
      if (name === SIDEBAR_COOKIE_NAME) {
        const value = decodeURIComponent(rest.join('='))
        return value === 'true' || value === 'false' ? value : null
      }
    }
    return null
  },
)
