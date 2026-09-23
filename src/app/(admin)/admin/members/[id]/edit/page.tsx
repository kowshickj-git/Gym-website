import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MemberForm } from '@/components/admin/member-form';
import { MemberPhoto } from '@/components/admin/member-photo';
import { requireStaff } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Edit member' };
export const dynamic = 'force-dynamic';

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requireStaff()]);

  const supabase = await createReadOnlyServerSupabase();
  const { data: member } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
  if (!member) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 md:px-6 md:py-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/admin/members/${id}`}>
          <ArrowLeft aria-hidden />
          {member.full_name}
        </Link>
      </Button>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Edit member</h1>
        <p className="text-muted-foreground text-sm">
          Changing the mobile number also changes how this member signs in.
        </p>
      </header>

      <Card className="py-5">
        <div className="space-y-5 px-5">
          <MemberPhoto memberId={member.id} currentUrl={member.photo_url} name={member.full_name} />
          <MemberForm member={member} />
        </div>
      </Card>
    </div>
  );
}
