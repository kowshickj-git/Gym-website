import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MemberForm } from '@/components/admin/member-form';
import { requireStaff } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Add member' };

export default async function NewMemberPage() {
  await requireStaff();

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/members">
          <ArrowLeft aria-hidden />
          Members
        </Link>
      </Button>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Add a member</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Name and mobile number are all you need to get someone registered. They can sign in with that number straight
          away, and you can fill in the rest later.
        </p>
      </header>

      <Card className="py-5">
        <div className="px-5">
          <MemberForm />
        </div>
      </Card>
    </div>
  );
}
