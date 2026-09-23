'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reverifyPayment } from '@/app/(admin)/admin/payments/actions';

/** Reconciliation for a payment the webhook never settled. */
export function ReverifyPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reverifyPayment(paymentId);
          if (result.error) {
            toast.error(result.error, { duration: 10000 });
            router.refresh();
            return;
          }
          toast.success(result.message ?? 'Checked with Razorpay.', { duration: 8000 });
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      {pending ? 'Checking with Razorpay…' : 'Re-check with Razorpay'}
    </Button>
  );
}
