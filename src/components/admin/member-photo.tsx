'use client';

import { PhotoUpload } from '@/components/photo-upload';
import { saveMemberPhoto } from '@/app/(admin)/admin/members/actions';

/** Staff-side photo upload, bound to the member being edited. */
export function MemberPhoto({
  memberId,
  currentUrl,
  name,
}: {
  memberId: string;
  currentUrl: string | null;
  name: string;
}) {
  return (
    <PhotoUpload
      memberId={memberId}
      currentUrl={currentUrl}
      name={name}
      onSaved={(url) => saveMemberPhoto(memberId, url)}
    />
  );
}
