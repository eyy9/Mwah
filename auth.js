import { supabase } from './supabase.js';

export async function ensureSignedIn() {
    if (!supabase) throw new Error('Supabase غير مهيأ');

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw sessionErr;

    if (sessionData?.session?.user) {
        return sessionData.session.user;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    return data.user;
}

export function getSavedDisplayName() {
    return localStorage.getItem('mawah_display_name') || '';
}

export function saveDisplayName(name) {
    const clean = (name || '').trim().slice(0, 24);
    if (clean) localStorage.setItem('mawah_display_name', clean);
    return clean || 'شريك';
}
