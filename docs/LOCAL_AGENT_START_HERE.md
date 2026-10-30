# KNOUX CRYPT — ابدأ هنا أيها الوكيل المحلي

## 1. ما الذي تستلمه فعلًا؟
تطبيق React/Vite واحد، مرور برمجي أول على 44 مهمة، واجهة عربية/إنجليزية، AppShell مستمر بخلفية شيفرات هابطة، شعار أصلي شفاف، صوت اختياري، ومسارات محمّلة حسب الطلب. **ليست هذه شهادة مطابقة بصرية أو أمان أو جهوزية إنتاج.** خدمات الأمان الحديثة معاينات في الذاكرة، لا backend. لا تستخدم التقرير التاريخي FINAL_REVIEW_REPORT كإثبات.

## 2. قبل أي تعديل
```
git status --short
git log -5 --oneline
git branch -av
git worktree list
git stash list
```
اجلب main الحالي وافحص PRs قبل إنشاء فرع. لا تُعد استخراج النسخة الاحتياطية؛ هي نسخة قديمة من مصدر مدمج. لا تحذف worktrees ولا تستخدم force-push/reset لتنظيف العمل. اقرأ `agent-handoff/KNOUX_CRYPT/00_START_HERE.md` و`00_LATEST_OWNER_OVERRIDES.md` ومرجع المهمة الخاصة. Home النهائي هو الشعار القائم بذاته، لا الكرة القديمة.

## 3. التشغيل والفحوص
استخدم إصدار Node الموافق لإعداد المشروع وتوافق الحزم. من جذر المستودع:
```
npm install
npm run dev
npm run check
```
يفتح dev على المنفذ 3000. `npm run check` يشغّل `check:routes` و`check:audio` ثم build. لا يوجد lockfile متتبع حاليًا؛ لا تدّعِ تثبيتًا متطابقًا عبر الأزمنة. أنشئ lockfile معتمدًا بعد تثبيت ومراجعة الاعتماديات محليًا. لا توجد فحوص lint/typecheck شاملة بعد؛ لا تعامل فحص SSR كبديل لها.

## 4. خريطة هندسية
- `src/config/missionRoutes.js`: 44 مهمة وloaders صريحة؛ `screens.js`: مسارات ومعرّفات الخدمات.
- `src/App.jsx`: lazy/Suspense وحدّ أخطاء الشاشة، providers ثابتة خارج تبديل الصفحات.
- `components/shell`: الخلفية المستمرة، الشريط المثبت، الأصوات، التحميل وتقليل الحركة.
- `entry`: Splash/Auth/Guest وشعار العينين. `home`: Home النهائي وTools.
- `security`, `notes`, `passwords`, `authenticator`, `keys`, `privacy`, `recovery`, `share`, `inspectors`, `workflows`, `labs`, `vaulttools`, `devicepreviews`, `advanced`, `finaltools`: مجموعات الشاشات.
- `src/i18n`: catalogue عربي وprovider اللغة. يحتفظ localStorage باللغة فقط، لا أسرار المعاينات.
- `docs/SCREEN*REVIEW.md`: ما اختُبر وما لم يُختبر لكل جولة.
- legacy modern/crypto محفوظة؛ وجود الكود ليس دليل تشفير مدقق. لا تربطها بالواجهة الجديدة دون مراجعة مستقلة.

## 5. الحركة والصوت
الخلفية يجب أن تبقى mounted خارج المسارات؛ لا random/reseed/key على التنقل. النزول positive Y من أعلى viewport إلى أسفله. لا تضع نصوصًا أو مؤثرات فوق قابلية القراءة. لا تستبدل أو تقص أو تشوّه الشعار الأصلي. عدّل طبقات إضاءة العينين بعد مقارنة الفيديو فعليًا؛ الإحداثيات الحالية تحتاج قبولًا بصريًا.
الصوت مكتوم افتراضيًا. اختيار Sound on يفعّل ambience وclick cues معًا؛ Sound off يكتمهما. cues خفيفة، rate-limited، لا تُنشأ على hover/typing أو العناصر disabled، وتستخدم click الذي يدعم التفعيل بلوحة المفاتيح. لا صوت نجاح تشفير/مصادقة. لا autoplay أو microphone/network. visibility يغيّر هدف gain للصمت. الجودة السمعية والصوت على الأجهزة لم تُعتمد.
`interaction.css` إضافي: focus/active/checkbox/caret، skip link، reduced motion عالمي، forced colors. لا تكبّر الصفحة عبر transforms. افحص أثره على تصميم كل شاشة قبل اعتمادها.

