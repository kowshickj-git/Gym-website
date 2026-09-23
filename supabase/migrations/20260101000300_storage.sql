-- =============================================================================
-- Iron Core Gym - storage buckets
-- Member profile photos. Public read (photos appear in the member card),
-- writes restricted to staff and to the member's own folder.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-photos',
  'member-photos',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists member_photos_public_read on storage.objects;
create policy member_photos_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'member-photos');

-- Staff may upload for anyone; a member may only write inside a folder named
-- after their own member id (e.g. "<member_id>/avatar.webp").
drop policy if exists member_photos_write on storage.objects;
create policy member_photos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'member-photos'
    and (
      public.is_staff()
      or (storage.foldername(name))[1] = public.current_member_id()::text
    )
  );

drop policy if exists member_photos_update on storage.objects;
create policy member_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'member-photos'
    and (
      public.is_staff()
      or (storage.foldername(name))[1] = public.current_member_id()::text
    )
  );

drop policy if exists member_photos_delete on storage.objects;
create policy member_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'member-photos' and public.is_staff());
