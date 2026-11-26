import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-full';

    const variantStyles = {
      primary:
        'bg-brandForest text-white hover:bg-brandForestDark focus-visible:ring-brandForest',
      secondary:
        'bg-black text-white hover:bg-black/85 focus-visible:ring-black',
      outline:
        'border border-black/15 bg-white text-black hover:border-black/40 focus-visible:ring-black',
      ghost:
        'text-black/65 hover:bg-black/5 hover:text-black focus-visible:ring-black/40',
      danger:
        'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500',
      success:
        'bg-brandForest text-white hover:bg-brandForestDark focus-visible:ring-brandForest',
      warning:
        'bg-amber-500 text-black hover:bg-amber-400 focus-visible:ring-amber-400',
    };

    const sizeStyles = {
      sm: 'text-xs px-3.5 py-1.5 gap-1.5',
      md: 'text-sm px-5 py-2.5 gap-2',
      lg: 'text-base px-6 py-3 gap-2.5',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

