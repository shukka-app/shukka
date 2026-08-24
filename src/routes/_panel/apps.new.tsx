import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { parseAsInteger, useQueryState } from 'nuqs'
import { PageHeader } from '~/components/page-header.tsx'
import { AppWizard } from '~/features/apps/app-wizard.tsx'
import { createAppMutationOptions } from '~/features/apps/requests/apps.ts'
import { updateNotesConfigMutationOptions } from '~/features/apps/requests/notes.ts'
import { useT } from '~/lib/i18n/index.ts'

export const Route = createFileRoute('/_panel/apps/new')({ component: NewAppPage })

function NewAppPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const createApp = useMutation(createAppMutationOptions({ queryClient }))
  const updateNotesConfig = useMutation(updateNotesConfigMutationOptions({ queryClient }))
  const t = useT()
  const [step, setStep] = useQueryState('step', parseAsInteger.withDefault(1))

  return (
    <>
      <PageHeader title={t.apps.newTitle} />
      <AppWizard
        step={step === 3 ? 3 : step === 2 ? 2 : 1}
        onStepChange={(next) => void setStep(next)}
        onSubmit={async (values, releaseLog) => {
          const { app } = await createApp.mutateAsync(values)
          // Disabled is the DB default — only an enabled step 3 needs the config write.
          if (releaseLog.enabled) {
            await updateNotesConfig.mutateAsync({ slug: app.slug, ...releaseLog })
          }
          await router.navigate({ to: '/apps/$appSlug', params: { appSlug: app.slug } })
        }}
      />
    </>
  )
}
