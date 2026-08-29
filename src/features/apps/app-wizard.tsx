import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ChevronRight, Server } from 'lucide-react'
import { siCloudflare, siElectron, siMinio, siTauri } from 'simple-icons'
import { Button } from '~/components/ui/button'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '~/lib/api.ts'
import { translateError, useT, type Dictionary } from '~/lib/i18n/index.ts'
import { slugFromName } from '~/lib/slugify.ts'
import { updaterKindLabelKey, type UpdaterKind } from '~/lib/updater-kind.ts'
import { cn } from '~/lib/utils'
import { Field } from './field.tsx'
import { ReleaseLogConfigFields } from './release-log-fields.tsx'
import { testStorageMutationOptions } from './requests/apps.ts'
import type { AppFormValues } from './requests/apps.ts'
import { DEFAULT_NOTES_CONFIG, type NotesConfig } from '~/lib/release-log.ts'

/**
 * Three-step creation wizard for /apps/new: identity (updater kind + name +
 * slug), storage (provider selector with a tailored S3 field set), then
 * release log (off by default). Provider presets are presentation-only;
 * updaterKind is persisted. Settings keeps using AppForm and cannot change kind.
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/

function SimpleIcon({ path, hex, className }: { path: string; hex: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={`#${hex}`} aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

/** Sparkle project mark — not in simple-icons. Gold 4-point sparkle. */
function SparkleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#F5A623" aria-hidden="true">
      <path d="M12 1.6 13.9 8.6 21 10.5 13.9 12.4 12 19.4 10.1 12.4 3 10.5 10.1 8.6Z" />
    </svg>
  )
}

