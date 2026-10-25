import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
  id: string; // Enforce explicit ID for reliable label association
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      label,
      description,
      error,
      id,
      disabled,
      required,
      ...props
    },
    ref
  ) => {
    const descriptionId = description ? `${id}-description` : undefined;
    const errorId = error ? `${id}-error` : undefined;

    const describedBy =
      [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="w-full flex flex-col space-y-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-foreground flex items-center justify-between"
          >
            <span>
              {label}
              {required && (
                <span className="text-destructive ml-1" aria-hidden="true">
                  *
                </span>
              )}
            </span>
          </label>
        )}

        {description && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}

        <input
          id={id}
          ref={ref}
          type={type}
          disabled={disabled}
          required={required}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={describedBy}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-destructive focus-visible:outline-destructive"
              : "border-border",
            className
          )}
          {...props}
        />

        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-xs font-medium text-destructive mt-1"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
