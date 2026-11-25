"use client";

import { useWatch, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { RadioFieldset, SelectField } from "@/components/ui/choice";
import { TextField } from "@/components/ui/field";
import { formatNaira, parseNairaInput } from "@/lib/money";
import { WORDS_FROM_KOBO, nairaInWords } from "@/lib/naira-words";
import { strings } from "@/lib/strings";
import { GENERAL, PAYMENT_MODES, type DonationValues } from "@/lib/validation";

const modeOptions = PAYMENT_MODES.map((value) => ({ value, label: strings.paymentModes[value] }));

/** Whole naira: 10k to 500k. Shown in full ("₦10,000") so the visible text is the name. */
const QUICK_AMOUNTS = ["10000", "20000", "50000", "100000", "200000", "500000"] as const;
const grouped = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

export const emptyDonation: DonationValues = {
  awardeeId: GENERAL,
  donorName: "",
  amount: "",
  paymentMode: "TRANSFER",
  status: "RECEIVED",
  needsReview: false,
  note: "",
};

export type DonationFieldIds = Record<keyof DonationValues, string>;

export function donationFieldIds(prefix: string): DonationFieldIds {
  return {
    awardeeId: `${prefix}-for`,
    donorName: `${prefix}-donor`,
    amount: `${prefix}-amount`,
    paymentMode: `${prefix}-mode`,
    status: `${prefix}-status`,
    needsReview: `${prefix}-review`,
    note: `${prefix}-note`,
  };
}

/** "1. Chief Emeka Obi", in the summary's order, then General. */
export function awardeeOptions(
  awardees: readonly { id: string; number: number | null; name: string }[],
) {
  return [
    ...awardees.map((a) => ({
      value: a.id,
      label: strings.record.awardeeOption(a.number, a.name),
    })),
    { value: GENERAL, label: strings.record.general },
  ];
}

/** The amount read back as "= ₦150,000", plus words from 100,000 naira up. */
export function amountReadback(raw: string): { figure: string; words: string } | null {
  const parsed = parseNairaInput(raw);
  if (!parsed.ok) return null;
  return {
    figure: `= ${formatNaira(parsed.kobo)}`,
    words: BigInt(parsed.kobo) >= WORDS_FROM_KOBO ? nairaInWords(parsed.kobo) : "",
  };
}

/**
 * The fields of a donation, shared by the entry screen and the edit page. The donor name
 * suggests names already used at the event (a native datalist: the phone's own UI).
 */
export function DonationFields({
  form,
  ids,
  options,
  donorNames,
  withStatus,
  quickAmounts,
}: {
  form: UseFormReturn<DonationValues>;
  ids: DonationFieldIds;
  options: { value: string; label: string }[];
  donorNames?: readonly string[];
  /** Edit page: ask whether a pledge has been paid. */
  withStatus?: boolean;
  quickAmounts?: boolean;
}) {
  const { errors, isSubmitted } = form.formState;
  const amount = useWatch({ control: form.control, name: "amount" });
  const paymentMode = useWatch({ control: form.control, name: "paymentMode" });
  const readback = amountReadback(amount);
  const listId = `${ids.donorName}-suggestions`;
  const chipsLabel = `${ids.amount}-quick`;

  return (
    <>
      <SelectField
        id={ids.awardeeId}
        label={strings.record.forLabel}
        hint={strings.record.forHint}
        options={options}
        error={errors.awardeeId?.message}
        {...form.register("awardeeId")}
      />
      <TextField
        id={ids.donorName}
        label={strings.record.donorName}
        hint={donorNames?.length ? strings.record.donorHint : undefined}
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="next"
        required
        list={donorNames?.length ? listId : undefined}
        error={errors.donorName?.message}
        {...form.register("donorName")}
      />
      {donorNames?.length ? (
        <datalist id={listId}>
          {donorNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </datalist>
      ) : null}
      <div className="flex flex-col gap-2">
        <TextField
          id={ids.amount}
          label={strings.record.amount}
          hint={strings.record.amountHint}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          required
          className="text-xl tabular"
          error={errors.amount?.message}
          {...form.register("amount")}
        />
        {/* Read back while typing, so a missing zero is heard and seen. */}
        <div aria-live="polite" className="min-h-6">
          {readback ? (
            <p>
              <span className="font-semibold tabular">{readback.figure}</span>
              {readback.words ? (
                <span className="block text-muted first-letter:uppercase">{readback.words}</span>
              ) : null}
            </p>
          ) : null}
        </div>
        {quickAmounts ? (
          <div role="group" aria-labelledby={chipsLabel} className="flex flex-col gap-2">
            <p id={chipsLabel} className="text-sm font-semibold">
              {strings.record.quickAmounts}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map((naira) => (
                <Button
                  key={naira}
                  variant="secondary"
                  className="tabular"
                  onClick={() =>
                    form.setValue("amount", grouped.format(BigInt(naira)), {
                      shouldDirty: true,
                      shouldValidate: isSubmitted,
                    })
                  }
                >
                  {formatNaira(`${naira}00`)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <RadioFieldset
        id={ids.paymentMode}
        legend={strings.record.paymentMode}
        options={modeOptions}
        inline
        error={errors.paymentMode?.message}
        {...form.register("paymentMode")}
      />
      {withStatus && paymentMode === "PLEDGE" ? (
        <RadioFieldset
          id={ids.status}
          legend={strings.donations.status}
          options={[
            { value: "PLEDGED", label: strings.donations.statusPledged },
            { value: "RECEIVED", label: strings.donations.statusReceived },
          ]}
          error={errors.status?.message}
          {...form.register("status")}
        />
      ) : null}
    </>
  );
}

/** "Check this entry later" and the note: rarely needed, so the entry screen folds them. */
export function DonationExtras({
  form,
  ids,
}: {
  form: UseFormReturn<DonationValues>;
  ids: DonationFieldIds;
}) {
  const { errors } = form.formState;
  const hintId = `${ids.needsReview}-hint`;
  return (
    <>
      <div className="flex flex-col">
        <label
          htmlFor={ids.needsReview}
          className="flex min-h-12 cursor-pointer items-center gap-3"
        >
          <input
            id={ids.needsReview}
            type="checkbox"
            aria-describedby={hintId}
            className="size-5 shrink-0 accent-primary"
            {...form.register("needsReview")}
          />
          <span className="font-semibold">{strings.record.needsReview}</span>
        </label>
        <p id={hintId} className="-mt-2 ml-8 text-sm text-muted">
          {strings.record.needsReviewHint}
        </p>
      </div>
      <TextField
        id={ids.note}
        label={strings.record.note}
        hint={strings.record.noteHint}
        autoComplete="off"
        maxLength={500}
        error={errors.note?.message}
        {...form.register("note")}
      />
    </>
  );
}
