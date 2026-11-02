package com.knoux.crypt.data

import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Ciphertext-at-rest invariant, swept across every secret kind the store supports.
 *
 * The existing boundary tests cover the session, the gate and one or two record
 * kinds. This one is deliberately broad and mechanical: for each kind it writes a
 * payload carrying a unique marker, then proves the marker does not appear in the
 * stored bytes in any encoding, that the record still round-trips (so the sweep
 * cannot pass by writing nothing readable), and that the AAD binding rejects both
 * identity and kind substitution.
 *
 * The kind list is read back from the source file, so declaring a new `const val`
 * without extending the sweep fails this test rather than silently reducing
 * coverage. That is the point: the guard has to degrade loudly.
 */
class CiphertextAtRestInvariantTest {
    private val vault = TestVault()

    /** Marker shape that cannot occur inside legitimate ciphertext by accident. */
    private fun marker(kind: String) = "KN0UX-ATREST-$kind-7z9q"

    private fun storedEnvelope(id: String): ByteArray =
        vault.dao.rows.value.first { it.id == id }.envelope

    private fun sourceDeclaredKinds(): List<String> {
        val source = File(nativeRoot(), "core/data/src/main/kotlin/com/knoux/crypt/data/Secrets.kt")
        assertTrue("expected $source to exist", source.isFile)
        val text = source.readText(Charsets.UTF_8)
        val block = Regex("object SecretKinds \\{([^}]*)\\}").find(text)
            ?: error("SecretKinds object not found in $source")
        return Regex("""const val [A-Z_]+ = "([^"]+)"""")
            .findAll(block.groupValues[1])
            .map { it.groupValues[1] }
            .toList()
    }

    @Test
    fun theDeclaredKindListIsTheSweepList() {
        val declared = sourceDeclaredKinds()
        assertTrue("no kinds parsed from source", declared.isNotEmpty())
        assertEquals(
            "SecretKinds declares a kind that SecretKinds.ALL does not cover, so the " +
                "ciphertext-at-rest sweep silently lost coverage: " +
                (declared - SecretKinds.ALL).joinToString(),
            emptySet<String>(),
            (declared - SecretKinds.ALL).toSet(),
        )
        assertEquals(declared.sorted(), SecretKinds.ALL.sorted())
        assertEquals(declared.size, SecretKinds.ALL.distinct().size)
    }

    @Test
    fun noKindEverPersistsPlaintext() {
        runBlocking { vault.enroll() }
        val access = vault.access() ?: error("vault is locked")
        val repository = vault.repository

        SecretKinds.ALL.forEach { kind ->
            val needle = marker(kind)
            val payload = """{"title":"$needle","body":"$needle","secret":"$needle"}"""
            val id = runBlocking { repository.save(access, kind, null, payload) }
            val stored = storedEnvelope(id)

            val asLatin1 = String(stored, Charsets.ISO_8859_1)
            val asUtf8 = runCatching { String(stored, Charsets.UTF_8) }.getOrDefault("")
            assertFalse("$kind leaked the marker as ISO-8859-1", asLatin1.contains(needle))
            assertFalse("$kind leaked the marker as UTF-8", asUtf8.contains(needle))
            assertFalse(
                "$kind leaked the marker as raw bytes",
                stored.toList().windowed(needle.length).contains(needle.toByteArray().toList()),
            )
            // The record id and kind are the only user-visible identifiers, and the
            // kind is stored in the clear by design as a partition key, never the title.
            val row = vault.dao.rows.value.first { it.id == id }
            assertEquals(kind, row.kind)
            assertFalse(row.envelope.toString(Charsets.UTF_8).contains("title"))
        }
    }

    @Test
    fun everyKindStillRoundTripsSoTheSweepIsNotVacuous() {
        runBlocking { vault.enroll() }
        val access = vault.access() ?: error("vault is locked")
        val repository = vault.repository

        SecretKinds.ALL.forEach { kind ->
            val needle = marker(kind)
            val payload = """{"title":"$needle","body":"$needle"}"""
            val id = runBlocking { repository.save(access, kind, null, payload) }
            val record = runBlocking { repository.find(access, id) }
            assertNotNull("$kind produced no readable record", record)
            assertEquals("a readable round trip is required", kind, record!!.kind)
            assertTrue(
                "$kind did not decrypt back to its own payload",
                record.payloadJson.contains(needle),
            )
            assertFalse("$kind reported a decryption failure", record.decryptionFailed)
        }
    }

    @Test
    fun aadRejectsIdentityAndKindSubstitutionForEveryKind() {
        runBlocking { vault.enroll() }
        val access = vault.access() ?: error("vault is locked")
        val repository = vault.repository

        SecretKinds.ALL.forEach { kind ->
            val needle = marker(kind)
            val id = runBlocking { repository.save(access, kind, null, """{"title":"$needle"}""") }
            val original = vault.dao.rows.value.first { it.id == id }

            // Same ciphertext, different record identity.
            vault.dao.rows.value = vault.dao.rows.value + original.copy(id = "$id-other")
            val rekeyed = runBlocking { repository.find(access, "$id-other") }
            assertTrue("$kind accepted ciphertext under another id", rekeyed!!.decryptionFailed)
            assertEquals("$kind leaked plaintext after an id swap", "", rekeyed.payloadJson)
            vault.dao.rows.value = vault.dao.rows.value.filterNot { it.id == "$id-other" }

            // Same ciphertext, different kind partition.
            val otherKind = (SecretKinds.ALL - kind).first()
            vault.dao.rows.value = vault.dao.rows.value + original.copy(id = "$id-askind", kind = otherKind)
            val recol = runBlocking { repository.find(access, "$id-askind") }
            assertTrue("$kind accepted ciphertext bound to another kind", recol!!.decryptionFailed)
            vault.dao.rows.value = vault.dao.rows.value.filterNot { it.id == "$id-askind" }

            // The untouched original still authenticates, proving the two failures above
            // were binding checks and not a broken harness.
            val intact = runBlocking { repository.find(access, id) }
            assertFalse("$kind's own record stopped decrypting", intact!!.decryptionFailed)
            assertTrue(intact.payloadJson.contains(needle))
        }
    }

    @Test
    fun flippingAnyEnvelopeByteFailsAuthenticationForEveryKind() {
        runBlocking { vault.enroll() }
        val access = vault.access() ?: error("vault is locked")
        val repository = vault.repository

        SecretKinds.ALL.forEach { kind ->
            val needle = marker(kind)
            val id = runBlocking { repository.save(access, kind, null, """{"title":"$needle"}""") }
            val original = vault.dao.rows.value.first { it.id == id }
            val tampered = original.envelope.copyOf().also {
                it[it.size - 1] = (it[it.size - 1].toInt() xor 0x01).toByte()
            }
            vault.dao.rows.value = vault.dao.rows.value + original.copy(id = "$id-tamper", envelope = tampered)
            val record = runBlocking { repository.find(access, "$id-tamper") }
            assertTrue("$kind accepted a tampered envelope", record!!.decryptionFailed)
            assertEquals("$kind returned content despite tampering", "", record.payloadJson)
            vault.dao.rows.value = vault.dao.rows.value.filterNot { it.id == "$id-tamper" }
        }
    }

    @Test
    fun auditDetailsNeverCarryAStoredMarkerForAnyAuditableKind() = runBlocking {
        vault.enroll()
        val access = vault.access() ?: error("vault is locked")
        val sink = CollectingSink()
        val repository = SecretRepository(vault.dao, vault.session, VaultKeyManager(vault.session, TestKeyRegistry()), sink)

        SecretKinds.ALL.forEach { kind ->
            val needle = marker(kind)
            repository.save(access, kind, null, """{"title":"$needle","body":"$needle"}""")
        }

        val details = sink.events.joinToString("|") { "${it.action.name} ${it.detail}" }
        SecretKinds.ALL.forEach { kind ->
            assertFalse("$kind leaked its marker into the audit detail", details.contains(marker(kind)))
        }
        assertFalse(details.contains("title"))
        // Kinds with dedicated events must not also emit the generic line, or a burst
        // of ordinary activity would evict real alerts from the bounded timeline.
        assertEquals(
            SecretKinds.ALL.count { it != SecretKinds.NOTE_DRAFT && it != SecretKinds.MEDIA && it != SecretKinds.CAPSULE },
            sink.events.count { it.action == SecurityEventAction.DATA_WRITTEN },
        )
    }

    /** Same root discovery the Arabic source guard uses, so both work from either module. */
    private fun nativeRoot(): File {
        var directory: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (directory != null) {
            if (File(directory, "settings.gradle.kts").isFile && File(directory, "app").isDirectory) return directory
            val nested = File(directory, "native-android")
            if (File(nested, "settings.gradle.kts").isFile) return nested
            directory = directory.parentFile
        }
        error("Could not locate native-android from ${System.getProperty("user.dir")}")
    }

    private class CollectingSink : SecurityAuditSink {
        val events = mutableListOf<SecurityAuditEvent>()
        override suspend fun record(event: SecurityAuditEvent) { events += event }
    }
}
