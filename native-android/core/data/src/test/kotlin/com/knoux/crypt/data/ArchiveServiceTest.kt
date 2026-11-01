package com.knoux.crypt.data

import com.knoux.crypt.security.FileEnvelope
import com.knoux.crypt.security.KeyDerivation
import com.knoux.crypt.security.TamperedFileException
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.security.SecureRandom
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Encrypted archive tests (TASK 21).
 *
 * The interesting cases are the hostile ones, so a couple of tests build their
 * own payload — a manifest that lies about an entry, and a directory that does not
 * match the manifest — and run them through the real passphrase container rather
 * than poking at internals.
 */
class ArchiveServiceTest {

    private val tempDir: File = File(System.getProperty("java.io.tmpdir"), "karc-test-${System.nanoTime()}")
        .apply { mkdirs() }

    private fun service(vault: TestVault) = ArchiveService(
        session = vault.session,
        vaultFiles = VaultFileCipher(vault.session),
        repository = vault.repository,
        tempDirProvider = { tempDir },
    )

    private fun item(name: String, bytes: ByteArray) =
        ArchiveService.Item(name, bytes.size.toLong()) { ByteArrayInputStream(bytes) }

    @Test
    fun deviceKeyArchiveRoundTripsEveryByte() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val archive = service(vault)
        val first = "quarterly report\nline two".toByteArray()
        val second = ByteArray(300_000) { (it % 251).toByte() }

        val container = ByteArrayOutputStream()
        val created = archive.create(
            access = access,
            items = listOf(item("report.txt", first), item("payload.bin", second)),
            output = container,
            compressed = true,
        )
        assertTrue("create failed: $created", created is ArchiveService.Outcome.Success)
        val produced = (created as ArchiveService.Outcome.Success).value
        assertEquals(2, produced.entryCount)
        assertTrue(produced.containerBytes > 0)
        // KNF2 container, not a bare ZIP.
        assertEquals("KNF2", String(container.toByteArray(), 0, 4, Charsets.ISO_8859_1))

