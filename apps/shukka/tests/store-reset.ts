import { store } from '~/lib/store.ts'

export async function resetApps(): Promise<void> {
  for (const app of await store.listApps('createdAt')) {
    await store.deleteApp(app.id)
  }
}

export async function resetStore(): Promise<void> {
  await resetApps()
  await store.deleteAdmin()
  await store.deleteSessions()
}
