'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { initials } from '@/lib/utils';

const BUCKET = 'member-photos';
const MAX_EDGE = 512;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Member photo upload.
 *
 * The image is downscaled and re-encoded in the browser before it leaves the
 * phone: a modern handset takes 4 MB photos, and uploading those over a patchy
 * mobile connection is slow enough that staff stop bothering. 512px is more
 * than a 64px avatar needs.
 *
 * Storage policies restrict a member to a folder named after their own member
 * id; staff may write to any.
 */
export function PhotoUpload({
  memberId,
  currentUrl,
  name,
  onSaved,
}: {
  memberId: string;
  currentUrl: string | null;
  name: string;
  /** Persists the public URL (or null to clear) against the member record. */
  onSaved: (url: string | null) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, startSaving] = useTransition();

  async function onFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.');
      return;
    }

    setUploading(true);
    try {
      const blob = await downscale(file);
      if (blob.size > MAX_BYTES) {
        toast.error('That image is too large even after resizing. Try a different photo.');
        return;
      }

      const supabase = createClient();
      const path = `${memberId}/avatar-${Date.now()}.webp`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'image/webp',
        upsert: true,
        cacheControl: '3600',
      });

      if (uploadError) {
        toast.error(`Could not upload the photo: ${uploadError.message}`);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);

      startSaving(async () => {
        const result = await onSaved(publicUrl);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setPreview(publicUrl);
        toast.success('Photo updated.');
        router.refresh();
      });
    } catch (error) {
      toast.error((error as Error).message || 'Could not process that image.');
    } finally {
      setUploading(false);
    }
  }

  function remove() {
    startSaving(async () => {
      const result = await onSaved(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setPreview(null);
      toast.success('Photo removed.');
      router.refresh();
    });
  }

  const busy = uploading || saving;

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20">
        {preview ? <AvatarImage src={preview} alt="" /> : null}
        <AvatarFallback className="text-xl">{initials(name)}</AvatarFallback>
      </Avatar>

      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
            event.target.value = '';
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
            {preview ? 'Change photo' : 'Add photo'}
          </Button>

          {preview ? (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={remove}>
              <Trash2 aria-hidden />
              Remove
            </Button>
          ) : null}
        </div>

        <p className="text-muted-foreground text-xs">Resized on your phone before uploading, so it is quick.</p>
      </div>
    </div>
  );
}

/** Reads, orients, downscales and re-encodes to WebP entirely in the browser. */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('That image could not be read.');

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not process that image.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85),
  );
  if (!blob) throw new Error('Your browser could not process that image.');
  return blob;
}