        archive.open(access, ByteArrayInputStream(container.toByteArray())).use { opened ->
            val listed = archive.verifyDirectory(opened)
            assertTrue("listing failed: $listed", listed is ArchiveService.Outcome.Success)
            val entries = (listed as ArchiveService.Outcome.Success).value
            assertEquals(listOf("report.txt", "payload.bin"), entries.map { it.name })

            val extracted = ByteArrayOutputStream()
            val result = archive.extract(opened, entries.indexOfFirst { it.name == "report.txt" }, extracted)
            assertTrue("extract failed: $result", result is ArchiveService.Outcome.Success)
            assertEquals(String(first, Charsets.UTF_8), String(extracted.toByteArray(), Charsets.UTF_8))

            val bigOut = ByteArrayOutputStream()
            val bigIndex = entries.indexOfFirst { it.name == "payload.bin" }
            val big = archive.extract(opened, bigIndex, bigOut)
            assertTrue("large extract failed: $big", big is ArchiveService.Outcome.Success)
            assertTrue(first.size != second.size)
            assertEquals(second.size, bigOut.toByteArray().size)
            assertTrue(second.contentEquals(bigOut.toByteArray()))
        }
    }

    @Test
    fun uncompressedEntriesRoundTripToo() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val archive = service(vault)
        val bytes = "stored without deflate".toByteArray()
        val container = ByteArrayOutputStream()
        val created = archive.create(access, listOf(item("plain.txt", bytes)), container, compressed = false)
        assertTrue(created is ArchiveService.Outcome.Success)
        assertFalse((created as ArchiveService.Outcome.Success).value.compressed)

        archive.open(access, ByteArrayInputStream(container.toByteArray())).use { opened ->
            val out = ByteArrayOutputStream()
            assertTrue(opened.entries.single().name == "plain.txt")
            val result = archive.extract(opened, 0, out)
            assertTrue(result is ArchiveService.Outcome.Success)
            assertTrue(bytes.contentEquals(out.toByteArray()))
        }
    }

    @Test
    fun passphraseArchivesOpenOnlyWithTheSamePassphrase() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val archive = service(vault)
        val bytes = "portable secret".toByteArray()
        val container = ByteArrayOutputStream()
        val created = archive.createWithPassphrase(
            passphrase = "correct horse battery".toCharArray(),
            items = listOf(item("note.txt", bytes)),
            output = container,
            compressed = true,
        )
        assertTrue(created is ArchiveService.Outcome.Success)
        assertEquals("KNF1", String(container.toByteArray(), 0, 4, Charsets.ISO_8859_1))

        archive.openWithPassphrase("correct horse battery".toCharArray(), ByteArrayInputStream(container.toByteArray()))
            .use { opened ->
                val out = ByteArrayOutputStream()
                assertTrue(archive.extract(opened, 0, out) is ArchiveService.Outcome.Success)
                assertTrue(bytes.contentEquals(out.toByteArray()))
            }

        val wrong = runCatching {
            archive.openWithPassphrase("wrong".toCharArray(), ByteArrayInputStream(container.toByteArray()))
        }
        assertTrue(
            "a wrong passphrase must not open the archive",
            wrong.exceptionOrNull() is TamperedFileException || wrong.exceptionOrNull() is java.security.GeneralSecurityException,
        )
    }

    @Test
    fun unsafeAndDuplicateNamesAreRefusedBeforeAnyWork() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val archive = service(vault)
        val bytes = "x".toByteArray()

        listOf("../escape.txt", "/absolute.txt", "dir/nested.txt", "..", ".", "con", "COM1", "nul", "  ", "a".repeat(300))
            .forEach { bad ->
                val outcome = archive.create(access, listOf(item(bad, bytes)), ByteArrayOutputStream(), true)
                assertTrue("accepted the unsafe name '$bad'", outcome is ArchiveService.Outcome.Failed)
                assertTrue(
                    "wrong failure for '$bad': $outcome",
                    (outcome as ArchiveService.Outcome.Failed).failure is ArchiveService.ArchiveFailure.UnsafeName ||
                        (outcome as ArchiveService.Outcome.Failed).failure is ArchiveService.ArchiveFailure.DuplicateName,
                )
            }

        val duplicate = archive.create(
            access,
            listOf(item("same.txt", bytes), item("same.txt", bytes)),
            ByteArrayOutputStream(),
            true,
        )
        assertTrue(duplicate is ArchiveService.Outcome.Failed)
        assertTrue((duplicate as ArchiveService.Outcome.Failed).failure is ArchiveService.ArchiveFailure.DuplicateName)

        val empty = archive.create(access, emptyList(), ByteArrayOutputStream(), true)
        assertTrue((empty as ArchiveService.Outcome.Failed).failure is ArchiveService.ArchiveFailure.Empty)

        val tooMany = archive.create(
            access,
            List(ArchiveService.MAX_ENTRIES + 1) { item("file$it.txt", bytes) },
            ByteArrayOutputStream(),
            true,
        )
        assertTrue((tooMany as ArchiveService.Outcome.Failed).failure is ArchiveService.ArchiveFailure.TooManyEntries)
    }

    @Test
    fun sanitizationKeepsOnlyASingleSafeSegment() {
        assertEquals("report.pdf", ArchiveService.sanitize("  report.pdf  "))
        assertEquals("a b.txt", ArchiveService.sanitize("a b.txt"))
        assertEquals("notes-2026.md", ArchiveService.sanitize("notes-2026.md"))
        // A path of any kind is refused, not flattened into a bare name.
        assertNullish(ArchiveService.sanitize("Documents/report.pdf"))
        assertNullish(ArchiveService.sanitize("../x"))
        assertNullish(ArchiveService.sanitize("C:\\Windows\\x"))
        assertNullish(ArchiveService.sanitize("a/b/c"))
        assertNullish(ArchiveService.sanitize(".hidden"))
        assertNullish(ArchiveService.sanitize("con"))
        assertNullish(ArchiveService.sanitize("LPT1"))
        assertNullish(ArchiveService.sanitize("bad\u0000char"))
        assertNullish(ArchiveService.sanitize(""))
        assertNullish(ArchiveService.sanitize("a".repeat(201)))
    }

    private fun assertNullish(value: String?) = assertTrue("expected rejection, got $value", value == null)

    @Test
    fun aManifestThatUnderstatesAnEntryIsRefusedRatherThanExtracted() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val archive = service(vault)
        val passphrase = "bomb-check".toCharArray()

        // Hand-built payload: the ZIP really holds ~2 MB, the manifest declares 100 bytes.
        val zip = File(tempDir, "crafted.zip")
        FileOutputStream(zip).use { fileOut ->
            ZipOutputStream(fileOut).use { out ->
                out.putNextEntry(ZipEntry("bomb.txt"))
                out.write(ByteArray(2 * 1024 * 1024))
                out.closeEntry()
            }
        }
        val manifest = """{"version":1,"entries":[{"name":"bomb.txt","size":100,"digestHex":"${"0".repeat(64)}"}],"compressed":true}"""
            .toByteArray(Charsets.UTF_8)
        val payload = File(tempDir, "crafted.bin")
        FileOutputStream(payload).use { out ->
            out.write(byteArrayOf((manifest.size shr 24).toByte(), (manifest.size shr 16).toByte(), (manifest.size shr 8).toByte(), manifest.size.toByte()))
            out.write(manifest)
            zip.inputStream().use { it.copyTo(out) }
        }
        val envelope = FileEnvelope()
        val salt = ByteArray(FileEnvelope.SALT_BYTES).also { SecureRandom().nextBytes(it) }
        val kdf = FileEnvelope.KdfParams(2, salt)
        val key = KeyDerivation.forEnvelope(passphrase, kdf)
        val container = ByteArrayOutputStream()
        envelope.encrypt(
            input = payload.inputStream(),
            output = container,
            key = key,
            keySource = FileEnvelope.KeySource.PASSPHRASE,
            context = ArchiveService.ARCHIVE_CONTEXT,
            plaintextLength = payload.length(),
            kdfParams = kdf,
        )
        zip.delete()
        payload.delete()

        val opened = archive.openWithPassphrase(passphrase, ByteArrayInputStream(container.toByteArray()))
        opened.use {
            val out = ByteArrayOutputStream()
            val result = archive.extract(opened, 0, out)
            assertTrue("the bomb must fail, got $result", result is ArchiveService.Outcome.Failed)
            val failure = (result as ArchiveService.Outcome.Failed).failure
            assertTrue(
                "unexpected failure $failure",
                failure is ArchiveService.ArchiveFailure.TooLarge || failure is ArchiveService.ArchiveFailure.Tampered,
            )
        }
    }

    @Test
    fun aDirectoryThatDisagreesWithTheManifestIsTampering() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val archive = service(vault)
        val passphrase = "mismatch-check".toCharArray()

        val zip = File(tempDir, "mismatch.zip")
        FileOutputStream(zip).use { fileOut ->
            ZipOutputStream(fileOut).use { out ->
                out.putNextEntry(ZipEntry("real.txt"))
                out.write("content".toByteArray())
                out.closeEntry()
            }
        }
        // The manifest names a file the ZIP does not contain.
        val manifest = """{"version":1,"entries":[{"name":"claimed.txt","size":7,"digestHex":"${"0".repeat(64)}"}],"compressed":true}"""
            .toByteArray(Charsets.UTF_8)
        val payload = File(tempDir, "mismatch.bin")
        FileOutputStream(payload).use { out ->
            out.write(byteArrayOf((manifest.size shr 24).toByte(), (manifest.size shr 16).toByte(), (manifest.size shr 8).toByte(), manifest.size.toByte()))
            out.write(manifest)
            zip.inputStream().use { it.copyTo(out) }
        }
        val salt = ByteArray(FileEnvelope.SALT_BYTES).also { SecureRandom().nextBytes(it) }
        val kdf = FileEnvelope.KdfParams(2, salt)
        val key = KeyDerivation.forEnvelope(passphrase, kdf)
        val container = ByteArrayOutputStream()
        FileEnvelope().encrypt(
            payload.inputStream(), container, key, FileEnvelope.KeySource.PASSPHRASE,
            ArchiveService.ARCHIVE_CONTEXT, payload.length(), kdf,
        )
        zip.delete()
        payload.delete()

        archive.openWithPassphrase(passphrase, ByteArrayInputStream(container.toByteArray())).use { opened ->
            val result = archive.verifyDirectory(opened)
            assertTrue("expected tampering, got $result", result is ArchiveService.Outcome.Failed)
            assertTrue(
                (result as ArchiveService.Outcome.Failed).failure is ArchiveService.ArchiveFailure.Tampered,
            )
        }
    }

    @Test
    fun tamperingWithTheContainerIsDetectedOnOpen() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val archive = service(vault)
        val container = ByteArrayOutputStream()
        archive.create(
            access,
            listOf(item("a.txt", "alpha".toByteArray()), item("b.txt", "bravo".toByteArray())),
            container,
            true,
        )
        val bytes = container.toByteArray()
        bytes[bytes.size - 1] = (bytes[bytes.size - 1].toInt() xor 0x04).toByte()
        val failure = runCatching { archive.open(access, ByteArrayInputStream(bytes)) }.exceptionOrNull()
        assertTrue("expected a tamper signal, got $failure", failure is TamperedFileException)
    }

    @Test
    fun recordsDescribeArchivesWithoutNamingTheirContents() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val archive = service(vault)
        val container = ByteArrayOutputStream()
        val created = archive.create(
            access,
            listOf(item("medical-notes.txt", "diagnosis".toByteArray())),
            container,
            true,
        ) as ArchiveService.Outcome.Success

        archive.record(access, "Project bundle", created.value, "device-key")
        val records = archive.observeRecords(access).first()
        assertEquals(1, records.size)
        assertEquals("Project bundle", records.first().label)
        assertEquals(1, records.first().entryCount)
        assertEquals("device-key", records.first().keySource)
        assertNotNull(records.first().digestHex)

        val raw = vault.dao.rows.value.filter { it.kind == SecretKinds.ARCHIVE }
            .joinToString("|") { String(it.envelope, Charsets.ISO_8859_1) }
        assertFalse(raw.contains("medical-notes"))
        assertFalse(raw.contains("diagnosis"))
    }

    @Test
    fun aLockedVaultCannotCreateOrOpen() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val archive = service(vault)
        val container = ByteArrayOutputStream()
        archive.create(access, listOf(item("a.txt", "x".toByteArray())), container, true)
        vault.session.lock()
        assertTrue(
            runCatching { archive.create(access, listOf(item("a.txt", "x".toByteArray())), ByteArrayOutputStream(), true) }
                .exceptionOrNull() is VaultLockedException,
        )
        assertTrue(
            runCatching { archive.open(access, ByteArrayInputStream(container.toByteArray())) }
                .exceptionOrNull() is VaultLockedException,
        )
    }

    @Test
    fun aPlainEncryptedFileIsNotAcceptedAsAnArchive() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val files = VaultFileCipher(vault.session)
        val plain = ByteArrayOutputStream()
        val content = "just a file, not an archive".toByteArray()
        files.encrypt(access, ByteArrayInputStream(content), plain, content.size.toLong())

        val archive = service(vault)
        val failure = runCatching { archive.open(access, ByteArrayInputStream(plain.toByteArray())) }
            .exceptionOrNull()
        assertNotNull("opening a non-archive must fail loudly", failure)
    }
}
