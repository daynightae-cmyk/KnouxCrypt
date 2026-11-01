package com.knoux.crypt

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.knoux.crypt.ui.encodeQrBitmap
import com.knoux.crypt.security.KeyFingerprint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Device check for the public-key QR (TASK 28): the generated code must decode
 * back to exactly the text that was encoded, and that text must carry a public
 * key only.
 */
@RunWith(AndroidJUnit4::class)
class PublicKeyQrDeviceTest {

    @Test
    fun generatedCodeDecodesBackToTheSameText() {
        val uri = KeyFingerprint.uriFor("KNOUX signing key", "QUJDREVGRw==")
        val bitmap = encodeQrBitmap(uri, 512)
        assertNotNull("the QR could not be generated", bitmap)

        val width = bitmap!!.width
        val height = bitmap.height
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        val source = RGBLuminanceSource(width, height, pixels)
        val decoded = MultiFormatReader().decode(BinaryBitmap(HybridBinarizer(source)))
        assertEquals(uri, decoded.text)
        assertTrue(decoded.text.startsWith("knouxkey:v1:"))
    }
}
