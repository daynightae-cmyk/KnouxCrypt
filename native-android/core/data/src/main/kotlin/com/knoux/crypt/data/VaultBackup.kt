package com.knoux.crypt.data

import com.knoux.crypt.security.Argon2idParameters
import com.knoux.crypt.security.PassphraseEnvelope
import java.security.GeneralSecurityException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * Portable, encrypted vault-data backup (KNP2 / Argon2id wrapper).
 *
 * Scope: small typed vault records (notes, passwords, TOTP). Portable files,
 * media, the Android Keystore master key and the biometric gate are NOT in the
 * backup. Restoring into a fresh device requires setting up a new gate first;
 * it does not restore the old gate. Key rotation (TASK 31) remains open.
 *
 * The backup is a KNP2 envelope whose plaintext is a strict JSON manifest.
 * Import refuses conflicts and inserts every record in one Room transaction,
 * so a failure cannot partially overwrite the vault.
 */
class VaultBackupManager(
    private val dao: SecretDao,
    private val session: SessionManager,
    private val keys: VaultKeyManager,
    private val parameters: Argon2idParameters = Argon2idParameters.DEFAULT,
    private val envelope: PassphraseEnvelope = PassphraseEnvelope(),
) {
    companion object {
        const val FORMAT = "KNOUX-BACKUP"
        const val FORMAT_VERSION = 1
        const val MAX_BACKUP_BYTES = 2 * 1024 * 1024
        const val MAX_RECORDS = 10_000
        const val MAX_ID_CHARS = 128
        private val CONTEXT = "knoux.backup.v1".toByteArray(Charsets.UTF_8)
        private val SUPPORTED = setOf(SecretKinds.NOTE, SecretKinds.PASSWORD, SecretKinds.TOTP)
        private val JSON = Json {
            encodeDefaults = true
            ignoreUnknownKeys = false
        }
    }

    @Serializable
    data class Manifest(
        val format: String = FORMAT,
        val version: Int = FORMAT_VERSION,
        val createdAt: Long,
        val records: List<Record>,
    )

    @Serializable
    data class Record(
        val id: String,
        val kind: String,
        val payload: String,
        val updatedAt: Long,
    )

    data class Preview(
        val createdAt: Long,
        val total: Int,
        val counts: Map<String, Int>,
        val conflicts: Int,
    )

    /** Seals the selected record kinds. Fails whole rather than omitting an unreadable row. */
    suspend fun export(
        access: VaultAccess,
        passphrase: CharArray,
        kinds: Set<String> = SUPPORTED,
    ): ByteArray = withContext(Dispatchers.IO) {
        require(passphrase.isNotEmpty()) { "Empty passphrase" }
        require(kinds.isNotEmpty()) { "Select at least one section" }
        require(kinds.all { it in SUPPORTED }) { "Unsupported backup section" }
        session.requireValid(access)
        val rows = dao.all().filter { it.kind in kinds }
        if (rows.size > MAX_RECORDS) throw BackupTooLargeException("Too many records for this build")
        val records = rows.map { row ->
            val payload = try {
                val codec = SecretCodec(keys.keyFor(access, row.keyVersion))
                codec.decrypt(row.kind, row.id, row.envelope, row.keyVersion)
            } catch (failure: MissingVaultKeyException) {
                throw BackupUnreadableRecordException(row.id, failure)
            } catch (failure: GeneralSecurityException) {
                throw BackupUnreadableRecordException(row.id, failure)
            } catch (failure: IllegalArgumentException) {
                throw BackupUnreadableRecordException(row.id, failure)
            }
            Record(row.id, row.kind, payload, row.updatedAt)
        }
        session.requireValid(access)
        val manifest = Manifest(createdAt = System.currentTimeMillis(), records = records)
        val plaintext = JSON.encodeToString(Manifest.serializer(), manifest).toByteArray(Charsets.UTF_8)
        if (plaintext.size > PassphraseEnvelope.MAX_PLAINTEXT_BYTES) {
            plaintext.fill(0)
            throw BackupTooLargeException("Vault data exceeds the current backup limit")
        }
        val sealed = envelope.seal(plaintext, passphrase, CONTEXT, parameters)
        plaintext.fill(0)
        // A lock during Argon2id must abort the export before the caller writes a file.
        session.requireValid(access)
        sealed
    }

    /** Reads and validates the manifest, counts conflicts, and returns no plaintext. */
    suspend fun preview(
        access: VaultAccess,
        sealed: ByteArray,
        passphrase: CharArray,
        kinds: Set<String> = SUPPORTED,
    ): Preview = withContext(Dispatchers.IO) {
        session.requireValid(access)
        val manifest = openManifest(sealed, passphrase)
        val filtered = manifest.records.filter { it.kind in kinds }
        val existing = dao.ids().toSet()
        val conflicts = filtered.count { it.id in existing }
        session.requireValid(access)
        Preview(
            createdAt = manifest.createdAt,
            total = filtered.size,
            counts = filtered.groupingBy { it.kind }.eachCount(),
            conflicts = conflicts,
        )
    }

    /**
     * Restores all selected records or none. Conflicts abort the single Room
     * transaction; existing records are never overwritten by this version.
     */
    suspend fun restore(
        access: VaultAccess,
        sealed: ByteArray,
        passphrase: CharArray,
        kinds: Set<String> = SUPPORTED,
    ): Int = withContext(Dispatchers.IO) {
        session.requireValid(access)
        if (sealed.size > MAX_BACKUP_BYTES) throw BackupInvalidException("Backup file is too large")
        val manifest = openManifest(sealed, passphrase)
        val filtered = manifest.records.filter { it.kind in kinds }
        val existing = dao.ids().toSet()
        val conflicts = filtered.count { it.id in existing }
        if (conflicts > 0) throw BackupConflictException(conflicts)
        if (filtered.isEmpty()) return@withContext 0
        session.withAuthorizedMutation(access) {
            val keyVersion = keys.activeVersion(access)
            val codec = SecretCodec(keys.keyFor(access, keyVersion))
            val now = System.currentTimeMillis()
            val entities = filtered.map { record ->
                SecretEntity(
                    id = record.id,
                    kind = record.kind,
                    envelope = codec.encrypt(record.kind, record.id, record.payload, keyVersion),
                    updatedAt = if (record.updatedAt > 0) record.updatedAt else now,
                    keyVersion = keyVersion,
                )
            }
            try {
                dao.insertAll(entities)
            } catch (failure: Exception) {
                val message = failure.message.orEmpty()
                if (message.contains("UNIQUE", ignoreCase = true) || message.contains("constraint", ignoreCase = true)) {
                    throw BackupConflictException(1, failure)
                }
                throw BackupInvalidException("Restore failed; the transaction was rolled back", failure)
            }
            entities.size
        }
    }

    private fun openManifest(sealed: ByteArray, passphrase: CharArray): Manifest {
        if (sealed.size > MAX_BACKUP_BYTES) throw BackupInvalidException("Backup file is too large")
        val plaintext = try {
            envelope.open(sealed, passphrase, CONTEXT)
        } catch (failure: GeneralSecurityException) {
            throw BackupInvalidException("Wrong recovery passphrase or corrupted backup", failure)
        } catch (failure: IllegalArgumentException) {
            throw BackupInvalidException("Not a KNOUX backup envelope", failure)
        } catch (failure: IllegalStateException) {
            throw BackupInvalidException(failure.message ?: "The backup cost is not supported", failure)
        }
        val manifest = try {
            JSON.decodeFromString(Manifest.serializer(), String(plaintext, Charsets.UTF_8))
        } catch (failure: SerializationException) {
            throw BackupInvalidException("Backup manifest is invalid", failure)
        } finally {
            plaintext.fill(0)
        }
        validate(manifest)
        return manifest
    }

    private fun validate(manifest: Manifest) {
        if (manifest.format != FORMAT || manifest.version != FORMAT_VERSION) {
            throw BackupInvalidException("Unsupported backup format/version")
        }
        if (manifest.records.size > MAX_RECORDS) throw BackupTooLargeException("Too many records")
        val seen = HashSet<String>(manifest.records.size)
        manifest.records.forEach { record ->
            if (record.id.isBlank() || record.id.length > MAX_ID_CHARS) {
                throw BackupInvalidException("Invalid record identity")
            }
            if (record.kind !in SUPPORTED) throw BackupUnsupportedKindException(record.kind)
            if (!seen.add(record.id)) throw BackupInvalidException("Duplicate record identity")
            if (record.payload.toByteArray(Charsets.UTF_8).size > PassphraseEnvelope.MAX_PLAINTEXT_BYTES) {
                throw BackupInvalidException("Record payload is too large")
            }
            val typed = when (record.kind) {
                SecretKinds.NOTE -> SecretsJson.decodeNote(record.payload)
                SecretKinds.PASSWORD -> SecretsJson.decodePassword(record.payload)
                SecretKinds.TOTP -> SecretsJson.decodeTotp(record.payload)
                else -> null
            }
            if (typed == null) throw BackupInvalidException("Record payload does not match its kind")
        }
    }
}

class BackupInvalidException(message: String, cause: Throwable? = null) : Exception(message, cause)
class BackupTooLargeException(message: String) : Exception(message)
class BackupConflictException(val conflicts: Int, cause: Throwable? = null) :
    Exception("$conflicts backup record(s) conflict with this vault; nothing was imported", cause)
class BackupUnsupportedKindException(kind: String) : Exception("Unsupported record kind: $kind")
class BackupUnreadableRecordException(id: String, cause: Throwable) :
    Exception("Record $id could not be decrypted; the backup was not created", cause)
