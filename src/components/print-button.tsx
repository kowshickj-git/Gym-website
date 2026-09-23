'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Opens the browser's print dialogue. Prints as PDF on both iOS and Android. */
export function PrintButton({ label = 'Print / Save PDF' }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
