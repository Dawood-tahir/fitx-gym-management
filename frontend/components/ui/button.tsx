import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: "sm" | "md" | "icon"; loading?: boolean; }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "bg-primary text-[#04200f] shadow-green hover:bg-primary-hover",
        variant === "secondary" && "border border-white/10 bg-white/[.045] text-foreground hover:border-white/20 hover:bg-white/[.075]",
        variant === "ghost" && "text-secondary hover:bg-white/[.06] hover:text-foreground",
        variant === "danger" && "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20",
        size === "sm" && "h-9 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "icon" && "size-10 p-0",
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" />}{children}
    </button>
  );
});
