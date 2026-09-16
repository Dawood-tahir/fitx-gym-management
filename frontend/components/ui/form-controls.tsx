import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, error, hint, required, children, className }: { label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return <label className={cn("block space-y-2", className)}><span className="text-xs font-medium text-secondary">{label}{required && <span className="ms-1 text-danger">*</span>}</span>{children}{error ? <span className="block text-xs text-danger">{error}</span> : hint ? <span className="block text-xs text-muted">{hint}</span> : null}</label>;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("h-10 w-full rounded-lg border border-white/10 bg-background/70 px-3 text-sm text-foreground outline-none transition placeholder:text-muted/70 hover:border-white/20 focus:border-primary/60 focus:ring-2 focus:ring-primary/15 disabled:opacity-50", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return <select ref={ref} className={cn("h-10 w-full rounded-lg border border-white/10 bg-background/80 px-3 text-sm text-foreground outline-none transition hover:border-white/20 focus:border-primary/60 focus:ring-2 focus:ring-primary/15", className)} {...props}>{children}</select>;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("min-h-24 w-full resize-y rounded-lg border border-white/10 bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted/70 hover:border-white/20 focus:border-primary/60 focus:ring-2 focus:ring-primary/15", className)} {...props} />;
});
