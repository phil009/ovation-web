import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** All buttons are at least 48px tall (WCAG 2.5.8 is 24px; older users in dim halls need more). */
export const buttonVariants = cva(
  "ov-border inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border-primary bg-primary text-on-primary hover:bg-primary/90",
        secondary: "border-border bg-surface text-text hover:bg-bg",
        ghost: "border-transparent bg-transparent text-text hover:bg-surface",
        danger: "border-danger bg-danger text-on-danger hover:bg-danger/90",
        link: "min-h-12 border-transparent px-1 text-primary underline underline-offset-4 hover:decoration-2",
      },
      size: {
        default: "",
        wide: "w-full",
        icon: "size-12 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
