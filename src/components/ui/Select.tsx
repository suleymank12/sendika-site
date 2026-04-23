"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { SelectHTMLAttributes, forwardRef } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, id, children, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e);
      // Seçim sonrası focus'u kaldır ki ok eski haline dönsün
      e.target.blur();
    };

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-text-dark mb-1">
            {label}
          </label>
        )}
        <div className="relative group">
          <select
            ref={ref}
            id={id}
            onChange={handleChange}
            className={cn(
              "peer w-full appearance-none rounded-lg border bg-white pl-3 pr-10 py-2 text-sm text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors",
              error ? "border-error" : "border-border",
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted transition-transform duration-200 peer-focus:rotate-180 peer-focus:text-primary"
          />
        </div>
        {error && <p className="mt-1 text-xs text-error">{error}</p>}
        {helperText && !error && <p className="mt-1 text-xs text-text-muted">{helperText}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";

export default Select;
