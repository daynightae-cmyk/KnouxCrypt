"""Static source-boundary checks only. Does not compile Kotlin or test security."""
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
manifest = ET.parse(root / "app/src/main/AndroidManifest.xml").getroot()
assert not manifest.findall("uses-permission"), "No runtime capabilities granted yet"
ns = "{http://schemas.android.com/apk/res/android}"
application = manifest.find("application")
assert application.get(ns + "allowBackup") == "false"
assert application.get(ns + "usesCleartextTraffic") == "false"
english = {node.get("name") for node in ET.parse(root / "app/src/main/res/values/strings.xml").getroot()}
arabic = {node.get("name") for node in ET.parse(root / "app/src/main/res/values-ar/strings.xml").getroot()}
assert english == arabic
sources = list(root.rglob("*.kt"))
for path in sources:
    text = path.read_text()
    assert not any(term in text for term in ("android.webkit", "WebView(", "console.log", "printStackTrace(")), path
policy = (root / "core/security/src/main/kotlin/com/knoux/crypt/security/SessionPolicy.kt").read_text()
assert "fun canReadSecrets(): Boolean = false" in policy
assert "if (!debugPreviewAllowed) return false" in policy
activity = (root / "app/src/main/java/com/knoux/crypt/MainActivity.kt").read_text()
assert "if (BuildConfig.DEBUG)" in activity and "preview && BuildConfig.DEBUG" in activity
assert "override fun onStop()" in activity and "model.lock()" in activity
codec = (root / "core/security/src/main/kotlin/com/knoux/crypt/security/AuthenticatedEnvelope.kt").read_text()
assert codec.count("cipher.updateAAD(header)") == 2
assert "AES/GCM/NoPadding" in codec and "random.nextBytes(it)" in codec
assert "MAX_PLAINTEXT_BYTES" in codec and "Unsupported version or algorithm" in codec
assert not any("src/core/crypto" in path.read_text() for path in sources)
print(f"SOURCE CHECK ONLY: {len(sources)} Kotlin files; permission-free manifest, bilingual keys, release preview guard, closed secret gate, AEAD framing present. Kotlin/JVM/device tests NOT run by this script.")
