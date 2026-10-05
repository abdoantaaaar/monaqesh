# Monaqesh Academic Portal

React + TanStack Start + TypeScript، متصل بباك إند FastAPI في `../backend`.

من هذا المجلد:

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

اتبع `../README.md` لتجهيز الباك إند والداتابيز والحسابات. عنوان API الافتراضي `http://127.0.0.1:8000`، ويمكن تغييره في `.env` طبقًا لـ`.env.example`.

كود الاتصال في `src/services`، والشاشات في `src/features/monaqesh`. تم استبدال البيانات الوهمية ببيانات من الداتابيز. جلسة المتصفح تحفظ التوكنات فقط؛ بيانات المواد والدرجات والتيمات تُحمّل من الخادم.

```bash
npm test
npx tsc --noEmit
npm run build
npm run preview -- --host 127.0.0.1 --port 5173
```

الـBuild يستخدم TanStack Start وناتج السيرفر، وليس صفحة HTML ثابتة فقط. لم يُطلب نشر المشروع على استضافة في هذه المهمة.
