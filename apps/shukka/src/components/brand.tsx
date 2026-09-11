import gsap from 'gsap'
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin'
import { useImperativeHandle, useRef, type Ref, type SVGProps } from 'react'

// MorphSVGPlugin reads `document` when registered, so skip registration during SSR.
if (typeof window !== 'undefined') {
  gsap.registerPlugin(MorphSVGPlugin)
}

// Lucide `package` (sealed) and `package-open` geometry, paired by role: the box
// body collapses into the open tray, the lid seam and tape line bloom into the
// two splayed flaps, and the center seam just shortens.
const CLOSED_PATHS = {
  body: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
  seam: 'M12 22V12',
  lid: 'M3.29 7 12 12 20.71 7',
  tape: 'm7.5 4.27 9 5.15',
} as const

const OPEN_PATHS = {
  body: 'M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13',
  seam: 'M12 22v-9',
  lid: 'M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z',
  tape: 'M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z',
} as const

type BrandIconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & {
  size?: number | string
}

/** Shukka mark: a sealed shipping box (it opens on hover in the animated form). */
export function PackageIcon({ size = 24, ...props }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={CLOSED_PATHS.body} />
      <path d={CLOSED_PATHS.seam} />
      <path d={CLOSED_PATHS.lid} />
      <path d={CLOSED_PATHS.tape} />
    </svg>
  )
}

export interface AnimatedPackageIconHandle {
  /** Morph to the open box. */
  play: () => void
  /** Morph back to the sealed box. */
  reset: () => void
}

interface AnimatedPackageIconProps extends BrandIconProps {
  ref?: Ref<AnimatedPackageIconHandle>
}

/**
 * PackageIcon that shape-morphs between the sealed and open box via GSAP
 * MorphSVGPlugin. Self-hovering: the wrapper plays/reverses on pointer
 * enter/leave, so the parent need not drive the handle (kept for compatibility).
 */
export function AnimatedPackageIcon({ ref, size = 24, ...props }: AnimatedPackageIconProps) {
  const bodyRef = useRef<SVGPathElement>(null)
  const seamRef = useRef<SVGPathElement>(null)
  const lidRef = useRef<SVGPathElement>(null)
  const tapeRef = useRef<SVGPathElement>(null)

  function morph(open: boolean) {
    const parts = [
      [bodyRef, 'body'],
      [seamRef, 'seam'],
      [lidRef, 'lid'],
      [tapeRef, 'tape'],
    ] as const
    const target = open ? OPEN_PATHS : CLOSED_PATHS
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const [partRef, key] of parts) {
      const el = partRef.current
      if (!el) continue
      if (reduce) {
        el.setAttribute('d', target[key])
        continue
      }
      gsap.killTweensOf(el)
      gsap.to(el, {
        morphSVG: target[key],
        duration: open ? 0.45 : 0.3,
        ease: open ? (key === 'lid' || key === 'tape' ? 'back.out(1.4)' : 'power3.out') : 'power2.out',
      })
    }
  }

  useImperativeHandle(
    ref,
    (): AnimatedPackageIconHandle => ({
      play: () => morph(true),
      reset: () => morph(false),
    }),
  )

  return (
    <span
      className="inline-flex shrink-0"
      onPointerEnter={() => morph(true)}
      onPointerLeave={() => morph(false)}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <path ref={bodyRef} d={CLOSED_PATHS.body} />
        <path ref={seamRef} d={CLOSED_PATHS.seam} />
        <path ref={lidRef} d={CLOSED_PATHS.lid} />
        <path ref={tapeRef} d={CLOSED_PATHS.tape} />
      </svg>
    </span>
  )
}
