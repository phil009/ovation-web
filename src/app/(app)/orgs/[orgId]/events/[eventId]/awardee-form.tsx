"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { summaryItems, useSubmitErrors } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { RadioFieldset } from "@/components/ui/choice";
import { ErrorSummary } from "@/components/ui/error-summary";
import { TextField } from "@/components/ui/field";
import { isClosedEventConflict } from "@/lib/api/queries";
import { isApiError } from "@/lib/api/errors";
import { formatNaira, parseNairaInput } from "@/lib/money";
import { strings } from "@/lib/strings";
import {
  PAYMENT_MODES,
  awardeeBody,
  awardeeSchema,
  type AwardeeBody,
  type AwardeeValues,
} from "@/lib/validation";

const modeOptions = PAYMENT_MODES.map((value) => ({ value, label: strings.paymentModes[value] }));

export const emptyAwardee: AwardeeValues = {
  number: "",
  name: "",
  amount: "",
  paymentMode: "TRANSFER",
};

/**
 * Add or edit an awardee. `onSave` sends the body and returns the next values to show (for
 * adding: an empty form with the next notebook number), or throws an API error.
 */
export function AwardeeForm({
  idPrefix,
  mode,
  defaultValues,
  onSave,
  onClosedEvent,
}: {
  idPrefix: string;
  mode: "create" | "update";
  defaultValues: AwardeeValues;
  onSave: (body: AwardeeBody, values: AwardeeValues) => Promise<AwardeeValues | void>;
  onClosedEvent: () => void;
}) {
  const ids = {
    number: `${idPrefix}-number`,
    name: `${idPrefix}-name`,
    amount: `${idPrefix}-amount`,
    paymentMode: `${idPrefix}-mode`,
  };
  const form = useForm<AwardeeValues>({
    resolver: zodResolver(awardeeSchema),
    defaultValues,
    shouldFocusError: false,
  });
  const { formError, focusKey, fail, onInvalid, reset, coolingDown } = useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;
  const amount = useWatch({ control: form.control, name: "amount" });
  const preview = amountPreview(amount);
  // After adding, focus goes back to the name for the next awardee. Done after the re-render:
  // focusing inside the submit handler is lost when the form resets and the button re-enables.
  const [saved, setSaved] = useState(0);
  const { setFocus } = form;
  useEffect(() => {
    if (saved > 0) setFocus("name");
  }, [saved, setFocus]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const next = await onSave(awardeeBody(values, mode), values);
      if (next) {
        form.reset(next);
        reset();
        setSaved((n) => n + 1);
      }
    } catch (error) {
      if (isClosedEventConflict(error)) onClosedEvent();
      fail(error, {
        409: isClosedEventConflict(error)
          ? strings.event.closedConflict
          : isApiError(error)
            ? error.message
            : undefined,
      });
    }
  }, onInvalid);

  return (
    <div className="flex flex-col gap-6">
      <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <TextField
          id={ids.number}
          label={strings.awardees.number}
          hint={strings.awardees.numberHint}
          inputMode="numeric"
          autoComplete="off"
          className="max-w-40"
          error={errors.number?.message}
          {...form.register("number")}
        />
        <TextField
          id={ids.name}
          label={strings.awardees.name}
          hint={strings.awardees.nameHint}
          autoComplete="off"
          required
          error={errors.name?.message}
          {...form.register("name")}
        />
        <div className="flex flex-col gap-1.5">
          <TextField
            id={ids.amount}
            label={strings.awardees.amount}
            hint={strings.awardees.amountHint}
            autoComplete="off"
            error={errors.amount?.message}
            {...form.register("amount")}
          />
          {/* Polite, so the parsed amount is read back while typing ("3m" is ₦3,000,000). */}
          <p aria-live="polite" className="min-h-6 text-muted tabular">
            {preview}
          </p>
        </div>
        <RadioFieldset
          id={ids.paymentMode}
          legend={strings.awardees.paymentMode}
          options={modeOptions}
          inline
          error={errors.paymentMode?.message}
          {...form.register("paymentMode")}
        />
        <Button type="submit" size="wide" disabled={isSubmitting || coolingDown}>
          {mode === "create"
            ? isSubmitting
              ? strings.awardees.submitting
              : strings.awardees.submit
            : isSubmitting
              ? strings.awardees.saving
              : strings.awardees.save}
        </Button>
      </form>
    </div>
  );
}

function amountPreview(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "" || /^0+$/.test(trimmed)) return "";
  const parsed = parseNairaInput(trimmed);
  return parsed.ok ? `= ${formatNaira(parsed.kobo)}` : "";
}
