import * as React from "react"

import { cn } from "~/lib/utils"

/**
 * Cursor-style field: card-tone fill, hairline outline (not border, so it never
 * shifts layout), tiny radius, no shadow. Focus swaps to a full-ink outline
 * plus a slight surface shift — no ring.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-sm bg-card px-3 py-1 text-base outline outline-1 -outline-offset-1 outline-input transition-colors selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:text-foreground placeholder:text-muted-foreground/70 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "hover:bg-accent/50",
        "focus-visible:outline-2 focus-visible:outline-foreground focus-visible:bg-accent/50",
        "aria-invalid:outline-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
