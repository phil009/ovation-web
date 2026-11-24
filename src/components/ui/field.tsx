import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { strings } from "@/lib/strings";

export const inputClass =
  "ov-border block min-h-12 w-full rounded-lg border-2 border-border bg-surface px-3 py-2 text-base text-text placeholder:text-muted aria-invalid:border-danger";

export interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (describedBy: string | undefined) => ReactNode;
  className?: string;
}

/** Label, hint and error wiring shared by every input. */
export function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: FieldShellProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="font-semibold">
        {label}
        {required ? <span className="font-normal text-muted"> {strings.form.required}</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-semibold text-danger">
          <span className="sr-only">Error:</span> {error}
        </p>
      ) : null}
      {children(describedBy)}
    </div>
  );
}

export interface TextFieldProps extends Omit<ComponentProps<"input">, "id"> {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
}

export function TextField({
  id,
  label,
  hint,
  error,
  required,
  className,
  ...input
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      {(describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          className={cn(inputClass, className)}
          {...input}
        />
      )}
    </FieldShell>
  );
}
