import { supabase } from './supabase.js';

export async function saveDrawingMemory(roomId, userId, creatorName, pngBlob) {
    const fileName = `${roomId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;

    const { error: uploadErr } = await supabase.storage
        .from('mawah-drawings')
        .upload(fileName, pngBlob, { contentType: 'image/png', upsert: false });

    if (uploadErr) throw uploadErr;

    const { data: pubUrlData } = supabase.storage
        .from('mawah-drawings')
        .getPublicUrl(fileName);

    const { data, error: dbErr } = await supabase
        .from('drawings')
        .insert({
            room_id: roomId,
            image_url: pubUrlData.publicUrl,
            storage_path: fileName,
            created_by: userId,
            creator_name: creatorName
        })
        .select()
        .single();

    if (dbErr) throw dbErr;
    return data;
}

export async function fetchRoomDrawings(roomId) {
    const { data, error } = await supabase
        .from('drawings')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function deleteDrawingMemory(drawing) {
    if (drawing.storage_path) {
        await supabase.storage.from('mawah-drawings').remove([drawing.storage_path]);
    }
    const { error } = await supabase.from('drawings').delete().eq('id', drawing.id);
    if (error) throw error;
}
