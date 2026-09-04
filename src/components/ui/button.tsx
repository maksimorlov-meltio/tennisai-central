import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // `active:scale` gives every button in the app a physical press. 0.97 over
  // 100ms — enough to feel, too small to look bouncy against a matte brand.
  // transition-[colors,transform], not transition-all, so a button whose label
  // changes ("Save" → "Saving…") doesn't animate its own width.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[color,background-color,border-color,transform] duration-100 active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Touch sizing rule: `coarse:min-h-11` (44px), never `coarse:h-11`.
      //
      // min-height beats height in the cascade no matter which rule wins on
      // specificity, so a caller that hard-codes `className="h-8 w-8"` — and
      // dozens across the app do — still gets a 44px finger target on a phone
      // while keeping its 32px look on a mouse. tailwind-merge treats
      // `h-8` and `coarse:min-h-11` as different modifier sets, so neither
      // deduplicates the other away.
      size: {
        default: "h-10 px-4 py-2 coarse:min-h-11",
        sm: "h-9 rounded-md px-3 coarse:min-h-11",
        // Already 44px — nothing to raise.
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10 coarse:min-h-11 coarse:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
