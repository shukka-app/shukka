import { useState } from 'react'
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { useMutation } from '@tanstack/react-query'
import { translateError, useT } from '~/lib/i18n/index.ts'
import { Field } from './field.tsx'
import { testStorageMutationOptions } from './requests/apps.ts'
import type { AppFormValues } from './requests/apps.ts'

type AppFormProps = {
  initial?: Partial<AppFormValues>
  submitLabel: string
  /** Editing keeps the stored secret when the field is left blank. */
  secretOptional?: boolean
  /** Only the named section renders; the settings page switches sections via the URL. */
  section: 'general' | 'storage'
  onSubmit: (values: AppFormValues) => Promise<unknown>
}

export function AppForm({ initial, submitLabel, secretOptional, section, onSubmit }: AppFormProps) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [tested, setTested] = useState(false)
  const testStorage = useMutation(testStorageMutationOptions())

  function readValues(form: HTMLFormElement): AppFormValues {
    const data = new FormData(form)
    // Sections render disjoint field sets; fields absent from the DOM keep their initial values.
    const text = (key: string) => (data.has(key) ? String(data.get(key) ?? '') : undefined)
    const endpoint = text('s3Endpoint')?.trim()
    const secret = text('s3SecretAccessKey')
    return {
      name: text('name') ?? initial?.name ?? '',
      slug: text('slug') ?? initial?.slug ?? '',
      s3Endpoint: endpoint !== undefined ? endpoint || null : (initial?.s3Endpoint ?? null),
      s3Region: text('s3Region') ?? initial?.s3Region ?? '',
      s3Bucket: text('s3Bucket') ?? initial?.s3Bucket ?? '',
      s3Prefix: text('s3Prefix') ?? initial?.s3Prefix ?? '',
      s3AccessKeyId: text('s3AccessKeyId') ?? initial?.s3AccessKeyId ?? '',
      s3SecretAccessKey: secret || undefined,
      s3ForcePathStyle: data.has('s3ForcePathStyle')
        ? data.get('s3ForcePathStyle') === 'on'
        : (initial?.s3ForcePathStyle ?? false),
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = readValues(event.currentTarget)

    setPending(true)
    setError(null)
    try {
      await onSubmit(values)
    } catch (cause) {
      setError(translateError(t, cause, t.common.requestFailed))
    } finally {
      setPending(false)
    }
  }

  async function handleTest(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    if (!form) return
    const values = readValues(form)
    if (!values.s3SecretAccessKey) {
      setError(t.form.secretRequiredForTest)
      return
    }

    setPending(true)
    setError(null)
    try {
      const { name: _name, slug: _slug, ...storageValues } = values
      await testStorage.mutateAsync({ ...storageValues, s3SecretAccessKey: values.s3SecretAccessKey })
      setTested(true)
    } catch (cause) {
      setTested(false)
      setError(translateError(t, cause, t.common.requestFailed))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {section === 'general' ? (
        <FormSection title={t.form.general} detail={t.form.generalDetail}>
          <Field
            name="name"
            label={t.form.appName}
            defaultValue={initial?.name}
            required
            placeholder="Acme Desktop"
            hint={t.form.appNameHint}
          />
          <Field
            name="slug"
            label={t.form.slug}
            defaultValue={initial?.slug}
            required
            placeholder="acme-desktop"
            hint={t.form.slugUsage}
          />
        </FormSection>
      ) : null}

      {section === 'storage' ? (
        <FormSection title={t.form.storage} detail={t.form.storageDetail}>
          <Field
            name="s3Bucket"
            label={t.form.bucket}
            defaultValue={initial?.s3Bucket}
            required
            placeholder="releases"
            tooltip={t.form.bucketTooltip}
          />
          <Field
            name="s3Region"
            label={t.form.region}
            defaultValue={initial?.s3Region ?? 'auto'}
            required
            placeholder="auto"
            tooltip={t.form.regionTooltip}
          />
          <Field
            name="s3Endpoint"
            label={t.form.endpoint}
            defaultValue={initial?.s3Endpoint ?? ''}
            placeholder="https://<account>.r2.cloudflarestorage.com"
            hint={t.form.endpointAwsHint}
            tooltip={t.form.endpointOtherTooltip}
            className="sm:col-span-2"
          />
          <Field
            name="s3Prefix"
            label={t.form.keyPrefix}
            defaultValue={initial?.s3Prefix ?? ''}
            placeholder="acme-desktop"
            hint={t.form.keyPrefixHint}
            tooltip={t.form.keyPrefixTooltip}
            className="sm:col-span-2"
          />
          <Field
            name="s3AccessKeyId"
            label={t.form.accessKeyId}
            defaultValue={initial?.s3AccessKeyId}
            required
            autoComplete="off"
            tooltip={t.form.accessKeyTooltip}
          />
          <Field
            name="s3SecretAccessKey"
            label={t.form.secretAccessKey}
            type="password"
            required={!secretOptional}
            autoComplete="new-password"
            hint={secretOptional ? t.form.secretKeepHint : undefined}
            tooltip={t.form.secretTooltip}
            onChange={() => setTested(false)}
          />
          <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="s3ForcePathStyle"
              defaultChecked={initial?.s3ForcePathStyle}
              className="size-4 accent-primary"
            />
            {t.form.forcePathStyle}
            <span className="text-muted-foreground">{t.form.forcePathStyleHint}</span>
          </label>
        </FormSection>
      ) : null}

      <div className="mt-5 space-y-3">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : tested ? (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-3.5" />
            {t.common.testPassed}
          </p>
        ) : secretOptional ? (
          <p className="text-sm text-muted-foreground">{t.form.secretKeepHint}</p>
        ) : null}
        <div className="flex items-center gap-3">
          {section === 'storage' ? (
            <Button type="button" variant="outline" disabled={pending} onClick={handleTest}>
              {pending ? t.common.testingConnection : t.common.testConnection}
            </Button>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? t.common.verifyingBucket : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}

/** Whitespace-separated group: quiet heading, then a two-column field grid. */
function FormSection({
  title,
  detail,
  children,
}: {
  title: string
  detail: string
  children: ReactNode
}) {
  return (
    <section>
      <h3 className="text-base">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      <div className="mt-5 grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

