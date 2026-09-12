import { CircleHelp } from 'lucide-react'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'

type FieldProps = {
  name: string
  label: string
  error?: string
  hint?: string
  tooltip?: string
  className?: string
} & React.ComponentProps<typeof Input>

/**
 * App form field shared by the creation wizard and the settings form: label
 * with optional help tooltip, input, then error or hint. In multi-column grids
 * the input is anchored to the top of the field's row track so a wrapping hint
 * never pushes a neighbor's input out of alignment.
 */
export function Field({ name, label, error, hint, tooltip, className, ...props }: FieldProps) {
  return (
    <div className={className ? `grid content-start gap-2 ${className}` : 'grid content-start gap-2'}>
      <span className="flex items-center gap-1.5">
        <Label htmlFor={name}>{label}</Label>
        {tooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger type="button" className="text-muted-foreground/60 hover:text-muted-foreground">
                <CircleHelp className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </span>
      <Input id={name} name={name} aria-invalid={error ? true : undefined} {...props} />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
