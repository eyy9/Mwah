# Mawah – مواح 💗
مكان إلنا نحن الاثنين — تطبيق ويب متكامل (PWA) للرسم والتواصل العاطفي اللحظي بين شخصين.

## خطوات التشغيل السريعة
1. افتح لوحة تحكم مشروعك الصحيح في Supabase وتأكد من تطابق رابط المشروع (`Project URL`) مع المفتاح (`Publishable / anon key`).
2. ضع القيمتين داخل ملف `config.js`.
3. فعّل **Anonymous Sign-Ins** من `Authentication -> Providers`.
4. نفّذ ملفات SQL بالترتيب داخل `SQL Editor`:
   - `database/schema.sql`
   - `database/functions.sql`
   - `database/policies.sql`
5. ارفع مجلد المشروع مباشرة إلى **Netlify** (عبر Netlify Drop أو Git).
