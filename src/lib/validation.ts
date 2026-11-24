import { z } from "zod";
import { strings } from "./strings";

// No JIT: zod would probe `new Function`, which the CSP (no unsafe-eval) blocks and reports.
z.config({ jitless: true });

const v = strings.validation;

export const emailSchema = z.string().trim().min(1, v.emailRequired).pipe(z.email(v.emailInvalid));

// Matches the backend: 8 to 128 characters. No other rules (length beats complexity).
export const newPasswordSchema = z
  .string()
  .min(1, v.passwordRequired)
  .min(8, v.passwordTooShort)
  .max(128, v.passwordTooLong);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, v.passwordRequired),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(1, v.nameRequired).max(100, v.nameTooLong),
  email: emailSchema,
  password: newPasswordSchema,
});
export type RegisterValues = z.infer<typeof registerSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, v.currentPasswordRequired),
    newPassword: newPasswordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: v.passwordsDiffer,
    path: ["newPassword"],
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const orgSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, v.orgNameRequired)
    .min(2, v.orgNameTooShort)
    .max(120, v.orgNameTooLong),
});
export type OrgValues = z.infer<typeof orgSchema>;

/** The backend ignores case, spaces and dashes; the alphabet has no 0/O or 1/I/L. */
export function normaliseInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]+/g, "");
}

export const joinSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, v.codeRequired)
    .refine((c) => /^[A-Z0-9]{6,20}$/.test(normaliseInviteCode(c)), v.codeInvalid),
});
export type JoinValues = z.infer<typeof joinSchema>;
