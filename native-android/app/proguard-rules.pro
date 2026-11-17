# KNOUX Crypt — ProGuard/R8 Rules
# Keep all crypto/security classes intact
-keep class com.knoux.crypt.security.** { *; }
-keep class com.knoux.crypt.data.** { *; }
-keep class com.knoux.crypt.autofill.** { *; }

# Keep Compose
-keep class androidx.compose.** { *; }
-keep class androidx.navigation.** { *; }

# Keep Room entities and DAOs
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }

# Keep Keystore-related classes
-keep class android.security.keystore.** { *; }

# Keep Argon2id native JNI
-keep class de.mkammerer.** { *; }
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep Biometric
-keep class androidx.biometric.** { *; }

# Keep ZXing
-keep class com.google.zxing.** { *; }

# Keep Bouncy Castle
-keep class org.bouncycastle.** { *; }

# Bouncy Castle references javax.naming which is not available on Android.
# These LDAP cert store classes are never used (no LDAP directory on Android).
-dontwarn javax.naming.**
-dontwarn javax.naming.directory.**

# Keep Kotlin serialization
-keep class kotlinx.serialization.** { *; }
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Compose specific
-keep class com.knoux.crypt.ui.** { *; }
-keep class com.knoux.crypt.design.** { *; }
-keep class com.knoux.crypt.Catalog { *; }
-keep class com.knoux.crypt.AppContainer { *; }
-keep class com.knoux.crypt.KnouxApplication { *; }
-keep class com.knoux.crypt.MainActivity { *; }

# Keep enum values
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

# Keep line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile