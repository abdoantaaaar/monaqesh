# التحقق من النسخة المسلّمة

أُجريت الاختبارات على Python 3.12.14 وبإصدارات الحزم المثبتة في `requirements.txt` و`requirements-dev.txt`.

| الفحص | النتيجة |
|---|---|
| اختبارات السيناريوهات | 13 passed على SQLite مؤقتة منفصلة |
| Ruff لفحص الكود | All checks passed |
| Alembic upgrade head | إنشاء الجداول بنجاح على SQLite |
| Alembic check | No new upgrade operations detected |
| PostgreSQL offline migration | توليد SQL بنجاح باستخدام PostgreSQL dialect |
| تشغيل Uvicorn حقيقي عبر HTTP | health وdatabase health والدخول وme ناجحة |
| إنشاء حسابات التجربة مرتين | 6 حسابات في الأولى، و0 في الثانية دون استبدال كلمات المرور |
| عقد OpenAPI | 37 مسارًا و46 عملية HTTP، يشمل health |

تشمل الاختبارات الدخول بالرقم والبريد، عدم وجود تسجيل حساب عام، حظر الحساب بعد المحاولات الفاشلة، إلغاء الجلسة عند إعادة استخدام refresh قديم، وتغيير كلمة المرور وإلغاء الجلسات. تشمل أيضًا عزل الدكتور والمعيد حسب المادة، عدم عرض درجات الآخرين، منع المعيد من النشر، تعيين قائد الفريق، سعة الفريق وعضوية مادة واحدة، منع استخدام كود مادة أخرى، رفع الملفات وقفلها، تنزيلًا محميًا، رفض ZIP بمسار ضار وملفات غير صالحة أو كبيرة، وإصدارات التقرير ومنع نشر التقرير غير المكتمل.

ظهر تحذير إهمال من Starlette عند استخدام httpx في TestClient؛ الاختبارات مكتملة وناجحة. httpx dependency للاختبارات فقط، وليس لتشغيل الباك اند.

**لم يُجرَ اتصال فعلي بقاعدة Neon أو اختبار تزامن على خادم PostgreSQL.** SQL المرجعي تم توليده دون اتصال. عند تجهيز Neon نفذ migration وفحص `/health/database` وتجربة السيناريو. SQLite لا تختبر `SELECT FOR UPDATE`؛ ضمان التزامن يعتمد على PostgreSQL وأقفال صف المقرر المستخدمة في الكود.

يمكن تشغيل نفس الاختبارات على قاعدة PostgreSQL اختبار منفصلة:

```powershell
$env:TEST_DATABASE_URL = "postgresql+psycopg://USER:PASSWORD@HOST/monaqesh_test?sslmode=require"
.venv\Scripts\python.exe -m pytest -q
Remove-Item Env:TEST_DATABASE_URL
```

الاختبارات تحذف جداول **قاعدة الاختبار** وتعيد إنشاءها. لا تستخدم قاعدة عمل أو قاعدة تحتوي بياناتك. الاسم يجب أن ينتهي بـ`_test`، والاختبارات الافتراضية لا تلمس `DATABASE_URL` الخاصة بالتطبيق.
