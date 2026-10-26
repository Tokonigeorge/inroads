import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";
import { cn } from "./cn";

/* The prototype's .btn (L97–108): pills with a hairline border; primary is the one filled action. */
const variants = {
  primary: "bg-accent text-on-accent border border-transparent hover:bg-accent-hover",
  secondary: "bg-surface text-ink border border-line hover:border-border-strong",
  /* .btn.quiet: same pill, no fill. */
  ghost: "bg-transparent text-ink border border-line hover:border-border-strong",
  danger: "bg-bad text-white border border-transparent hover:opacity-90 dark:text-bg",
  /* .link: accent text, no pill. */
  link: "text-accent border-0 !h-auto !min-h-0 !px-0 hover:underline",
} as const;

const sizes = {
  sm: "min-h-[34px] px-3 text-[13px] gap-1.5",
  md: "min-h-10 px-[15px] text-[14px] gap-[7px]",
  lg: "min-h-12 px-5 text-[15px] gap-2",
} as const;

export type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Render the child element (e.g. a Link) with button styles. */
  asChild?: boolean;
};

/** Buttons are verbs: "Log a touch", not "Submit". See DESIGN_SYSTEM.md §4. */
export function Button({ variant = "secondary", size = "md", asChild, className, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold whitespace-nowrap transition-[background-color,border-color,transform] duration-150 active:translate-y-px",
        "cursor-pointer disabled:cursor-not-allowed disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
