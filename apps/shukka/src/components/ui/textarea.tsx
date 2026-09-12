import * as React from "react"

import { cn } from "~/lib/utils"

/** Matches Input: card-tone fill, hairline outline, full-ink focus outline. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full min-w-0 rounded-sm bg-card px-3 py-2 text-base outline outline-1 -outline-offset-1 outline-input transition-colors selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground/70 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "hover:bg-accent/50",
        "focus-visible:outline-2 focus-visible:outline-foreground focus-visible:bg-accent/50",
        "aria-invalid:outline-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
