"use client";

import { DropdownMenu } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Thin styled wrappers over Radix DropdownMenu (keyboard and ARIA handled by Radix). */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={8}
        align="end"
        collisionPadding={8}
        className={cn(
          "ov-border z-50 flex min-w-60 flex-col gap-1 rounded-xl border-2 border-divider bg-surface p-2 text-text shadow-xl",
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 font-semibold outline-none select-none data-[disabled]:opacity-60 data-[highlighted]:bg-bg data-[highlighted]:outline-3 data-[highlighted]:outline-ring [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label className={cn("px-3 pt-1 text-sm text-muted", className)} {...props} />
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-divider" />;
}

export const MenuRadioGroup = DropdownMenu.RadioGroup;

export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.RadioItem>) {
  return (
    <DropdownMenu.RadioItem
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 font-semibold outline-none select-none data-[highlighted]:bg-bg data-[highlighted]:outline-3 data-[highlighted]:outline-ring",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="inline-flex size-5 items-center justify-center rounded-full border-2 border-border"
      >
        <DropdownMenu.ItemIndicator className="size-2.5 rounded-full bg-primary" />
      </span>
      {children}
    </DropdownMenu.RadioItem>
  );
}
