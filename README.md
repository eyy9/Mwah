# Mawah – مواح 💗

مكان إلنا نحن الاثنين — تطبيق ويب للرسم والتواصل بين شخصين.

## إعداد التطبيق الحالي

1. اضبط رابط Supabase ومفتاح publishableKey في config.js.
2. تأكد أن جدول public.messages موجود ويحتوي الأعمدة التي يستخدمها التطبيق: id, room_code, sender, content, وcreated_at. يجب أن تسمح سياسات RLS بالقراءة والإضافة للمستخدمين الفعليين في التطبيق.
3. بعد إنشاء الجدول، شغّل realtime.sql مرة واحدة في Supabase SQL Editor لإضافته إلى publication المسماة supabase_realtime. هذا الملف لا ينشئ الجدول ولا يغير سياسات RLS.
4. انشر الملفات على Netlify.

> ملاحظة: functions.sql وpolicies.sql يستندان إلى مخطط أحدث يستخدم room_id وsender_id وعضوية الغرف، ولا يطابقان واجهة app.js الحالية التي تستخدم room_code وsender. لا تشغّلهما على قاعدة البيانات الحالية قبل توحيد المخطط والسياسات. لا يوجد حالياً ملف database/schema.sql في هذا المستودع.