# Monaqesh FastAPI Backend

اتبع دليل `../README.md` لتشغيل المشروع الكامل باستخدام Conda وNeon.

- Python 3.12، FastAPI، SQLAlchemy، Psycopg وAlembic.
- `python setup_env.py` يجهز `.env` من رابط Neon؛ `--local` يستخدم SQLite.
- `python -m alembic upgrade head` ينشئ 14 جدولًا للمشروع وجدول تتبع Alembic.
- `python -m app.cli seed-demo` يضيف حسابات `@rst.edu.eg` وباسورد `ID@sis` للتطوير.
- `python -m uvicorn app.main:app --reload` يشغل API.
- الحسابات الموجودة لا يُعاد ضبطها تلقائيًا، ولا يوجد Register عام.
- `python -m app.cli create-user --id 2026001 --email 2026001@rst.edu.eg --name Ahmed --role student` يضيف حسابًا بكلمة مرور تختارها.
- الاستيراد: `python -m app.cli import-users users.csv`، والأعمدة: university_id,email,name,role,password.

الأدوار: professor، ta، student. تخزين الباسورد Argon2 Hash. دخول وتجديد جلسات وصلاحيات لكل مادة ورفع ملفات خاصة وقفل نهائي وتقارير يدوية ودرجات منشورة وسجل عمليات.

الجداول نفسها لم تتغير عن النسخة السابقة؛ الربط أضاف بيانات عرض إلى Course Details وقائمة الطلاب مثل صلاحية إنشاء التيم. AI والمواعيد والمناقشة الحية مؤجلة.
