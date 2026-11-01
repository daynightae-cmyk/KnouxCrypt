package com.knoux.crypt.data

import com.knoux.crypt.security.DigitalSignatureService
import com.knoux.crypt.security.SignaturePackage
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Signature Studio service tests (TASK 38).
 *
 * The point being pinned is the separation the studio exists to make: a
 * signature can be mathematically valid while the signer is a stranger, and a
 * package that merely *claims* a digest is contradicted by the bytes handed to it.
 */
class SignatureStudioTest {

    private val content = "quarterly board minutes\nsigned content".toByteArray()

    @Test
    fun detachedSigningVerifiesAndTheReceiptIsEncrypted() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val studio = SignatureStudio(SigningService(KeystoreManager(), vault.repository, vault.session), vault.repository, vault.session)

        val outcome = studio.sign(content, "minutes.txt", "Board", attached = false)
        assertTrue("signing failed: $outcome", outcome is SignatureStudio.SignOutcome.Sealed)
        val produced = (outcome as SignatureStudio.SignOutcome.Sealed).produced
        assertFalse(produced.attached)
        assertEquals(64, produced.digestHex.length)
        assertTrue(produced.signerFingerprint.startsWith("SHA256:"))
        assertTrue(SignaturePackage.looksLike(produced.bytes))

        val verified = studio.verify(produced.bytes, content)
        assertTrue("verify failed: $verified", verified is SignatureStudio.VerifyOutcome.Reported)
        val report = (verified as SignatureStudio.VerifyOutcome.Reported).report
        assertEquals(DigitalSignatureService.Verdict.VALID, report.verdict)
        assertEquals("minutes.txt", report.fileName)
        assertEquals(content.size.toLong(), report.actualSize)
        assertEquals(content.size.toLong(), report.recordedSize)
        // Nothing named this key yet, so it is valid but unrecognised.
        assertFalse(report.signerRecognised)

