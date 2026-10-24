import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-[#182230]">
            {label}
            {props.required && <span className="text-[#C0393A] ml-1">*</span>}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={twMerge(
            clsx(
              'w-full px-3.5 py-2.5 text-sm rounded-md border bg-white text-[#182230] placeholder:text-[#94A3B8] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:bg-[#F7F9FC] disabled:cursor-not-allowed',
              error
                ? 'border-[#C0393A] focus:ring-[#C0393A] focus:border-[#C0393A]'
                : 'border-[#E4E9F0] focus:ring-[#2864B4] focus:border-[#2864B4]',
              className
            )
          )}
          {...props}
        />
        {error && <p className="text-xs font-medium text-[#C0393A] mt-0.5">{error}</p>}
        {!error && helperText && (
          <p className="text-xs text-[#667085] mt-0.5">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
