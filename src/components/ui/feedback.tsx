import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Skeletons, alerts and empty states — the three "not the happy path" surfaces. */

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />;
}

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive: 'border-destructive/40 bg-destructive/10 text-destructive [&>svg]:text-destructive',
        warning: 'border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning',
        success: 'border-success/40 bg-success/10 text-success',
        info: 'border-primary/30 bg-primary/5 text-foreground [&>svg]:text-primary',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 line-clamp-1 min-h-4 font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 grid justify-items-start gap-1 text-sm opacity-90 [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

interface EmptyStateProps extends React.ComponentProps<'div'> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** The screen a new gym sees on day one, before any data exists. */
function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}
      {...props}
    >
      {icon ? (
        <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-muted-foreground mx-auto max-w-sm text-sm text-pretty">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export { Skeleton, Alert, AlertTitle, AlertDescription, EmptyState };
