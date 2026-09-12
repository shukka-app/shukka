/** Sparkle enclosure / sidecar filename rules. Safe for the panel bundle. */

const ARCHIVE = /\.(zip|dmg|aar|tgz)$/i
const TAR = /\.tar\.(gz|bz2|xz)$/i

export function isSparkleArchive(filename: string): boolean {
  return ARCHIVE.test(filename) || TAR.test(filename)
}

export function isSparkleMetadataFile(filename: string): boolean {
  return filename === 'appcast.xml' || filename.endsWith('.sig')
}
