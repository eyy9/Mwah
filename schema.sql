-- Execute Order: 1) schema.sql -> 2) functions.sql -> 3) policies.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code TEXT UNIQUE NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    relationship_start_date DATE NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rooms' AND column_name='status') THEN
        ALTER TABLE public.rooms ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rooms' AND column_name='relationship_start_date') THEN
        ALTER TABLE public.rooms ADD COLUMN relationship_start_date DATE NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rooms_invite_code ON public.rooms(invite_code);

CREATE TABLE IF NOT EXISTS public.room_members (
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL DEFAULT 'شريك',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='room_members' AND column_name='display_name') THEN
        ALTER TABLE public.room_members ADD COLUMN display_name TEXT NOT NULL DEFAULT 'شريك';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON public.room_members(user_id);

CREATE TABLE IF NOT EXISTS public.drawings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    storage_path TEXT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creator_name TEXT NOT NULL DEFAULT 'شريك',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drawings_room_id ON public.drawings(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL DEFAULT 'شريك',
    content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_id ON public.messages(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL DEFAULT 'شريك',
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('heart', 'kiss', 'miss_you', 'im_here')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reactions_room_id ON public.reactions(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.canvas_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL DEFAULT 'شريك',
    event_data JSONB NOT NULL,
    is_undone BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canvas_events_room_id ON public.canvas_events(room_id, created_at ASC);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mawah-drawings', 'mawah-drawings', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'canvas_events') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.canvas_events;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reactions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'drawings') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.drawings;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'room_members') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'rooms') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
    END IF;
END $$;
