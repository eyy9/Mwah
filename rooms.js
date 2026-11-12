import { supabase } from './supabase.js';

export async function createRoom(displayName) {
    const { data, error } = await supabase.rpc('create_mawah_room', {
        p_display_name: displayName || 'حبيبي'
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    localStorage.setItem('mawah_last_room_id', row.room_id);
    localStorage.setItem('mawah_last_invite_code', row.invite_code);
    return row;
}

export async function joinRoomByCode(inviteCode, displayName) {
    const { data, error } = await supabase.rpc('join_mawah_room', {
        p_invite_code: inviteCode,
        p_display_name: displayName || 'جوري'
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    localStorage.setItem('mawah_last_room_id', row.room_id);
    localStorage.setItem('mawah_last_invite_code', row.invite_code);
    return row;
}

export async function fetchRoomDetails(roomId) {
    const [roomRes, membersRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).single(),
        supabase.from('room_members').select('*').eq('room_id', roomId).order('joined_at', { ascending: true })
    ]);
    if (roomRes.error) throw roomRes.error;
    if (membersRes.error) throw membersRes.error;
    return { room: roomRes.data, members: membersRes.data || [] };
}

export async function updateRelationshipStartDate(roomId, dateStr) {
    const { error } = await supabase
        .from('rooms')
        .update({ relationship_start_date: dateStr || null })
        .eq('id', roomId);
    if (error) throw error;
}

export async function updateMemberDisplayName(roomId, userId, newName) {
    const { error } = await supabase
        .from('room_members')
        .update({ display_name: newName })
        .eq('room_id', roomId)
        .eq('user_id', userId);
    if (error) throw error;
}
