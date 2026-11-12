export function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function isStandalonePWA() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export async function requestMawahNotificationPermission() {
    if (!('Notification' in window)) {
        if (isIOS() && !isStandalonePWA()) {
            return {
                ok: false,
                reason: 'على الآيفون: أضف التطبيق إلى الشاشة الرئيسية أولاً من Safari لتفعيل الإشعارات.'
            };
        }
        return { ok: false, reason: 'متصفحك الحالي لا يدعم إشعارات الويب.' };
    }

    if (Notification.permission === 'granted') {
        return { ok: true };
    }

    const result = await Notification.requestPermission();
    if (result === 'granted') {
        return { ok: true };
    }
    return { ok: false, reason: 'لم يتم منح إذن الإشعارات من إعدادات الجهاز.' };
}

export function triggerLocalNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;

    try {
        new Notification(title, {
            body,
            icon: './icons/icon-192.png',
            badge: './icons/icon-192.png'
        });
    } catch (err) {
        console.warn('Notification display skipped:', err);
    }
}
