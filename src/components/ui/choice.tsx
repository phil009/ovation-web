import type { ComponentProps, ReactNode } from "react";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { FieldShell, inputClass } from "./field";

export interface ChoiceOption<V extends string> {
  value: V;
  label: ReactNode;
  description?: ReactNode;
}

/**
 * A group of radio buttons in a fieldset with a visible legend. Spread `form.register(name)`
 * into it; every radio gets the same handlers, which react-hook-form supports.
 */
export function RadioFieldset<V extends string>({
  id,
  legend,
  hint,
  error,
  required,
  options,
  inline,
  className,
  ...input
}: Omit<ComponentProps<"input">, "id" | "type" | "value"> & {
  id: string;
  legend: ReactNode;
  hint?: ReactNode;
  error?: string;
  options: readonly ChoiceOption<V>[];
  inline?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      className={cn("flex flex-col gap-1.5 outline-none", className)}
    >
      <legend className="mb-1.5 font-semibold">
        {legend}
        {required ? <span className="font-normal text-muted"> {strings.form.required}</span> : null}
      </legend>
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
      <div className={cn("flex gap-x-6 gap-y-1", inline ? "flex-wrap" : "flex-col")}>
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          const descriptionId = option.description ? `${optionId}-description` : undefined;
          return (
            <div key={option.value} className="flex flex-col">
              <label htmlFor={optionId} className="flex min-h-12 cursor-pointer items-center gap-3">
                <input
                  id={optionId}
                  type="radio"
                  value={option.value}
                  aria-describedby={descriptionId}
                  className="size-5 shrink-0 accent-primary"
                  {...input}
                />
                <span>{option.label}</span>
              </label>
              {option.description ? (
                <p id={descriptionId} className="-mt-2 mb-1 ml-8 text-sm text-muted">
                  {option.description}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A native select: the most accessible picker on phones (the system sheet). */
export function SelectField<V extends string>({
  id,
  label,
  hint,
  error,
  required,
  options,
  className,
  ...select
}: Omit<ComponentProps<"select">, "id"> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  options: readonly { value: V; label: string }[];
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      {(describedBy) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(inputClass, "pr-8", className)}
          {...select}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}
