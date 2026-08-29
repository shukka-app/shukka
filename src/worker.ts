import { applyWorkerEnv } from '~/lib/worker-env.ts'

type WorkerEnv = Record<string, unknown>

type StartHandler = {
  fetch: (request: Request, env: WorkerEnv, ctx: unknown) => Response | Promise<Response>
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: unknown): Promise<Response> {
    applyWorkerEnv(env)
    const { default: handler } = (await import('@tanstack/react-start/server-entry')) as {
      default: StartHandler
    }
    return handler.fetch(request, env, ctx)
  },
}
