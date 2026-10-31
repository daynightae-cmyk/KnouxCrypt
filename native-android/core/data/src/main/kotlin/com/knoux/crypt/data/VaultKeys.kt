package com.knoux.crypt.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.knoux.crypt.security.AuthenticatedEnvelope
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.GeneralSecurityException
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.flow.first
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Version 0 is reserved for the original root-key (KNC1) records. */
const val LEGACY_KEY_VERSION: Int = 0

@Serializable
data class RotationJournal(
    val sourceVersion: Int,
    val targetVersion: Int,
    val phase: String,
    val createdAt: Long,
    val updatedAt: Long,
    val totalRows: Int = 0,
)

object RotationPhases {
    const val PREPARED = "PREPARED"
    const val MIGRATING = "MIGRATING"
    const val VERIFYING = "VERIFYING"
    const val CUTOVER = "CUTOVER"
    const val CLEANUP = "CLEANUP"
}

/** Non-secret key metadata plus wrapped DEK material; never the raw DEK. */
interface VaultKeyRegistry {
    suspend fun activeVersion(): Int
    suspend fun setActiveVersion(version: Int)
    suspend fun wrappedKey(version: Int): ByteArray?
    suspend fun storeWrappedKey(version: Int, blob: ByteArray)
    suspend fun removeWrappedKey(version: Int)
    suspend fun versions(): List<Int>
    suspend fun rotationJournal(): RotationJournal?
    suspend fun setRotationJournal(journal: RotationJournal?)
}

class MissingVaultKeyException(
    val version: Int,
    message: String = "Vault key version $version is missing or cannot be unwrapped",
    cause: Throwable? = null,
) : Exception(message, cause)

class VaultKeyInconsistentException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Wraps a random 256-bit data-encryption key (DEK) with the non-exportable
 * Android Keystore root key. KDK1 binds the key version and authenticates the
 * wrapper with AES-256-GCM. The root alias itself is never replaced.
 */
class DataKeyWrapper {
    companion object {
        const val DEK_BYTES = 32
        private const val NONCE_BYTES = 12
        private const val TAG_BYTES = 16
        private const val HEADER_BYTES = 4 + 1 + 4
        private val MAGIC = byteArrayOf(0x4b, 0x44, 0x4b, 0x31) // KDK1
        private val CONTEXT = "knoux:dek-wrap:v1".toByteArray(Charsets.UTF_8)
    }

    fun wrap(root: SecretKey, version: Int, dek: SecretKey): ByteArray {
        require(version > 0) { "Only positive DEK versions can be wrapped" }
        val raw = dek.encoded ?: throw IllegalArgumentException("DEK must be exportable for wrapping")
        require(raw.size == DEK_BYTES) { "DEK must be 256-bit" }
        try {
            // Android Keystore keys with randomized encryption required reject
            // caller-supplied encryption IVs. Let the provider generate it and
            // persist Cipher.iv in the KDK1 layout.
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, root)
            val nonce = cipher.iv ?: throw GeneralSecurityException("Provider did not supply a GCM IV")
            require(nonce.size == NONCE_BYTES) { "Unexpected GCM IV length" }
            val header = ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.BIG_ENDIAN)
                .put(MAGIC).put(1.toByte()).putInt(version).array()
            cipher.updateAAD(header)
            cipher.updateAAD(CONTEXT)
            return header + nonce + cipher.doFinal(raw)
        } finally {
            raw.fill(0)
        }
    }

    fun unwrap(root: SecretKey, expectedVersion: Int, blob: ByteArray): SecretKey {
        require(expectedVersion > 0) { "Invalid DEK version" }
        require(blob.size == HEADER_BYTES + NONCE_BYTES + DEK_BYTES + TAG_BYTES) { "Invalid wrapped key length" }
        val buffer = ByteBuffer.wrap(blob).order(ByteOrder.BIG_ENDIAN)
        val magic = ByteArray(4).also(buffer::get)
        require(magic.contentEquals(MAGIC)) { "Not a wrapped vault key" }
        require(buffer.get().toInt() == 1) { "Unsupported wrapped-key version" }
        val storedVersion = buffer.int
        require(storedVersion == expectedVersion) { "Wrapped key version mismatch" }
        val header = blob.copyOfRange(0, HEADER_BYTES)
        val nonce = blob.copyOfRange(HEADER_BYTES, HEADER_BYTES + NONCE_BYTES)
        val plain = try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, root, GCMParameterSpec(TAG_BYTES * 8, nonce))
            cipher.updateAAD(header)
            cipher.updateAAD(CONTEXT)
            cipher.doFinal(blob, HEADER_BYTES + NONCE_BYTES, DEK_BYTES + TAG_BYTES)
        } catch (failure: GeneralSecurityException) {
            throw GeneralSecurityException("Wrapped vault key failed authentication", failure)
        }
        try {
            require(plain.size == DEK_BYTES) { "Invalid DEK length" }
            return SecretKeySpec(plain, "AES")
        } finally {
            plain.fill(0)
        }
    }
}

private val Context.vaultKeyDataStore by preferencesDataStore("knoux_vault_keys")