        val stored = vault.dao.rows.value.first { it.id == produced.receiptId }
        assertEquals(SecretKinds.SIGNATURE, stored.kind)
        val raw = String(stored.envelope, Charsets.ISO_8859_1)
        assertFalse("the signed content leaked into the receipt", raw.contains("quarterly board minutes"))
        assertFalse("the private key leaked into the receipt", raw.contains("PRIVATE"))
    }

    @Test
    fun rememberingTheSignerKeyTurnsValidityIntoRecognition() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val studio = SignatureStudio(SigningService(KeystoreManager(), vault.repository, vault.session), vault.repository, vault.session)
        val produced = studio.sign(content, "contract.pdf", "Legal", attached = false)
        assertTrue(produced is SignatureStudio.SignOutcome.Sealed)
        produced as SignatureStudio.SignOutcome.Sealed

        val decoded = SignaturePackage.decode(produced.produced.bytes)
        val key = decoded.publicKey()
        assertNotNull(key)
        studio.rememberSignerKey(access, "This device", key!!)

        val report = (studio.verify(produced.produced.bytes, content) as SignatureStudio.VerifyOutcome.Reported).report
        assertTrue(report.signatureValid)
        assertTrue("the stored key was not recognised", report.signerRecognised)
        assertEquals("This device", report.recognisedAs)
    }

    @Test
    fun changedContentCannotBeMadeToMatchASignedPackage() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val studio = SignatureStudio(SigningService(KeystoreManager(), vault.repository, vault.session), vault.repository, vault.session)
        val produced = studio.sign(content, "minutes.txt", "Board", attached = false)
        produced as SignatureStudio.SignOutcome.Sealed

        val tampered = studio.verify(
            produced.produced.bytes,
            "quarterly board minutes\nsigned content!".toByteArray(),
        )
        assertTrue("unexpected result $tampered", tampered is SignatureStudio.VerifyOutcome.Reported)
        val verdict = (tampered as SignatureStudio.VerifyOutcome.Reported).report.verdict
        assertTrue(
            "unexpected verdict $verdict",
            verdict == DigitalSignatureService.Verdict.DIGEST_MISMATCH ||
                verdict == DigitalSignatureService.Verdict.INVALID_SIGNATURE,
        )

        // Editing a byte inside the package must not be accepted either.
        val edited = produced.produced.bytes.copyOf()
        edited[edited.size - 5] = (edited[edited.size - 5].toInt() xor 0x08).toByte()
        val editedResult = studio.verify(edited, content)
        assertTrue(
            "unexpected edited-package result $editedResult",
            editedResult is SignatureStudio.VerifyOutcome.Failed ||
                (editedResult as SignatureStudio.VerifyOutcome.Reported).report.verdict !=
                DigitalSignatureService.Verdict.VALID,
        )
    }

    @Test
    fun rewritingTheMetadataBlockBreaksTheSignature() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val studio = SignatureStudio(SigningService(KeystoreManager(), vault.repository, vault.session), vault.repository, vault.session)
        val produced = studio.sign(content, "minutes.txt", "Board", attached = false)
        produced as SignatureStudio.SignOutcome.Sealed
        val bytes = produced.produced.bytes

        // The metadata sits at the end of a detached package. Rewriting the file
        // name there must not stay a valid-looking signature.
        val edited = bytes.copyOf().also { it[it.size - 5] = (it[it.size - 5].toInt() xor 0x08).toByte() }
        val result = studio.verify(edited, content)
        when (result) {
            is SignatureStudio.VerifyOutcome.Failed -> Unit
            is SignatureStudio.VerifyOutcome.Reported -> assertFalse(
                "a rewritten metadata block still reported a valid signature",
                result.report.signatureValid,
            )
        }

        // A mode-1 (content-only) package is still readable and still checks its
        // recorded digest, so old bytes are never silently reinterpreted.
        val legacy = SignaturePackage.encode(
            attached = false,
            algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
            publicKeySpki = SignaturePackage.decode(bytes).publicKeySpki,
            signature = SignaturePackage.decode(bytes).signature,
            metadata = SignaturePackage.decode(bytes).metadata,
            digestMode = SignaturePackage.DIGEST_MODE_SHA256_OF_CONTENT,
        )
        val legacyResult = studio.verify(legacy, content)
        assertTrue(legacyResult is SignatureStudio.VerifyOutcome.Reported)
        assertFalse(
            "a content-only signature must not be reported as valid for a mode-2 package",
            (legacyResult as SignatureStudio.VerifyOutcome.Reported).report.signatureValid,
        )
    }

    @Test
    fun attachedPackagesCarryAndCheckTheirOwnContent() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val studio = SignatureStudio(SigningService(KeystoreManager(), vault.repository, vault.session), vault.repository, vault.session)
        val produced = studio.sign(content, "notice.txt", "Notice", attached = true)
        assertTrue("attached signing failed: $produced", produced is SignatureStudio.SignOutcome.Sealed)
        produced as SignatureStudio.SignOutcome.Sealed
        assertTrue(produced.produced.attached)
        val bytes = produced.produced.bytes
        assertTrue(String(bytes, 0, 4, Charsets.US_ASCII) == "KSA1")
        // The document travels inside the package, unencrypted by design.
        assertTrue(String(bytes, Charsets.ISO_8859_1).contains("quarterly board minutes"))

        val report = (studio.verify(bytes, null) as SignatureStudio.VerifyOutcome.Reported).report
        assertEquals(DigitalSignatureService.Verdict.VALID, report.verdict)
        assertTrue(report.attached)
        assertEquals("checked against the copy embedded in the package", report.detail)

        // A detached package without its document says so instead of guessing.
        val detached = studio.sign(content, "notice.txt", "Notice", attached = false)
        detached as SignatureStudio.SignOutcome.Sealed
        val missing = studio.verify(detached.produced.bytes, null)
        assertTrue(missing is SignatureStudio.VerifyOutcome.Failed)
        assertEquals(SignatureStudio.Failure.UNREADABLE, (missing as SignatureStudio.VerifyOutcome.Failed).failure)
    }

    @Test
    fun aLockedVaultProducesNoSignatureAndNoReceipt() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val studio = SignatureStudio(SigningService(KeystoreManager(), vault.repository, vault.session), vault.repository, vault.session)
        val before = vault.dao.rows.value.size
        vault.session.lock()

        val outcome = studio.sign(content, "minutes.txt", "Board", attached = false)
        assertTrue(outcome is SignatureStudio.SignOutcome.Failed)
        assertEquals(SignatureStudio.Failure.LOCKED, (outcome as SignatureStudio.SignOutcome.Failed).failure)
        assertEquals(before, vault.dao.rows.value.size)
    }

    @Test
    fun oversizedContentIsRefusedRatherThanTruncated() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val studio = SignatureStudio(SigningService(KeystoreManager(), vault.repository, vault.session), vault.repository, vault.session)
        val oversized = ByteArray(SignatureStudio.MAX_CONTENT_BYTES + 1)
        val outcome = studio.sign(oversized, "huge.bin", "Big", attached = false)
        assertTrue(outcome is SignatureStudio.SignOutcome.Failed)
        assertEquals(SignatureStudio.Failure.TOO_LARGE, (outcome as SignatureStudio.SignOutcome.Failed).failure)
    }

    @Test
    fun storedSignaturesAreObservableAndNeverCarryPlaintext() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val studio = SignatureStudio(SigningService(KeystoreManager(), vault.repository, vault.session), vault.repository, vault.session)
        studio.sign(content, "one.txt", "One", attached = false)
        studio.sign(content, "two.txt", "Two", attached = true)

        val receipts = studio.observeStoredSignatures(access).first()
        assertEquals(2, receipts.size)
        assertTrue(receipts.all { it.signatureBase64.isNotEmpty() && it.digestHex.length == 64 })
        assertTrue(receipts.any { it.label.startsWith("attached ·") })
        assertTrue(receipts.none { it.label.contains("quarterly board minutes") })
    }
}
