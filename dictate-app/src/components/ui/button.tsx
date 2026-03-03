import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"border-primary/40 bg-primary text-primary-foreground shadow-sm hover:bg-primary/92 hover:shadow-lg",
				destructive:
					"border-destructive/40 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/92 hover:shadow-lg",
				outline:
					"border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-ring/40",
				secondary:
					"border-secondary bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
				ghost:
					"border-transparent text-foreground hover:bg-accent hover:text-accent-foreground hover:border-ring/35",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 rounded-md px-3 text-xs",
				lg: "h-10 rounded-md px-8",
				icon: "h-9 w-9",
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
		return (
			<Comp
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				{...props}
			/>
		);
	},
);
Button.displayName = "Button";

export { Button, buttonVariants };
