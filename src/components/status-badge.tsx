import { AlertTriangle, CheckCircle2, CircleSlash, Clock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MEMBERSHIP_STATUS_LABEL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { MembershipPaymentStatus, MembershipStatus } from '@/types/database';

const STATUS_STYLE: Record<MembershipStatus, { variant: 'success' | 'warning' | 'danger' | 'muted'; Icon: typeof CheckCircle2 }> = {
  ACTIVE: { variant: 'success', Icon: CheckCircle2 },
  EXPIRING_SOON: { variant: 'warning', Icon: Clock },
  EXPIRED: { variant: 'danger', Icon: XCircle },
  CANCELLED: { variant: 'muted', Icon: CircleSlash },
  PENDING: { variant: 'muted', Icon: AlertTriangle },
};

export function MembershipStatusBadge({
  status,
  className,
  showIcon = true,
}: {
  status: MembershipStatus | null | undefined;
  className?: string;
  showIcon?: boolean;
}) {
  if (!status) {
    return (
      <Badge variant="muted" className={className}>
        No membership
      </Badge>
    );
  }

  const { variant, Icon } = STATUS_STYLE[status];
  return (
    <Badge variant={variant} className={cn('gap-1', className)}>
      {showIcon ? <Icon aria-hidden /> : null}
      {MEMBERSHIP_STATUS_LABEL[status]}
    </Badge>
  );
}

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: MembershipPaymentStatus | null | undefined;
  className?: string;
}) {
  if (!status) return null;

  if (status === 'PAID') {
    return (
      <Badge variant="success" className={className}>
        Paid
      </Badge>
    );
  }
  if (status === 'PARTIAL') {
    return (
      <Badge variant="warning" className={className}>
        Part paid
      </Badge>
    );
  }
  return (
    <Badge variant="danger" className={className}>
      Unpaid
    </Badge>
  );
}
