'use client';

import { PhotoUpload } from '@/components/photo-upload';
import { saveMyPhoto } from './actions';

/**
 * Thin client wrapper so the page can stay a server component while still
 * handing the uploader a server action to call.
 */
export function ProfilePhoto({
  memberId,
  currentUrl,
  name,
}: {
  memberId: string;
  currentUrl: string | null;
  name: string;
}) {
  return <PhotoUpload memberId={memberId} currentUrl={currentUrl} name={name} onSaved={saveMyPhoto} />;
}
