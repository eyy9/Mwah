ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_select_member" ON public.rooms;
CREATE POLICY "rooms_select_member" ON public.rooms FOR SELECT TO authenticated USING (public.is_room_member(id));

DROP POLICY IF EXISTS "rooms_update_member" ON public.rooms;
CREATE POLICY "rooms_update_member" ON public.rooms FOR UPDATE TO authenticated USING (public.is_room_member(id)) WITH CHECK (public.is_room_member(id));

DROP POLICY IF EXISTS "room_members_select_member" ON public.room_members;
CREATE POLICY "room_members_select_member" ON public.room_members FOR SELECT TO authenticated USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS "room_members_update_self" ON public.room_members;
CREATE POLICY "room_members_update_self" ON public.room_members FOR UPDATE TO authenticated USING (user_id = auth.uid() AND public.is_room_member(room_id));

DROP POLICY IF EXISTS "drawings_select_member" ON public.drawings;
CREATE POLICY "drawings_select_member" ON public.drawings FOR SELECT TO authenticated USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS "drawings_insert_member" ON public.drawings;
CREATE POLICY "drawings_insert_member" ON public.drawings FOR INSERT TO authenticated WITH CHECK (public.is_room_member(room_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "drawings_delete_member" ON public.drawings;
CREATE POLICY "drawings_delete_member" ON public.drawings FOR DELETE TO authenticated USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS "messages_select_member" ON public.messages;
CREATE POLICY "messages_select_member" ON public.messages FOR SELECT TO authenticated USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS "messages_insert_member" ON public.messages;
CREATE POLICY "messages_insert_member" ON public.messages FOR INSERT TO authenticated WITH CHECK (public.is_room_member(room_id) AND sender_id = auth.uid());

DROP POLICY IF EXISTS "reactions_select_member" ON public.reactions;
CREATE POLICY "reactions_select_member" ON public.reactions FOR SELECT TO authenticated USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS "reactions_insert_member" ON public.reactions;
CREATE POLICY "reactions_insert_member" ON public.reactions FOR INSERT TO authenticated WITH CHECK (public.is_room_member(room_id) AND sender_id = auth.uid());

DROP POLICY IF EXISTS "canvas_events_select_member" ON public.canvas_events;
CREATE POLICY "canvas_events_select_member" ON public.canvas_events FOR SELECT TO authenticated USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS "canvas_events_insert_member" ON public.canvas_events;
CREATE POLICY "canvas_events_insert_member" ON public.canvas_events FOR INSERT TO authenticated WITH CHECK (public.is_room_member(room_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "canvas_events_update_member" ON public.canvas_events;
CREATE POLICY "canvas_events_update_member" ON public.canvas_events FOR UPDATE TO authenticated USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS "canvas_events_delete_member" ON public.canvas_events;
CREATE POLICY "canvas_events_delete_member" ON public.canvas_events FOR DELETE TO authenticated USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS "mawah_storage_select" ON storage.objects;
CREATE POLICY "mawah_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'mawah-drawings' AND public.is_room_member((storage.foldername(name))[1]::uuid));

DROP POLICY IF EXISTS "mawah_storage_insert" ON storage.objects;
CREATE POLICY "mawah_storage_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'mawah-drawings' AND public.is_room_member((storage.foldername(name))[1]::uuid));

DROP POLICY IF EXISTS "mawah_storage_delete" ON storage.objects;
CREATE POLICY "mawah_storage_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'mawah-drawings' AND public.is_room_member((storage.foldername(name))[1]::uuid));
