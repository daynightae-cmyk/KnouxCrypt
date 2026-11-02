"""Static source-boundary checks only. Does not compile Kotlin or test security.

Updated for the current native app: the only manifest permission is the runtime
CAMERA grant used by the QR scanner. No storage, network or media permissions are
allowed. The earlier script referenced a removed ``src/main/java`` MainActivity
and a removed preview guard, so it failed before exercising any real invariant.
"""
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
manifest = ET.parse(root / "app/src/main/AndroidManifest.xml").getroot()
ns = "{http://schemas.android.com/apk/res/android}"

permissions = {node.get(ns + "name") for node in manifest.findall("uses-permission")}
assert permissions == {"android.permission.CAMERA"}, (
    f"Unexpected manifest permissions: {sorted(permissions)}; only the runtime QR camera grant is allowed"
)

application = manifest.find("application")
assert application is not None
assert application.get(ns + "allowBackup") == "false"
assert application.get(ns + "usesCleartextTraffic") == "false"
assert application.get(ns + "supportsRtl") == "true"

english = {node.get("name") for node in ET.parse(root / "app/src/main/res/values/strings.xml").getroot()}
arabic = {node.get("name") for node in ET.parse(root / "app/src/main/res/values-ar/strings.xml").getroot()}
assert english == arabic, "English and Arabic string keys diverged"

sources = [
    path for path in root.rglob("*.kt")
    if "build" not in path.parts and ".gradle" not in path.parts and ".kotlin" not in path.parts
]
for path in sources:
    text = path.read_text(encoding="utf-8")
    assert not any(term in text for term in ("android.webkit", "WebView(", "console.log", "printStackTrace(")), path

policy = (root / "core/security/src/main/kotlin/com/knoux/crypt/security/SessionPolicy.kt").read_text()
assert "fun canReadSecrets(): Boolean = false" in policy
assert "if (!debugPreviewAllowed) return false" in policy

activity = (root / "app/src/main/kotlin/com/knoux/crypt/MainActivity.kt").read_text()
assert "override fun onStop()" in activity, "MainActivity must revoke on background"
assert "container.session.lock()" in activity, "MainActivity must lock the real session"
assert "FLAG_SECURE" in activity, "Screen-capture protection missing"
assert "BiometricPrompt" in activity and "CryptoObject" in activity, "Auth-bound biometric prompt missing"

container = (root / "app/src/main/kotlin/com/knoux/crypt/AppContainer.kt").read_text()
assert "securityEvents" in container and "ShadowVaultService" in container
assert "session.addOnLockListener" in container, "Lock-time cleanup wiring missing"

codec = (root / "core/security/src/main/kotlin/com/knoux/crypt/security/AuthenticatedEnvelope.kt").read_text()
assert codec.count("cipher.updateAAD(header)") == 2
assert "AES/GCM/NoPadding" in codec
assert "MAX_PLAINTEXT_BYTES" in codec and "Record too large" in codec and "Invalid record size" in codec

for generated in ("src/core/crypto",):
    assert not any(generated in path.read_text(encoding="utf-8") for path in sources)

print(
    f"SOURCE CHECK ONLY: {len(sources)} Kotlin files; camera-only manifest, "
    "bilingual keys, biometric session gate, lock cleanup, AEAD framing present. "
    "Kotlin/JVM/device tests NOT run by this script."
)