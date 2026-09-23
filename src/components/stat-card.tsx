import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type * as React from 'react';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  /** Percentage change against the previous period. */
  delta?: number | null;
  /** Higher is better for revenue, worse for "expired members". */
  deltaGood?: 'up' | 'down';
  href?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

const TONE_RING: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-muted-foreground bg-muted',
  success: 'text-success bg-success/10',
  warning: 'text-warning-foreground dark:text-warning bg-warning/15',
  danger: 'text-destructive bg-destructive/10',
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  delta,
  deltaGood = 'up',
  href,
  tone = 'default',
  className,
}: StatCardProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta) && delta !== 0;
  const rising = (delta ?? 0) > 0;
  const good = rising === (deltaGood === 'up');

  const body = (
    <Card
      className={cn(
        'gap-0 py-4 transition-colors',
        href && 'hover:border-primary/40 hover:bg-accent/40 cursor-pointer',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
          <p className="tnum text-2xl leading-tight font-bold">{value}</p>
          {hint || hasDelta ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {hasDelta ? (
                <span className={cn('inline-flex items-center gap-0.5 font-semibold', good ? 'text-success' : 'text-destructive')}>
                  {rising ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
                  {Math.abs(delta!).toFixed(0)}%
                </span>
              ) : null}
              {hint ? <span className="text-muted-foreground">{hint}</span> : null}
            </div>
          ) : null}
        </div>
        {icon ? (
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4.5', TONE_RING[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  );

  return href ? (
    <Link href={href} className="block focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-[3px]">
      {body}
    </Link>
  ) : (
    body
  );
}
