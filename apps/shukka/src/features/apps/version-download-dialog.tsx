import { Download } from 'lucide-react'
import { siApple, siLinux } from 'simple-icons'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { useT } from '~/lib/i18n/index.ts'
import { installersOf, type ClassifiedInstaller, type InstallerArch, type InstallerOs } from '~/lib/installers.ts'
import type { VersionDetail } from '~/server/dashboard.ts'

function artifactDownloadPath(slug: string, channel: string, version: string, filename: string): string {
  return `/api/v1/apps/${encodeURIComponent(slug)}/channels/${encodeURIComponent(channel)}/versions/${encodeURIComponent(version)}/artifacts/${encodeURIComponent(filename)}`
}

/** Four-pane window mark — simple-icons dropped the Windows trademark logo. */
const WINDOWS_MARK =
  'M3 5.5 10.2 4.4v6.4H3zm8.4-.3L21 3.5v7.3h-9.6zM3 12.8h7.2v6.4L3 18zm8.4 0H21v7.3l-9.6-1.5z'

const OS_ICONS: Record<InstallerOs, { path: string; labelKey: 'osWindows' | 'osMacos' | 'osLinux' }> = {
  windows: { path: WINDOWS_MARK, labelKey: 'osWindows' },
  macos: { path: siApple.path, labelKey: 'osMacos' },
  linux: { path: siLinux.path, labelKey: 'osLinux' },
}

function archLabel(arch: InstallerArch, t: ReturnType<typeof useT>): string {
  if (arch === 'arm') return t.channels.archArm
  if (arch === 'universal') return t.channels.archUniversal
  return t.channels.archX64
}

function OsMark({ os }: { os: InstallerOs }) {
  return (
    <svg viewBox="0 0 24 24" className="size-7 text-foreground/70" fill="currentColor" aria-hidden="true">
      <path d={OS_ICONS[os].path} />
    </svg>
  )
}

export function VersionDownloadDialog({
  slug,
  channel,
  version,
}: {
  slug: string
  channel: string
  version: VersionDetail
}) {
  const t = useT()
  const tiles = installersOf(version.artifacts.map((artifact) => artifact.filename))

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label={t.channels.downloadVersion(version.version)}
            >
              <Download />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{t.channels.download}</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
        <DialogHeader className="flex-row items-center gap-2.5">
          <Download className="size-5 text-muted-foreground" />
          <DialogTitle className="font-mono">v{version.version}</DialogTitle>
        </DialogHeader>
        {tiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.channels.downloadEmpty}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {tiles.map((tile) => (
              <li key={tile.filename}>
                <InstallerTile slug={slug} channel={channel} version={version.version} tile={tile} />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InstallerTile({
  slug,
  channel,
  version,
  tile,
}: {
  slug: string
  channel: string
  version: string
  tile: ClassifiedInstaller
}) {
  const t = useT()
  const os = t.channels[OS_ICONS[tile.os].labelKey]
  const arch = archLabel(tile.arch, t)

  return (
    <a
      href={artifactDownloadPath(slug, channel, version, tile.filename)}
      title={tile.filename}
      aria-label={`${os} ${arch} ${tile.extension}`}
      className="flex w-24 flex-col items-center gap-1 rounded-xl px-2 py-3 text-center transition-colors hover:bg-card"
    >
      <OsMark os={tile.os} />
      <span className="text-sm text-muted-foreground">{arch}</span>
      <span className="font-mono text-xs text-foreground/40">{tile.extension}</span>
    </a>
  )
}
