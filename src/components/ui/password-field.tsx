"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FieldShell, inputClass, type TextFieldProps } from "./field";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

/** Password input with a real toggle button (aria-pressed). Paste is never blocked. */
export function PasswordField({
  id,
  label,
  hint,
  error,
  required,
  className,
  ...input
}: Omit<TextFieldProps, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      {(describedBy) => (
        <div className="flex gap-2">
          <input
            id={id}
            type={visible ? "text" : "password"}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            aria-required={required || undefined}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={cn(inputClass, "min-w-0 flex-1", className)}
            {...input}
          />
          <button
            type="button"
            aria-label={strings.form.showPassword}
            aria-pressed={visible}
            aria-controls={id}
            onClick={() => setVisible((v) => !v)}
            className="ov-border inline-flex min-h-12 min-w-20 shrink-0 items-center justify-center gap-1.5 rounded-lg border-2 border-border bg-surface px-3 font-semibold"
          >
            {visible ? (
              <EyeOff aria-hidden className="size-5" />
            ) : (
              <Eye aria-hidden className="size-5" />
            )}
            <span>{strings.form.show}</span>
          </button>
        </div>
      )}
    </FieldShell>
  );
}
