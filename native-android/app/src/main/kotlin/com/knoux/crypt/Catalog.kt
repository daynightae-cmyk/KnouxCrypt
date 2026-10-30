package com.knoux.crypt

import com.knoux.crypt.design.ServiceArt

enum class ServiceStatus { IMPLEMENTED, DESIGN_ONLY, BLOCKED }

/**
 * The accepted 34-destination Tools catalog. A route is only attached to a
 * destination with real code; everything else opens an explicit design-only
 * screen and never simulates an operation.
 */
data class ServiceDef(
    val id: String,
    val titleEn: String,
    val titleAr: String,
    val descEn: String,
    val descAr: String,
    val art: ServiceArt,
    val route: String?,
    val status: ServiceStatus,
    val requiresUnlock: Boolean,
)

data class ToolGroupDef(
    val id: String,
    val titleEn: String,
    val titleAr: String,
    val ids: List<String>,
)

object Catalog {
    val essentials: List<ServiceDef> = listOf(
        ServiceDef("ENCRYPT", "Encrypt Files", "تشفير الملفات", "Keep your files private and secure", "احتفظ بملفاتك خاصة وآمنة", ServiceArt.ENCRYPT, "file_cipher", ServiceStatus.IMPLEMENTED, true),
        ServiceDef("VAULT", "Vault", "الخزنة", "Access your encrypted vault", "الوصول إلى خزنتك المشفرة", ServiceArt.VAULT, null, ServiceStatus.DESIGN_ONLY, true),
        ServiceDef("NOTES", "Secure Notes", "ملاحظات آمنة", "Write. Encrypt. Keep it yours.", "اكتب. شفّر. احتفظ بها لنفسك.", ServiceArt.NOTES, "notes", ServiceStatus.IMPLEMENTED, true),
        ServiceDef("PASSWORDS", "Passwords", "كلمات المرور", "Store and manage your passwords", "خزّن وأدر كلمات مرورك", ServiceArt.PASSWORDS, "passwords", ServiceStatus.IMPLEMENTED, true),
        ServiceDef("KEY_FORGE", "Key Forge", "مصنع المفاتيح", "Generate and manage encryption keys", "أنشئ وأدر مفاتيح التشفير", ServiceArt.KEY, "key_forge", ServiceStatus.IMPLEMENTED, true),
        ServiceDef("AUTHENTICATOR", "Authenticator", "المصادقة", "2FA codes, always with you", "رموز التحقق دائمًا معك", ServiceArt.AUTHENTICATOR, "authenticator", ServiceStatus.IMPLEMENTED, true),
        ServiceDef("PRIVACY", "Privacy Center", "مركز الخصوصية", "Control your privacy & security", "تحكّم بخصوصيتك وأمانك", ServiceArt.PRIVACY, "privacy", ServiceStatus.IMPLEMENTED, false),
        ServiceDef("BACKUP", "Recovery", "الاستعادة", "Back up and restore access", "أنشئ نسخة واستعد الوصول", ServiceArt.RECOVERY, "recovery", ServiceStatus.BLOCKED, true),
    )

