import { SUPABASE_CONFIG } from './config.js';

export function isSupabaseConfigured() {
    return (
        SUPABASE_CONFIG.url &&
        SUPABASE_CONFIG.url.startsWith('https://') &&
        SUPABASE_CONFIG.publishableKey &&
        !SUPABASE_CONFIG.publishableKey.includes('YOUR_SUPABASE')
    );
}

export const supabase = isSupabaseConfigured()
    ? window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
          auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: false
          },
          realtime: {
              params: { eventsPerSecond: 20 }
          }
      })
    : null;

export function mapArabicError(error) {
    console.error('[Mawah Technical Error]:', error);
    const msg = (error?.message || String(error || '')).toUpperCase();

    if (!navigator.onLine || msg.includes('FAILED TO FETCH') || msg.includes('NETWORK')) {
        return 'انقطع الاتصال بالإنترنت، تحقق من الشبكة وحاول مجدداً.';
    }
    if (msg.includes('INVALID_CODE')) {
        return 'رمز الدعوة غير صحيح، تأكد من الحروف وأعد المحاولة.';
    }
    if (msg.includes('ROOM_FULL')) {
        return 'عذراً، هذه المساحة مكتملة ومخصصة لشخصين فقط 💗';
    }
    if (msg.includes('NOT_AUTHENTICATED')) {
        return 'تعذر تسجيل الدخول، يرجى إعادة تحميل الصفحة.';
    }
    if (msg.includes('UNAUTHORIZED') || msg.includes('ROW-LEVEL SECURITY') || msg.includes('42501')) {
        return 'ليست لديك صلاحية للوصول إلى هذه المساحة.';
    }
    if (msg.includes('ANONYMOUS')) {
        return 'يرجى تفعيل Anonymous Sign-Ins من إعدادات Authentication في Supabase.';
    }
    return 'حدث خطأ غير متوقع، حاول مرة أخرى بعد لحظات.';
}
