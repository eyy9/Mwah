CREATE OR REPLACE FUNCTION public.generate_mawah_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    raw_hex TEXT;
    result TEXT := '';
    i INT;
    idx INT;
BEGIN
    raw_hex := md5(random()::text || clock_timestamp()::text || pg_backend_pid()::text);
    FOR i IN 1..10 LOOP
        idx := (('x' || substr(raw_hex, (i * 2) - 1, 2))::bit(8)::int % length(chars)) + 1;
        result := result || substr(chars, idx, 1);
    END LOOP;
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_room_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    member_count INT;
BEGIN
    PERFORM 1 FROM public.rooms WHERE id = NEW.room_id FOR UPDATE;
    SELECT COUNT(*) INTO member_count FROM public.room_members WHERE room_id = NEW.room_id;
    IF member_count >= 2 THEN
        RAISE EXCEPTION 'ROOM_FULL: هذه المساحة مكتملة ومخصصة لشخصين فقط';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_room_member_limit ON public.room_members;
CREATE TRIGGER trg_enforce_room_member_limit
    BEFORE INSERT ON public.room_members
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_room_member_limit();

CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.room_members
        WHERE room_id = p_room_id AND user_id = auth.uid()
    );
$$;

DROP FUNCTION IF EXISTS public.create_mawah_room();
DROP FUNCTION IF EXISTS public.create_mawah_room(TEXT);

CREATE OR REPLACE FUNCTION public.create_mawah_room(p_display_name TEXT DEFAULT 'حبيبي')
RETURNS TABLE (room_id UUID, invite_code TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_id UUID;
    v_code TEXT;
    v_created TIMESTAMPTZ;
    v_attempts INT := 0;
    v_clean_name TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED: يجب تسجيل الدخول أولاً';
    END IF;

    v_clean_name := COALESCE(NULLIF(trim(p_display_name), ''), 'شريك');

    LOOP
        v_attempts := v_attempts + 1;
        v_code := public.generate_mawah_invite_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.invite_code = v_code);
        IF v_attempts > 15 THEN
            RAISE EXCEPTION 'CODE_GEN_FAILED: تعذر توليد رمز دعوة فريد';
        END IF;
    END LOOP;

    INSERT INTO public.rooms (invite_code, owner_id, status)
    VALUES (v_code, v_user_id, 'active')
    RETURNING id, rooms.created_at INTO v_room_id, v_created;

    INSERT INTO public.room_members (room_id, user_id, display_name)
    VALUES (v_room_id, v_user_id, v_clean_name);

    RETURN QUERY SELECT v_room_id, v_code, v_created;
END;
$$;

DROP FUNCTION IF EXISTS public.join_mawah_room(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.join_mawah_room(p_invite_code TEXT, p_display_name TEXT DEFAULT 'جوري')
RETURNS TABLE (room_id UUID, invite_code TEXT, created_at TIMESTAMPTZ, already_member BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms%ROWTYPE;
    v_clean_code TEXT;
    v_clean_name TEXT;
    v_member_count INT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED: يجب تسجيل الدخول أولاً';
    END IF;

    v_clean_code := upper(regexp_replace(COALESCE(p_invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
    v_clean_name := COALESCE(NULLIF(trim(p_display_name), ''), 'شريك');

    IF length(v_clean_code) < 6 THEN
        RAISE EXCEPTION 'INVALID_CODE: رمز الدعوة غير صحيح';
    END IF;

    SELECT * INTO v_room
    FROM public.rooms
    WHERE upper(rooms.invite_code) = v_clean_code AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_CODE: رمز الدعوة غير صحيح أو المساحة غير موجودة';
    END IF;

    IF EXISTS (SELECT 1 FROM public.room_members rm WHERE rm.room_id = v_room.id AND rm.user_id = v_user_id) THEN
        IF NULLIF(trim(p_display_name), '') IS NOT NULL THEN
            UPDATE public.room_members SET display_name = v_clean_name
            WHERE room_members.room_id = v_room.id AND room_members.user_id = v_user_id;
        END IF;
        RETURN QUERY SELECT v_room.id, v_room.invite_code, v_room.created_at, true;
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_member_count FROM public.room_members rm WHERE rm.room_id = v_room.id;
    IF v_member_count >= 2 THEN
        RAISE EXCEPTION 'ROOM_FULL: عذراً، هذه المساحة مكتملة ومخصصة لشخصين فقط';
    END IF;

    INSERT INTO public.room_members (room_id, user_id, display_name)
    VALUES (v_room.id, v_user_id, v_clean_name);

    RETURN QUERY SELECT v_room.id, v_room.invite_code, v_room.created_at, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_last_canvas_event(p_room_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_target_id UUID;
BEGIN
    IF v_user_id IS NULL OR NOT public.is_room_member(p_room_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: غير مصرح لك';
    END IF;

    SELECT id INTO v_target_id FROM public.canvas_events
    WHERE room_id = p_room_id AND user_id = v_user_id AND is_undone = false
      AND (event_data->>'type') IS DISTINCT FROM 'clear'
    ORDER BY created_at DESC LIMIT 1;

    IF v_target_id IS NOT NULL THEN
        UPDATE public.canvas_events SET is_undone = true WHERE id = v_target_id;
    END IF;
    RETURN v_target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.redo_last_canvas_event(p_room_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_target_id UUID;
BEGIN
    IF v_user_id IS NULL OR NOT public.is_room_member(p_room_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: غير مصرح لك';
    END IF;

    SELECT id INTO v_target_id FROM public.canvas_events
    WHERE room_id = p_room_id AND user_id = v_user_id AND is_undone = true
      AND (event_data->>'type') IS DISTINCT FROM 'clear'
    ORDER BY created_at DESC LIMIT 1;

    IF v_target_id IS NOT NULL THEN
        UPDATE public.canvas_events SET is_undone = false WHERE id = v_target_id;
    END IF;
    RETURN v_target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_mawah_room(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_mawah_room(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_last_canvas_event(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redo_last_canvas_event(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_member(UUID) TO authenticated;