/** Persists only wrapped DEKs, the active version and the rotation journal. */
class DataStoreVaultKeyRegistry(context: Context) : VaultKeyRegistry {
    companion object {
        private val KEY_ACTIVE = intPreferencesKey("active_version")
        private val KEY_JOURNAL = stringPreferencesKey("rotation_journal")
        private const val WRAPPED_PREFIX = "wrapped_dek_"
        private val JSON = Json { encodeDefaults = true; ignoreUnknownKeys = false }
    }

    private val appContext = context.applicationContext

    override suspend fun activeVersion(): Int =
        appContext.vaultKeyDataStore.data.first()[KEY_ACTIVE] ?: LEGACY_KEY_VERSION

    override suspend fun setActiveVersion(version: Int) {
        require(version >= 0) { "Invalid active key version" }
        appContext.vaultKeyDataStore.edit { it[KEY_ACTIVE] = version }
    }

    override suspend fun wrappedKey(version: Int): ByteArray? {
        if (version <= 0) return null
        val encoded = appContext.vaultKeyDataStore.data.first()[wrappedKeyPreference(version)] ?: return null
        return runCatching { android.util.Base64.decode(encoded, android.util.Base64.NO_WRAP) }.getOrNull()
    }

    override suspend fun storeWrappedKey(version: Int, blob: ByteArray) {
        require(version > 0) { "Only positive versions have wrapped keys" }
        val encoded = android.util.Base64.encodeToString(blob, android.util.Base64.NO_WRAP)
        appContext.vaultKeyDataStore.edit { it[wrappedKeyPreference(version)] = encoded }
    }

    override suspend fun removeWrappedKey(version: Int) {
        if (version <= 0) return
        appContext.vaultKeyDataStore.edit { it.remove(wrappedKeyPreference(version)) }
    }

    override suspend fun versions(): List<Int> {
        val keys = appContext.vaultKeyDataStore.data.first().asMap().keys
        return keys.mapNotNull { preference ->
            preference.name.removePrefix(WRAPPED_PREFIX)
                .takeIf { preference.name.startsWith(WRAPPED_PREFIX) }
                ?.toIntOrNull()
        }.sorted()
    }

    override suspend fun rotationJournal(): RotationJournal? {
        val encoded = appContext.vaultKeyDataStore.data.first()[KEY_JOURNAL] ?: return null
        return try {
            JSON.decodeFromString(RotationJournal.serializer(), encoded)
        } catch (failure: SerializationException) {
            throw VaultKeyInconsistentException("Rotation journal is corrupt", failure)
        }
    }

    override suspend fun setRotationJournal(journal: RotationJournal?) {
        appContext.vaultKeyDataStore.edit {
            if (journal == null) it.remove(KEY_JOURNAL)
            else it[KEY_JOURNAL] = JSON.encodeToString(RotationJournal.serializer(), journal)
        }
    }

    private fun wrappedKeyPreference(version: Int) = stringPreferencesKey("$WRAPPED_PREFIX$version")
}

/**
 * Resolves the key for a record version. Version 0 uses the Keystore root key
 * (legacy records and KNF1 device-key files). Positive versions unwrap the
 * wrapped DEK with the root key. No raw DEK is persisted.
 */
class VaultKeyManager(
    private val session: SessionManager,
    private val registry: VaultKeyRegistry,
    private val wrapper: DataKeyWrapper = DataKeyWrapper(),
) {
    internal suspend fun activeVersion(access: VaultAccess): Int {
        session.requireValid(access)
        return registry.activeVersion()
    }

    internal suspend fun keyFor(access: VaultAccess, version: Int): SecretKey {
        session.requireValid(access)
        if (version == LEGACY_KEY_VERSION) return session.key(access)
        require(version > 0) { "Invalid vault key version" }
        val wrapped = registry.wrappedKey(version)
            ?: throw MissingVaultKeyException(version)
        return try {
            wrapper.unwrap(session.key(access), version, wrapped)
        } catch (failure: GeneralSecurityException) {
            throw MissingVaultKeyException(version, cause = failure)
        } catch (failure: IllegalArgumentException) {
            throw MissingVaultKeyException(version, cause = failure)
        }
    }

    internal suspend fun createDataKey(access: VaultAccess, version: Int, random: SecureRandom = SecureRandom()): SecretKey {
        require(version > 0) { "Data keys start at version 1" }
        session.requireValid(access)
        if (registry.wrappedKey(version) != null) {
            throw VaultKeyInconsistentException("Key version $version already exists")
        }
        val raw = ByteArray(DataKeyWrapper.DEK_BYTES).also(random::nextBytes)
        val dek = SecretKeySpec(raw, "AES")
        raw.fill(0)
        val wrapped = wrapper.wrap(session.key(access), version, dek)
        try {
            registry.storeWrappedKey(version, wrapped)
        } catch (failure: Exception) {
            throw VaultKeyInconsistentException("Could not persist wrapped key $version", failure)
        }
        return dek
    }

    internal suspend fun hasDataKey(access: VaultAccess, version: Int): Boolean {
        session.requireValid(access)
        return version > 0 && registry.wrappedKey(version) != null
    }

    internal suspend fun knownVersions(access: VaultAccess): List<Int> {
        session.requireValid(access)
        return registry.versions()
    }

    /** Only positive DEKs can be removed; the Keystore root alias is permanent. */
    internal suspend fun retireDataKey(access: VaultAccess, version: Int) {
        require(version > 0) { "The Keystore root key is never retired by this operation" }
        session.requireValid(access)
        registry.removeWrappedKey(version)
    }
}