    val extras: List<ServiceDef> = listOf(
        ServiceDef("SIGNATURE", "Signature Verification", "التحقق من التوقيع", "Verify signatures with installed keys", "تحقق من التوقيعات بالمفاتيح المثبتة", ServiceArt.KEY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("SECURE_SHARE", "Secure Share", "مشاركة آمنة", "Share encrypted packages safely", "شارك حزمًا مشفرة بأمان", ServiceArt.KEY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("INTEGRITY", "Hash & Integrity", "التجزئة والسلامة", "Compute SHA-256 fingerprints", "احسب بصمات SHA-256", ServiceArt.ENCRYPT, "hash", ServiceStatus.IMPLEMENTED, false),
        ServiceDef("TEXT_CIPHER", "Text Cipher", "تشفير النصوص", "Seal text with a passphrase", "شفّر النص بعبارة مرور", ServiceArt.ENCRYPT, "text_cipher", ServiceStatus.IMPLEMENTED, false),
        ServiceDef("CERTIFICATE_INSPECTOR", "Certificate Inspector", "فاحص الشهادات", "Inspect X.509 certificate fields", "افحص حقول شهادات X.509", ServiceArt.KEY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("ARCHIVE", "Archive", "الأرشيف", "Create authenticated encrypted archives", "أنشئ أرشيفات مشفرة موثقة", ServiceArt.ENCRYPT, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("LOCAL_TRANSFER", "Local Transfer", "نقل محلي", "Move sealed packages nearby", "انقل الحزم المختومة قريبًا", ServiceArt.KEY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("FINGERPRINT_VERIFY", "Fingerprint Verify", "تحقق البصمة", "Compare key fingerprints", "قارن بصمات المفاتيح", ServiceArt.KEY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("METADATA_CLEANER", "Metadata Cleaner", "منظف البيانات الوصفية", "Strip metadata before sharing", "أزل البيانات الوصفية قبل المشاركة", ServiceArt.ENCRYPT, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("CLIPBOARD_GUARD", "Clipboard Guard", "حارس الحافظة", "Clear sensitive clipboard content", "امسح محتوى الحافظة الحساس", ServiceArt.PRIVACY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("SECURE_RANDOM", "Secure Random Studio", "مولّد العشوائية الآمن", "Generate audited-source random values", "أنشئ قيمًا عشوائية آمنة", ServiceArt.KEY, "random", ServiceStatus.IMPLEMENTED, false),
        ServiceDef("HMAC_AUTHENTICITY", "HMAC Authenticity Lab", "مختبر HMAC", "Prove message authenticity with HMAC", "أثبت أصالة الرسالة باستخدام HMAC", ServiceArt.KEY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("PUBLIC_KEY_QR", "Public Key QR", "رمز المفتاح العام", "Share a public key as a QR code", "شارك مفتاحًا عامًا كرمز QR", ServiceArt.KEY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("COLLECTIONS", "Collections", "المجموعات", "Group vault items by project", "جمّع عناصر الخزنة حسب المشروع", ServiceArt.VAULT, null, ServiceStatus.DESIGN_ONLY, true),
        ServiceDef("DOCUMENT_VIEWER", "Document Viewer", "عارض المستندات", "Open decrypted documents in memory", "افتح المستندات المفكوكة في الذاكرة", ServiceArt.VAULT, null, ServiceStatus.DESIGN_ONLY, true),
        ServiceDef("PACKAGE_INSPECTOR", "Package Inspector", "فاحص الحزم", "Inspect KNF/KNP headers without keys", "افحص ترويسات KNF/KNP دون مفاتيح", ServiceArt.ENCRYPT, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("AUTOFILL", "Autofill", "الملء التلقائي", "Fill passwords through Android Autofill", "املأ كلمات المرور عبر خدمة أندرويد", ServiceArt.PASSWORDS, null, ServiceStatus.DESIGN_ONLY, true),
        ServiceDef("OFFLINE_ADVISOR", "Offline Security Advisor", "مستشار الأمان دون اتصال", "Review local security posture", "راجع الوضع الأمني المحلي", ServiceArt.PRIVACY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("KEY_DERIVATION", "Key Derivation", "اشتقاق المفاتيح", "Derive keys with a documented KDF", "اشتق المفاتيح بدالة موثقة", ServiceArt.KEY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("SECURITY_ACTIVITY", "Security Activity", "نشاط الأمان", "Review local security events", "راجع أحداث الأمان المحلية", ServiceArt.PRIVACY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("SECRET_CAPSULE", "Expiring Secret Capsule", "كبسولة سرية مؤقتة", "Seal a secret with an expiry label", "اختم سرًا مع تاريخ انتهاء", ServiceArt.KEY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("SESSION_PRIVACY", "Session Privacy", "خصوصية الجلسة", "Control session lock behavior", "تحكّم في قفل الجلسة", ServiceArt.PRIVACY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("FILE_INTEGRITY", "File Integrity", "سلامة الملف", "Check a file against a known hash", "قارن ملفًا ببصمة معروفة", ServiceArt.ENCRYPT, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("SECURE_CLIPBOARD", "Secure Clipboard", "حافظة آمنة", "Time-bound clipboard handling", "تعامل مؤقت مع الحافظة", ServiceArt.PRIVACY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("DEVICE_PAIRING", "Device Pairing", "اقتران الأجهزة", "Pair nearby devices for transfer", "اقرن أجهزة قريبة للنقل", ServiceArt.KEY, null, ServiceStatus.DESIGN_ONLY, false),
        ServiceDef("PASSWORD_AUDIT", "Password Audit", "تدقيق كلمات المرور", "Find reused and weak passwords locally", "اعثر على كلمات مرور ضعيفة محليًا", ServiceArt.PASSWORDS, null, ServiceStatus.DESIGN_ONLY, true),
    )

    val all: List<ServiceDef> = essentials + extras

    val groups: List<ToolGroupDef> = listOf(
        ToolGroupDef("essentials", "Essentials", "الأساسيات", essentials.map { it.id }),
        ToolGroupDef("files", "Files & Vault", "الملفات والخزنة", listOf("INTEGRITY", "TEXT_CIPHER", "ARCHIVE", "METADATA_CLEANER", "COLLECTIONS", "DOCUMENT_VIEWER", "PACKAGE_INSPECTOR", "FILE_INTEGRITY")),
        ToolGroupDef("keys", "Keys & Identity", "المفاتيح والهوية", listOf("SIGNATURE", "CERTIFICATE_INSPECTOR", "FINGERPRINT_VERIFY", "SECURE_RANDOM", "HMAC_AUTHENTICITY", "PUBLIC_KEY_QR", "KEY_DERIVATION", "AUTOFILL", "PASSWORD_AUDIT")),
        ToolGroupDef("privacy", "Privacy & Sharing", "الخصوصية والمشاركة", listOf("SECURE_SHARE", "LOCAL_TRANSFER", "CLIPBOARD_GUARD", "OFFLINE_ADVISOR", "SECURITY_ACTIVITY", "SECRET_CAPSULE", "SESSION_PRIVACY", "SECURE_CLIPBOARD", "DEVICE_PAIRING")),
        ToolGroupDef("all", "All tools", "كل الأدوات", all.map { it.id }),
    )

    fun byId(id: String): ServiceDef? = all.firstOrNull { it.id == id }

    fun routeFor(service: ServiceDef): String = service.route ?: "tool/${service.id}"

    fun title(service: ServiceDef, language: String): String =
        if (language == "ar") service.titleAr else service.titleEn

    fun description(service: ServiceDef, language: String): String =
        if (language == "ar") service.descAr else service.descEn
}