/** Full AWS logo (text + arrow), from the official AWS logo (Apache 2.0). Uses currentColor for text so it works on light and dark. */
function AWSIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 304 182" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M86.4,66.4c0,3.7,0.4,6.7,1.1,8.9c0.8,2.2,1.8,4.6,3.2,7.2c0.5,0.8,0.7,1.6,0.7,2.3c0,1-0.6,2-1.9,3l-6.3,4.2 c-0.9,0.6-1.8,0.9-2.6,0.9c-1,0-2-0.5-3-1.4C76.2,90,75,88.4,74,86.8c-1-1.7-2-3.6-3.1-5.9c-7.8,9.2-17.6,13.8-29.4,13.8 c-8.4,0-15.1-2.4-20-7.2c-4.9-4.8-7.4-11.2-7.4-19.2c0-8.5,3-15.4,9.1-20.6c6.1-5.2,14.2-7.8,24.5-7.8c3.4,0,6.9,0.3,10.6,0.8 c3.7,0.5,7.5,1.3,11.5,2.2v-7.3c0-7.6-1.6-12.9-4.7-16c-3.2-3.1-8.6-4.6-16.3-4.6c-3.5,0-7.1,0.4-10.8,1.3c-3.7,0.9-7.3,2-10.8,3.4 c-1.6,0.7-2.8,1.1-3.5,1.3c-0.7,0.2-1.2,0.3-1.6,0.3c-1.4,0-2.1-1-2.1-3.1v-4.9c0-1.6,0.2-2.8,0.7-3.5c0.5-0.7,1.4-1.4,2.8-2.1 c3.5-1.8,7.7-3.3,12.6-4.5c4.9-1.3,10.1-1.9,15.6-1.9c11.9,0,20.6,2.7,26.2,8.1c5.5,5.4,8.3,13.6,8.3,24.6V66.4z M45.8,81.6 c3.3,0,6.7-0.6,10.3-1.8c3.6-1.2,6.8-3.4,9.5-6.4c1.6-1.9,2.8-4,3.4-6.4c0.6-2.4,1-5.3,1-8.7v-4.2c-2.9-0.7-6-1.3-9.2-1.7 c-3.2-0.4-6.3-0.6-9.4-0.6c-6.7,0-11.6,1.3-14.9,4c-3.3,2.7-4.9,6.5-4.9,11.5c0,4.7,1.2,8.2,3.7,10.6 C37.7,80.4,41.2,81.6,45.8,81.6z M126.1,92.4c-1.8,0-3-0.3-3.8-1c-0.8-0.6-1.5-2-2.1-3.9L96.7,10.2c-0.6-2-0.9-3.3-0.9-4 c0-1.6,0.8-2.5,2.4-2.5h9.8c1.9,0,3.2,0.3,3.9,1c0.8,0.6,1.4,2,2,3.9l16.8,66.2l15.6-66.2c0.5-2,1.1-3.3,1.9-3.9c0.8-0.6,2.2-1,4-1 h8c1.9,0,3.2,0.3,4,1c0.8,0.6,1.5,2,1.9,3.9l15.8,67l17.3-67c0.6-2,1.3-3.3,2-3.9c0.8-0.6,2.1-1,3.9-1h9.3c1.6,0,2.5,0.8,2.5,2.5 c0,0.5-0.1,1-0.2,1.6c-0.1,0.6-0.3,1.4-0.7,2.5l-24.1,77.3c-0.6,2-1.3,3.3-2.1,3.9c-0.8,0.6-2.1,1-3.8,1h-8.6c-1.9,0-3.2-0.3-4-1 c-0.8-0.7-1.5-2-1.9-4L156,23l-15.4,64.4c-0.5,2-1.1,3.3-1.9,4c-0.8,0.7-2.2,1-4,1H126.1z M254.6,95.1c-5.2,0-10.4-0.6-15.4-1.8 c-5-1.2-8.9-2.5-11.5-4c-1.6-0.9-2.7-1.9-3.1-2.8c-0.4-0.9-0.6-1.9-0.6-2.8v-5.1c0-2.1,0.8-3.1,2.3-3.1c0.6,0,1.2,0.1,1.8,0.3 c0.6,0.2,1.5,0.6,2.5,1c3.4,1.5,7.1,2.7,11,3.5c4,0.8,7.9,1.2,11.9,1.2c6.3,0,11.2-1.1,14.6-3.3c3.4-2.2,5.2-5.4,5.2-9.5 c0-2.8-0.9-5.1-2.7-7c-1.8-1.9-5.2-3.6-10.1-5.2L246,52c-7.3-2.3-12.7-5.7-16-10.2c-3.3-4.4-5-9.3-5-14.5c0-4.2,0.9-7.9,2.7-11.1 c1.8-3.2,4.2-6,7.2-8.2c3-2.3,6.4-4,10.4-5.2c4-1.2,8.2-1.7,12.6-1.7c2.2,0,4.5,0.1,6.7,0.4c2.3,0.3,4.4,0.7,6.5,1.1 c2,0.5,3.9,1,5.7,1.6c1.8,0.6,3.2,1.2,4.2,1.8c1.4,0.8,2.4,1.6,3,2.5c0.6,0.8,0.9,1.9,0.9,3.3v4.7c0,2.1-0.8,3.2-2.3,3.2 c-0.8,0-2.1-0.4-3.8-1.2c-5.7-2.6-12.1-3.9-19.2-3.9c-5.7,0-10.2,0.9-13.3,2.8c-3.1,1.9-4.7,4.8-4.7,8.9c0,2.8,1,5.2,3,7.1 c2,1.9,5.7,3.8,11,5.5l14.2,4.5c7.2,2.3,12.4,5.5,15.5,9.6c3.1,4.1,4.6,8.8,4.6,14c0,4.3-0.9,8.2-2.6,11.6 c-1.8,3.4-4.2,6.4-7.3,8.8c-3.1,2.5-6.8,4.3-11.1,5.6C264.4,94.4,259.7,95.1,254.6,95.1z"
      />
      <path
        fill="#FF9900"
        d="M273.5,143.7c-32.9,24.3-80.7,37.2-121.8,37.2c-57.6,0-109.5-21.3-148.7-56.7c-3.1-2.8-0.3-6.6,3.4-4.4 c42.4,24.6,94.7,39.5,148.8,39.5c36.5,0,76.6-7.6,113.5-23.2C274.2,133.6,278.9,139.7,273.5,143.7z"
      />
      <path
        fill="#FF9900"
        d="M287.2,128.1c-4.2-5.4-27.8-2.6-38.5-1.3c-3.2,0.4-3.7-2.4-0.8-4.5c18.8-13.2,49.7-9.4,53.3-5 c3.6,4.5-1,35.4-18.6,50.2c-2.7,2.3-5.3,1.1-4.1-1.9C282.5,155.7,291.4,133.4,287.2,128.1z"
      />
    </svg>
  )
}

