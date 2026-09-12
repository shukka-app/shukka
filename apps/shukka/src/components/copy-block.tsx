import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { copyText } from '~/lib/clipboard.ts'
import { useT } from '~/lib/i18n/index.ts'
import { cn } from '~/lib/utils'

export function CopyBlock({
  value,
  className,
  label,
  html,
}: {
  value: string
  className?: string
  label?: string
  /** Server-rendered Shiki HTML; omit for plain text. */
  html?: string
}) {
  const [copied, setCopied] = useState(false)
  const t = useT()

  async function copy() {
    const ok = await copyText(value)
    if (!ok) {
      toast.error(t.common.copyFailed)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? <p className="text-xs font-medium text-muted-foreground">{label}</p> : null}
      <div className="relative">
        {html ? (
          <div
            // Shiki emits the full pre element with both theme colors as CSS vars.
            dangerouslySetInnerHTML={{ __html: html }}
            className="shiki-block overflow-x-auto rounded-2xl bg-card text-xs leading-relaxed [&_pre]:p-4 [&_pre]:pr-12"
          />
        ) : (
          <pre className="overflow-x-auto rounded-2xl bg-card p-4 pr-12 text-xs leading-relaxed">
            <code>{value}</code>
          </pre>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute top-1.5 right-1.5 size-7"
          onClick={copy}
          aria-label={t.common.copyToClipboard}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
    </div>
  )
}
