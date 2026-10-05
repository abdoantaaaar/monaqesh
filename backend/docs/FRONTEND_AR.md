# توصيل الفرونت اند

الفرونت المتصل موجود في `../../frontend`؛ هذا الملف مرجع لعقد الـAPI المستخدم في الواجهات. عنوان التطوير الافتراضي `http://127.0.0.1:8000/api`، وتوثيق العقد الكامل في Swagger و`openapi.json`.

## تسجيل الدخول

أرسل `POST /auth/login` بجسم JSON:

```json
{"identifier": "2301141@rst.edu.eg", "password": "2301141@sis"}
```

الرد يحتوي `access_token` و`refresh_token` و`expires_in`. أرسل التوكن في كل طلب محمي:

```http
Authorization: Bearer ACCESS_TOKEN
```

استدعِ `GET /auth/me` لمعرفة `role` والتوجيه للوحة المناسبة. لا ترسل role في طلب الدخول ولا تحدد صلاحيات المستخدم في الفرونت اند. إخفاء زر حسب الصلاحية يساعد العرض، لكن الخادم يتحقق مرة ثانية.

عند انتهاء Access Token استخدم `POST /auth/refresh` بجسم `{"refresh_token":"..."}`، واحفظ **التوكنين الجديدين**. نفذ refresh واحدًا في الوقت نفسه، واجعل بقية الطلبات تنتظر نتيجته؛ إعادة استخدام refresh قديم تلغي الجلسة. إذا أعاد refresh خطأ 401 انتقل لشاشة الدخول. احتفظ بالتوكنات في الذاكرة في تجربة التطوير؛ التصميم هنا لا يضبط cookies. قبل اختيار تسجيل دخول دائم في المتصفح يمكن تحويل refresh إلى cookie آمنة HttpOnly مع إعدادات CSRF المناسبة.

الخروج: `POST /auth/logout` مع Authorization وrefresh_token، ثم امسح التوكنات من الواجهة. `POST /auth/logout-all` يلغي كل جلسات المستخدم. تغيير كلمة المرور يلغيها أيضًا.

## البيانات اللازمة للشاشات

| الشاشة أو الفعل | الطلب |
|---|---|
| مقرراتي لكل دور | GET `/courses` |
| مواد يمكن للطالب تسجيلها | GET `/courses/catalog` |
| تسجيل المادة | POST `/courses/{course_id}/enroll` |
| Drop | DELETE `/courses/{course_id}/enroll` |
| صفحة المادة وأقسامها وصلاحيات المستخدم | GET `/courses/{course_id}` |
| بحث عن معيد للدكتور | GET `/courses/ta-candidates?q=...` |
| ربط المعيد بالمادة | POST `/courses/{course_id}/tas` |
| قائمة الطلاب للدكتور والمعيد | GET `/courses/{course_id}/students` |
| إعطاء الطالب إذن إنشاء فريق | PATCH `/courses/{course_id}/students/{student_id}/leader` |
| شاشة مشروع الطالب | GET `/courses/{course_id}/project` |
| Create Team | POST `/courses/{course_id}/teams` |
| Join Team | POST `/courses/{course_id}/teams/join` |
| فرق المادة للطاقم | GET `/courses/{course_id}/teams` |
| تفاصيل فريق مصرح به | GET `/courses/{course_id}/teams/{team_id}` |
| درجات الطالب المنشورة | GET `/courses/{course_id}/my-grades` |
| الدرجات والمتوسط للطاقم | GET `/courses/{course_id}/assessments/{assessment_id}/grades` |
| إدخال درجة | PUT `/courses/{course_id}/assessments/{assessment_id}/grades/{student_id}` |
| نشر مجموعة درجات للدكتور | POST `/courses/{course_id}/assessments/{assessment_id}/publish` |
| مسودات وملفات المشروع | GET أو POST `/courses/{course_id}/teams/{team_id}/submissions` |
| رفع ملف | PUT `.../submissions/{submission_id}/files/{kind}` |
| تأكيد النسخة النهائية | POST `.../submissions/{submission_id}/finalize` |
| تقرير المناقشة | GET أو POST `/courses/{course_id}/teams/{team_id}/reports` |

في شاشة Project استخدم `can_create_team` و`can_join_team` و`is_team_leader` كما يعيدها الخادم. إن كانت `team` موجودة اعرض أعضاءها ومعلوماتها؛ يظهر `join_code` للقائد فقط. لا ترسل أعضاء وهميين عند Create؛ ينضم كل عضو بحسابه والكود.

## رفع الملفات وتنزيلها

استخدم `FormData` بحقل واحد اسمه `file`. لا تضع `Content-Type` يدويًا؛ المتصفح يضيف multipart boundary:

```javascript
const body = new FormData();
body.append("file", selectedFile);
const response = await fetch(`${api}/courses/${courseId}/teams/${teamId}/submissions/${submissionId}/files/source_code`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${accessToken}` },
  body,
});
```

التنزيل محمي أيضًا. اجلب `.../submissions/{submission_id}/files/{file_id}/download` بتوكن المستخدم، وحول الرد إلى Blob. رابط مباشر في `<a>` لن يرسل Bearer Token تلقائيًا. لا تعرض `storage/` كملفات عامة.

## حالات الردود

| الحالة | المعنى |
|---|---|
| 401 | دخول غير صحيح، جلسة منتهية أو ملغاة |
| 403 | الدور أو صلاحية المادة أو العضوية لا يسمح بالفعل |
| 404 | مورد غير موجود في المسار المطلوب أو كود غير صالح |
| 409 | تعارض، مثل عضوية سابقة أو فريق كامل أو نسخة مقفلة |
| 413 | حجم ملف أو طلب أكبر من الحد |
| 422 | بيانات غير صحيحة أو ملفات مطلوبة ناقصة |
| 429 | محاولات كثيرة؛ انتظر Retry-After |
| 503 | مشكلة اتصال أو عملية بقاعدة البيانات |

طلبات JSON تعيد رسالة في `detail`؛ أخطاء التحقق الافتراضية في FastAPI قد تعيد قائمة داخل `detail`. اضبط `CORS_ORIGINS` في `.env` على عنوان الفرونت اند الحقيقي. درجات Decimal تُعرض غالبًا كنصوص JSON للحفاظ على الدقة، مثل `"85.00"`؛ حولها لرقم في العرض عند الحاجة فقط.
