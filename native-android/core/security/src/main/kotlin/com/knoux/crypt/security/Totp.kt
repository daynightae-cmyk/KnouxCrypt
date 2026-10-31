package com.knoux.crypt.security

import java.nio.ByteBuffer
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** RFC 4648 base32 without padding, the format used by authenticator exports. */
object Base32 {
    private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    private val REVERSE = IntArray(128) { -1 }.also { table ->
        ALPHABET.forEachIndexed { index, char -> table[char.code] = index }
        table['2'.code] = 26
    }

    fun encode(bytes: ByteArray): String {
        if (bytes.isEmpty()) return ""
        val out = StringBuilder((bytes.size * 8 + 4) / 5)
        var buffer = 0
        var bits = 0
        for (byte in bytes) {
            buffer = (buffer shl 8) or (byte.toInt() and 0xff)
            bits += 8
            while (bits >= 5) {
                out.append(ALPHABET[(buffer shr (bits - 5)) and 0x1f])
                bits -= 5
            }
        }
        if (bits > 0) out.append(ALPHABET[(buffer shl (5 - bits)) and 0x1f])
        return out.toString()
    }

    fun decode(value: String): ByteArray {
        val cleaned = value.filterNot { it.isWhitespace() || it == '=' || it == '-' }.uppercase()
        require(cleaned.isNotEmpty()) { "Empty base32 value" }
        val out = java.io.ByteArrayOutputStream(cleaned.length * 5 / 8)
        var buffer = 0
        var bits = 0
        for (char in cleaned) {
            val code = char.code
            require(code < 128 && REVERSE[code] >= 0) { "Invalid base32 character" }
            buffer = (buffer shl 5) or REVERSE[code]
            bits += 5
            if (bits >= 8) {
                out.write((buffer shr (bits - 8)) and 0xff)
                bits -= 8
            }
        }
        return out.toByteArray()
    }
}

/** RFC 6238 TOTP over RFC 4226 HOTP. Codes are presentation values, not secrets. */
object Totp {
    enum class Algorithm(val macName: String) {
        SHA1("HmacSHA1"),
        SHA256("HmacSHA256"),
        SHA512("HmacSHA512"),
    }

    fun generate(
        secret: ByteArray,
        epochSeconds: Long,
        periodSeconds: Int = 30,
        digits: Int = 6,
        algorithm: Algorithm = Algorithm.SHA1,
    ): String {
        require(secret.isNotEmpty()) { "Empty TOTP secret" }
        require(periodSeconds in 15..120) { "Unsupported period" }
        require(digits in 6..8) { "Unsupported digit count" }
        require(epochSeconds >= 0) { "Negative time" }
        val counter = epochSeconds / periodSeconds
        val message = ByteBuffer.allocate(8).putLong(counter).array()
        val mac = Mac.getInstance(algorithm.macName)
        mac.init(SecretKeySpec(secret, algorithm.macName))
        val hash = mac.doFinal(message)
        val offset = hash[hash.size - 1].toInt() and 0x0f
        val binary = ((hash[offset].toInt() and 0x7f) shl 24) or
            ((hash[offset + 1].toInt() and 0xff) shl 16) or
            ((hash[offset + 2].toInt() and 0xff) shl 8) or
            (hash[offset + 3].toInt() and 0xff)
        val code = binary % POWERS_OF_TEN[digits]
        return code.toString().padStart(digits, '0')
    }

    fun remainingSeconds(epochMillis: Long, periodSeconds: Int = 30): Int {
        require(periodSeconds in 15..120)
        val seconds = epochMillis / 1000
        return (periodSeconds - (seconds % periodSeconds)).toInt()
    }

    private val POWERS_OF_TEN = intArrayOf(1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000)
}

object Hashing {
    private const val BUFFER = 64 * 1024

    fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)
    fun sha512(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-512").digest(bytes)

    fun sha256(input: java.io.InputStream, totalBytes: Long = -1, onProgress: (Long) -> Unit = {}): ByteArray =
        digest("SHA-256", input, totalBytes, onProgress)

    fun sha512(input: java.io.InputStream, totalBytes: Long = -1, onProgress: (Long) -> Unit = {}): ByteArray =
        digest("SHA-512", input, totalBytes, onProgress)

    private fun digest(algorithm: String, input: java.io.InputStream, totalBytes: Long, onProgress: (Long) -> Unit): ByteArray {
        val digest = MessageDigest.getInstance(algorithm)
        val buffer = ByteArray(BUFFER)
        var processed = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
            processed += read
            onProgress(processed)
        }
        if (totalBytes >= 0 && processed != totalBytes) {
            throw java.io.IOException("Input size changed while hashing")
        }
        return digest.digest()
    }

    fun hmacSha256(key: ByteArray, message: ByteArray): ByteArray {
        require(key.isNotEmpty()) { "Empty HMAC key" }
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(message)
    }

    /**
     * Streams a message through HMAC-SHA-256 without buffering it. A declared
     * total size, when non-negative, must match exactly; progress counts input
     * bytes and carries no key material. The caller owns the key zeroization.
     */
    fun hmacSha256(
        key: ByteArray,
        input: java.io.InputStream,
        totalBytes: Long = -1,
        onProgress: (Long) -> Unit = {},
    ): ByteArray {
        require(key.isNotEmpty()) { "Empty HMAC key" }
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        val buffer = ByteArray(BUFFER)
        var processed = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            mac.update(buffer, 0, read)
            processed += read
            onProgress(processed)
        }
        if (totalBytes >= 0 && processed != totalBytes) {
            throw java.io.IOException("Input size changed while computing HMAC")
        }
        return mac.doFinal()
    }

    fun toHex(bytes: ByteArray): String = buildString(bytes.size * 2) {
        for (byte in bytes) {
            val value = byte.toInt() and 0xff
            append("0123456789abcdef"[value ushr 4])
            append("0123456789abcdef"[value and 0x0f])
        }
    }

    /** Constant-time comparison for tags/fingerprints; not for passphrases. */
    fun constantTimeEquals(first: ByteArray, second: ByteArray): Boolean = MessageDigest.isEqual(first, second)
}

object SecureRandomSource {
    private val random = java.security.SecureRandom()

    fun bytes(size: Int): ByteArray {
        require(size in 1..4096) { "Random size out of bounds" }
        return ByteArray(size).also(random::nextBytes)
    }

    fun hex(size: Int): String = Hashing.toHex(bytes(size))

    fun base64(size: Int): String = java.util.Base64.getEncoder().encodeToString(bytes(size))

    fun words(words: List<String>, count: Int): String {
        require(words.isNotEmpty()) { "Empty word list" }
        require(count in 3..12) { "Unsupported word count" }
        return (1..count).joinToString("-") { words[random.nextInt(words.size)] }
    }
}