/**
 * Official JuiceFS mark (interlocking links) from juicedata/juicefs
 * docs/en/images/juicefs-logo-new.svg (Apache-2.0); wordmark dropped for icon
 * use. Not in simple-icons, so the two brand paths are inlined with their
 * official fills. viewBox tightly frames the mark's own coordinate space.
 */
function JuiceFSIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="148 188 132 65" className={className} aria-hidden="true">
      <path
        fill="#A5D9AB"
        fillRule="evenodd"
        d="m 223.1,240.03 c 12.28,12.46 32.26,12.46 44.55,0 12.28,-12.46 12.28,-32.74 0,-45.2 l -0.44,-0.44 c -2.41,-2.45 -5.57,-3.67 -8.73,-3.67 -3.16,0 -6.32,1.22 -8.74,3.67 l -4.41,4.47 c 0.23,0.23 1.82,1.77 3.6,3.57 l 5.61,5.7 c 5.06,5.13 5.06,13.48 0,18.61 -5.06,5.13 -13.28,5.13 -18.34,0 l -31.88,-32.35 c -2.41,-2.45 -5.57,-3.67 -8.73,-3.67 -3.16,0 -6.32,1.22 -8.74,3.67 l -4.41,4.47 c 0.24,0.23 40.66,41.17 40.66,41.17 z"
      />
      <path
        fill="#0ABD59"
        fillRule="evenodd"
        d="m 249.85,194.3 c 2.21,-2.21 5.27,-3.58 8.64,-3.58 h -26.75 c -3.55,0 -5.75,1.46 -6.73,2.29 -0.67,0.57 -1.32,1.18 -1.95,1.82 l -31.44,31.91 c -5.06,5.13 -13.29,5.13 -18.34,0 -5.06,-5.13 -5.06,-13.48 0,-18.61 l 13.69,-13.83 c 2.21,-2.21 5.27,-3.58 8.64,-3.58 h -24.43 c -3.37,0 -7.41,0.75 -11,4.11 -12.28,12.46 -12.28,32.74 0,45.2 12.28,12.46 32.26,12.46 44.55,0 l 31.44,-31.91 z"
      />
    </svg>
  )
}

const PROVIDERS = [
  {
    id: 'aws',
    label: 'AWS S3',
    icon: <AWSIcon className="h-4 w-auto" />,
    showRegion: true,
    showEndpoint: false,
    showPathStyle: false,
    endpointRequired: false,
  },
  {
    id: 'r2',
    label: 'Cloudflare R2',
    icon: <SimpleIcon path={siCloudflare.path} hex={siCloudflare.hex} className="size-5" />,
    showRegion: false,
    showEndpoint: true,
    showPathStyle: false,
    endpointRequired: true,
  },
  {
    id: 'minio',
    label: 'MinIO',
    icon: <SimpleIcon path={siMinio.path} hex={siMinio.hex} className="size-5" />,
    showRegion: false,
    showEndpoint: true,
    showPathStyle: false,
    endpointRequired: true,
  },
  {
    id: 'other',
    label: 'S3-compatible',
    icon: <Server className="size-4" />,
    showRegion: true,
    showEndpoint: true,
    showPathStyle: true,
    endpointRequired: false,
  },
  {
    id: 'juicefs',
    label: 'JuiceFS',
    icon: <JuiceFSIcon className="size-5" />,
    showRegion: false,
    showEndpoint: true,
    showPathStyle: false,
    endpointRequired: true,
  },
] as const