## 6. اختبارات يجب تنفيذها في متصفح محلي حقيقي
صور فعلية عند 360×800،390×844،412×915 و1280×800. ابدأ Splash -> Login/Guest -> Home ثم بقية المسارات. قارن كل لقطة مع PNG الخاص بها؛ سجل before/after وأصلح الفروق. لا تستخدم PNG المرجع كدليل تنفيذ.
- عينان مستقلتان والوهج يطابق هندسة الشعار؛ لا إطار/مستطيل معتم ولا globe في Home.
- خلفية لا تنطفئ أو تقفز عند lazy navigation. لا flash أبيض. لا تداخل logo/type/cards/footer.
- العربية والتفافها، RTL، الأسماء التقنية LTR، English، حفظ اللغة، Guest -> label واضح.
- Tab/Enter/Space، skip link، native dialogs/Escape/focus return، inputs والكيبورد الجوال والscroll.
- reduced motion وforced colors والتكبير 200%. راقب motion/frames/performance، لا تدّعِ سلاسة من CSS فقط.
- اختبر audio ON/OFF، مستويات منخفضة، cue/navigation، hidden tab، تكرار الضغط، وسماعات الهاتف. تأكد صمت initial load.
- اختبر dynamic import failure وفشل الشبكة: notice/reload صريح، لا retry loop. التنبيه يوضح أن reload يمسح بيانات الذاكرة.

## 7. الفصل بين الواجهة والخدمات الحقيقية
لا تدخل real secrets في Notes/Passwords/Text/HMAC/Capsule/Audit. QR توضيحي غير encoder؛ random/HMAC/hash placeholders ليست نواتج أمنية؛ OTP مخفي وليس مولّدًا؛ clipboard المتقدم داخلي فقط؛ النسخ/النقل/التدوير/التحقق/backup لا backend لها. لا تغيّر labels إلى Secure/Verified/Delivered دون تنفيذ واختبارات مستقلة.
عند بناء خدمات فعلية، افصل واجهات provider عن UI، راجع threat model وcrypto libraries والاختبارات وعزل الأسرار والمنصة. لا تجمع مفاتيح أو كلمات مرور في logs/localStorage/chat ولا تفترض أن طبقة CSS تمنع screenshots.

## 8. المتبقي قبل قبول نهائي
- المطابقة الفعلية للشاشات 01–44، إصلاح approximate vector/illustrative art، وقياسات متوافقة.
- اختبارات تفاعل قابلة لإعادة التشغيل داخل المستودع بدل الاعتماد على harness مؤقت خارج المشروع.
- اختبار خطأ lazy load، native dialog/focus، load order للـCSS وall route Back targets.
- reproducible dependencies/lockfile، lint/typecheck بعد جرد JS/TS legacy، dependency/security review.
- ضغط أصل الشعار/تحسين تحميله بعد التأكد من تطابق alpha والهندسة؛ لا يوجد ادعاء أن حجم 1.18MB أصبح محسّنًا.
- خدمات أمان فعلية منفصلة إن طلب المالك، لا تسويق demo كحماية.

## 9. التسليم لكل جولة
اذكر SHA/branch/PR وهل دُمج، ملفات التغيير، أوامر ونتائج، صور متصفح حقيقية ومقارنة، الأخطاء المتبقية. `check:routes` يصيّر 44 شاشة في لغتين ويفحص الروابط الظاهرة؛ لا يفحص التفاعل أو dialog-hidden links أو pixel match. `check:audio` mock engine لا يحكم على السمع. نجاح build لا يعني production ready.
