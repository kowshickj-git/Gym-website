'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type * as React from 'react';

/**
 * A submit button that disables and shows a spinner while its form is in
 * flight. Uses the platform's own pending state, so it works with progressive
 * enhancement and needs no per-form `useState`.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