type ProviderId = (typeof PROVIDERS)[number]['id']

type StorageFields = {
  bucket: string
  region: string
  endpoint: string
  prefix: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

const EMPTY_STORAGE: StorageFields = {
  bucket: '',
  region: '',
  endpoint: '',
  prefix: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: false,
}

type IdentityErrors = { name?: string; slug?: string; updaterKind?: string }

const UPDATER_KINDS: { id: UpdaterKind; icon: 'electron' | 'tauri' | 'sparkle' }[] = [
  { id: 'electron', icon: 'electron' },
  { id: 'tauri', icon: 'tauri' },
  { id: 'sparkle', icon: 'sparkle' },
]
type StorageErrors = Partial<Record<keyof StorageFields, string>>

const ENDPOINT_PLACEHOLDER: Record<ProviderId, string> = {
  aws: '',
  r2: 'https://<account>.r2.cloudflarestorage.com',
  minio: 'https://minio.example.com:9000',
  other: 'https://s3.example.com',
  juicefs: 'http://localhost:9000',
}

function endpointTooltip(t: Dictionary, provider: ProviderId): string {
  switch (provider) {
    case 'r2':
      return t.form.endpointR2Tooltip
    case 'minio':
      return t.form.endpointMinioTooltip
    case 'juicefs':
      return t.form.endpointJuicefsTooltip
    default:
      return t.form.endpointOtherTooltip
  }
}

export function AppWizard({
  step,
  onStepChange,
  onSubmit,
}: {
  step: 1 | 2 | 3
  onStepChange: (step: 1 | 2 | 3) => void
  onSubmit: (values: AppFormValues, releaseLog: NotesConfig) => Promise<unknown>
}) {
  const t = useT()

  const [updaterKind, setUpdaterKind] = useState<UpdaterKind | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugDirty, setSlugDirty] = useState(false)
  const [identityErrors, setIdentityErrors] = useState<IdentityErrors>({})

  const [provider, setProvider] = useState<ProviderId | null>(null)
  const [storage, setStorage] = useState<StorageFields>(EMPTY_STORAGE)
  const [storageErrors, setStorageErrors] = useState<StorageErrors>({})

  const [releaseLog, setReleaseLog] = useState<NotesConfig>(DEFAULT_NOTES_CONFIG)

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [tested, setTested] = useState(false)
  const testStorage = useMutation(testStorageMutationOptions())

  const preset = provider ? PROVIDERS.find((entry) => entry.id === provider) : null

  // URL can restore step 2/3; identity state is always empty on a fresh mount.
  useEffect(() => {
    if (step > 1 && updaterKind === null) onStepChange(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clamp once on mount
  }, [])

  function updateStorage(key: keyof StorageFields, value: string | boolean) {
    setStorage((prev) => ({ ...prev, [key]: value }))
    setStorageErrors((prev) => ({ ...prev, [key]: undefined }))
    setSubmitError(null)
    setTested(false)
  }

  function validateIdentity(): IdentityErrors {
    const errors: IdentityErrors = {}
    if (!updaterKind) errors.updaterKind = t.wizard.updaterKindRequired
    if (!name.trim()) errors.name = t.wizard.nameRequired
    if (!SLUG_PATTERN.test(slug.trim())) errors.slug = t.wizard.slugHint
    return errors
  }

  function continueToStorage() {
    const errors = validateIdentity()
    setIdentityErrors(errors)
    if (Object.keys(errors).length > 0) return
    // Suggest the slug as the key prefix; an explicit prefix edit survives
    // going back and forth between the steps.
    if (!storage.prefix) setStorage((prev) => ({ ...prev, prefix: slug.trim() }))
    onStepChange(2)
  }

  function validateStorage(): StorageErrors {
    const errors: StorageErrors = {}
    if (!preset) return errors
    if (!storage.bucket.trim()) errors.bucket = t.wizard.bucketRequired
    if (preset.showRegion && !storage.region.trim()) errors.region = t.wizard.regionRequired
    if (preset.endpointRequired && !storage.endpoint.trim()) errors.endpoint = t.wizard.endpointRequired
    if (!storage.accessKeyId.trim()) errors.accessKeyId = t.wizard.accessKeyRequired
    if (!storage.secretAccessKey) errors.secretAccessKey = t.wizard.secretRequired
    return errors
  }

  function buildValues(): AppFormValues {
    const base = {
      name: name.trim(),
      slug: slug.trim(),
      updaterKind: updaterKind ?? 'electron',
      s3Bucket: storage.bucket.trim(),
      s3Prefix: storage.prefix.trim(),
      s3AccessKeyId: storage.accessKeyId.trim(),
      s3SecretAccessKey: storage.secretAccessKey,
    }
    switch (provider) {
      case 'aws':
        return { ...base, s3Endpoint: null, s3Region: storage.region.trim(), s3ForcePathStyle: false }
      case 'r2':
        return { ...base, s3Endpoint: storage.endpoint.trim(), s3Region: 'auto', s3ForcePathStyle: false }
      case 'minio':
        return { ...base, s3Endpoint: storage.endpoint.trim(), s3Region: 'us-east-1', s3ForcePathStyle: true }
      case 'juicefs':
        // The JuiceFS S3 gateway ignores region; the SDK requires some value. Path style is implied.
        return { ...base, s3Endpoint: storage.endpoint.trim(), s3Region: 'us-east-1', s3ForcePathStyle: true }
      default:
        return {
          ...base,
          s3Endpoint: storage.endpoint.trim() || null,
          s3Region: storage.region.trim(),
          s3ForcePathStyle: storage.forcePathStyle,
        }
    }
  }

  /** Server failures route back to the step that owns the field. */
  function mapSubmitError(cause: unknown) {
    if (cause instanceof ApiError) {
      if (cause.code === 'conflict' || (cause.code === 'invalid_request' && /slug/i.test(cause.message))) {
        setIdentityErrors((prev) => ({ ...prev, slug: translateError(t, cause, t.common.requestFailed) }))
        onStepChange(1)
        return
      }
      if (cause.code === 'invalid_request' && /name/i.test(cause.message)) {
        setIdentityErrors((prev) => ({ ...prev, name: translateError(t, cause, t.common.requestFailed) }))
        onStepChange(1)
        return
      }
      setSubmitError(translateError(t, cause, t.common.requestFailed))
      return
    }
    setSubmitError(t.common.requestFailed)
  }

  async function testConnection(): Promise<boolean> {
    const { name: _name, slug: _slug, updaterKind: _kind, ...storageValues } = buildValues()
    try {
      await testStorage.mutateAsync(storageValues)
      setTested(true)
      return true
    } catch (cause) {
      setTested(false)
      setSubmitError(translateError(t, cause, t.common.requestFailed))
      return false
    }
  }

  /** Step 2 → 3 gates on a working bucket so step 3 can't dead-end at create. */
  async function continueToReleaseLog() {
    if (!preset) return
    const errors = validateStorage()
    setStorageErrors(errors)
    if (Object.keys(errors).length > 0) return

    setPending(true)
    setSubmitError(null)
    try {
      // A manual test is only a convenience — this gate and the server both re-verify.
      if (!tested && !(await testConnection())) return
      onStepChange(3)
    } finally {
      setPending(false)
    }
  }

  async function submit() {
    const identity = validateIdentity()
    if (Object.keys(identity).length > 0) {
      setIdentityErrors(identity)
      onStepChange(1)
      return
    }
    const storageErrs = validateStorage()
    if (!preset || Object.keys(storageErrs).length > 0) {
      setStorageErrors(storageErrs)
      onStepChange(2)
      return
    }

    setPending(true)
    setSubmitError(null)
    try {
      await onSubmit(buildValues(), releaseLog)
    } catch (cause) {
      mapSubmitError(cause)
    } finally {
      setPending(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step === 1) continueToStorage()
    else if (step === 2) void continueToReleaseLog()
    else void submit()
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <StepIndicator step={step} />

      {step === 1 ? (
        <section className="mt-8">
          <div className="flex gap-3" role="radiogroup" aria-label={t.wizard.updaterKindLabel}>
            {UPDATER_KINDS.map((entry) => {
              const selected = updaterKind === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setUpdaterKind(entry.id)
                    setIdentityErrors((prev) => ({ ...prev, updaterKind: undefined }))
                  }}
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-background px-4 py-3 text-sm outline outline-1 -outline-offset-1 outline-input transition-colors',
                    selected ? '-outline-offset-2 outline-2 outline-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  {entry.icon === 'electron' ? (
                    <SimpleIcon path={siElectron.path} hex={siElectron.hex} className="size-5" />
                  ) : entry.icon === 'tauri' ? (
                    <SimpleIcon path={siTauri.path} hex={siTauri.hex} className="size-5" />
                  ) : (
                    <SparkleMark className="size-5" />
                  )}
                  {t.apps[updaterKindLabelKey(entry.id)]}
                </button>
              )
            })}
          </div>
          {identityErrors.updaterKind ? (
            <p className="mt-2 text-sm text-destructive">{identityErrors.updaterKind}</p>
          ) : null}

          <div className="mt-6 grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field
              name="name"
              label={t.form.appName}
              required
              placeholder="Acme Desktop"
              hint={t.form.appNameHint}
              value={name}
              error={identityErrors.name}
              onChange={(event) => {
                const next = event.target.value
                setName(next)
                if (!slugDirty) setSlug(slugFromName(next))
                setIdentityErrors((prev) => ({ ...prev, name: undefined }))
              }}
            />
            <Field
              name="slug"
              label={t.form.slug}
              required
              placeholder="acme-desktop"
              hint={t.form.slugUsage}
              value={slug}
              error={identityErrors.slug}
              onChange={(event) => {
                setSlugDirty(true)
                setSlug(event.target.value)
                setIdentityErrors((prev) => ({ ...prev, slug: undefined }))
              }}
            />
          </div>
        </section>
      ) : step === 2 ? (
        <section className="mt-8">
          <div className="flex gap-3" role="radiogroup" aria-label={t.wizard.providerLabel}>
            {PROVIDERS.map((entry) => {
              const selected = provider === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setProvider(entry.id)
                    setStorageErrors({})
                    setSubmitError(null)
                    setTested(false)
                  }}
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-background px-4 py-3 text-sm outline outline-1 -outline-offset-1 outline-input transition-colors',
                    selected ? '-outline-offset-2 outline-2 outline-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  {entry.icon}
                  {entry.label}
                </button>
              )
            })}
          </div>

          {preset ? (
            <div className="mt-6 grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                name="s3Bucket"
                label={t.form.bucket}
                required
                placeholder="releases"
                tooltip={t.form.bucketTooltip}
                value={storage.bucket}
                error={storageErrors.bucket}
                onChange={(event) => updateStorage('bucket', event.target.value)}
              />
              {preset.showRegion ? (
                <Field
                  name="s3Region"
                  label={t.form.region}
                  required
                  placeholder="us-east-1"
                  tooltip={t.form.regionTooltip}
                  value={storage.region}
                  error={storageErrors.region}
                  onChange={(event) => updateStorage('region', event.target.value)}
                />
              ) : null}
              {preset.showEndpoint ? (
                <Field
                  name="s3Endpoint"
                  label={t.form.endpoint}
                  required={preset.endpointRequired}
                  placeholder={ENDPOINT_PLACEHOLDER[preset.id]}
                  hint={preset.id === 'other' ? t.form.endpointAwsHint : undefined}
                  tooltip={endpointTooltip(t, preset.id)}
                  className="sm:col-span-2"
                  value={storage.endpoint}
                  error={storageErrors.endpoint}
                  onChange={(event) => updateStorage('endpoint', event.target.value)}
                />
              ) : null}
              <Field
                name="s3Prefix"
                label={t.form.keyPrefix}
                placeholder={slug.trim() || 'acme-desktop'}
                hint={t.form.keyPrefixHint}
                tooltip={t.form.keyPrefixTooltip}
                className="sm:col-span-2"
                value={storage.prefix}
                onChange={(event) => updateStorage('prefix', event.target.value)}
              />
              <Field
                name="s3AccessKeyId"
                label={t.form.accessKeyId}
                required
                autoComplete="off"
                tooltip={t.form.accessKeyTooltip}
                value={storage.accessKeyId}
                error={storageErrors.accessKeyId}
                onChange={(event) => updateStorage('accessKeyId', event.target.value)}
              />
              <Field
                name="s3SecretAccessKey"
                label={t.form.secretAccessKey}
                type="password"
                required
                autoComplete="new-password"
                tooltip={t.form.secretTooltip}
                value={storage.secretAccessKey}
                error={storageErrors.secretAccessKey}
                onChange={(event) => updateStorage('secretAccessKey', event.target.value)}
              />
              {preset.showPathStyle ? (
                <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="s3ForcePathStyle"
                    checked={storage.forcePathStyle}
                    onChange={(event) => updateStorage('forcePathStyle', event.target.checked)}
                    className="size-4 accent-primary"
                  />
                  {t.form.forcePathStyle}
                  <span className="text-muted-foreground">{t.form.forcePathStyleHint}</span>
                </label>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="mt-8 max-w-md">
          <ReleaseLogConfigFields value={releaseLog} onChange={setReleaseLog} />
        </section>
      )}

      <div className="mt-8 flex items-center gap-4">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              onStepChange(step === 3 ? 2 : 1)
              setSubmitError(null)
            }}
          >
            {t.wizard.back}
          </Button>
        ) : null}
        {step === 2 && provider ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              const errors = validateStorage()
              setStorageErrors(errors)
              if (Object.keys(errors).length > 0) return
              setPending(true)
              setSubmitError(null)
              void testConnection().finally(() => setPending(false))
            }}
          >
            {pending ? t.common.testingConnection : t.common.testConnection}
          </Button>
        ) : null}
        <Button type="submit" disabled={pending || (step === 2 && !provider)}>
          {pending
            ? step === 3
              ? t.common.verifyingBucket
              : t.common.testingConnection
            : step === 3
              ? t.wizard.createApp
              : t.wizard.continue}
        </Button>
        {step === 3 && submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
        {step === 2 && (submitError ?? (tested ? t.common.testPassed : null)) ? (
          <p
            className={
              submitError ? 'text-sm text-destructive' : 'flex items-center gap-1 text-xs text-muted-foreground'
            }
          >
            {submitError ?? (
              <>
                <Check className="size-3.5 text-green-600 dark:text-green-500" aria-hidden />
                {t.common.testPassed}
              </>
            )}
          </p>
        ) : null}
      </div>
    </form>
  )
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const t = useT()
  const steps = [t.wizard.stepIdentity, t.wizard.stepStorage, t.wizard.stepReleaseLog]
  return (
    <ol className="flex items-center gap-2.5 text-sm">
      {steps.map((label, index) => (
        <li key={label} className="flex items-center gap-2.5">
          {index > 0 ? <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden /> : null}
          <span className={index + 1 === step ? 'text-foreground' : 'text-muted-foreground'}>
            <span className="mr-2 font-mono text-xs">{index + 1}</span>
            {label}
          </span>
        </li>
      ))}
    </ol>
  )
}
