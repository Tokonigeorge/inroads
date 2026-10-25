import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";
import { cn } from "./cn";

const variants = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-surface text-text border border-border-strong hover:bg-sunken",
  /* A quiet action, still clearly an action: accent text, a tint on hover. */
  ghost: "text-accent hover:bg-accent-soft",
  danger: "bg-danger text-white hover:opacity-90 dark:text-bg",
} as const;

const sizes = {
  sm: "h-8 px-3 text-small gap-1.5",
  md: "h-10 px-4 text-body gap-2",
  lg: "h-12 px-5 text-body gap-2",
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
        "inline-flex shrink-0 items-center justify-center rounded-md font-[550] whitespace-nowrap transition-colors duration-[120ms]",
        "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
