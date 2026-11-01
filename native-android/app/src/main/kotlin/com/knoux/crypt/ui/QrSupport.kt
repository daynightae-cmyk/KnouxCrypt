package com.knoux.crypt.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.camera.view.PreviewView
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.viewinterop.AndroidView
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.io.InputStream

/**
 * Offline QR decoding for account import (TASK 11).
 *
 * Only QR symbols are accepted. The frame/image never leaves the process: ZXing
 * decodes luminance locally, and the result text goes straight into the parser
 * and then the encrypted vault. No network permission exists in the app.
 */
object QrSupport {
    private const val MAX_IMAGE_SIDE = 1600

    private fun reader(): MultiFormatReader = MultiFormatReader().apply {
        setHints(
            mapOf(
                DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
                DecodeHintType.TRY_HARDER to true,
            ),
        )
    }

    /** Decodes a picked image, downscaled to bound memory before analysis. */
    fun decodeImage(stream: InputStream): String? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        val bytes = stream.readBytes()
        if (bytes.isEmpty()) return null
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (
            bounds.outWidth / sample > MAX_IMAGE_SIDE ||
            bounds.outHeight / sample > MAX_IMAGE_SIDE
        ) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
        return try {
            decodeBitmap(bitmap)
        } finally {
            bitmap.recycle()
        }
    }

    fun decodeBitmap(bitmap: Bitmap): String? {
        val width = bitmap.width
        val height = bitmap.height
        if (width <= 0 || height <= 0) return null
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        return runCatching {
            reader().decodeWithState(
                BinaryBitmap(HybridBinarizer(RGBLuminanceSource(width, height, pixels))),
            ).text
        }.getOrNull()
    }

    /** Camera frames arrive as YUV; only the luma plane is needed for QR. */
    fun luminanceOf(image: ImageProxy): Triple<ByteArray, Int, Int>? {
        val plane = image.planes.firstOrNull() ?: return null
        val width = image.width
        val height = image.height
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val pixelStride = plane.pixelStride
        if (pixelStride != 1) return null
        val out = ByteArray(width * height)
        val row = ByteArray(rowStride)
        buffer.rewind()
        for (y in 0 until height) {
            val toRead = minOf(rowStride, buffer.remaining())
            if (toRead <= 0) break
            buffer.get(row, 0, toRead)
            System.arraycopy(row, 0, out, y * width, width)
        }
        return Triple(out, width, height)
    }

    fun decodeLuminance(data: ByteArray, width: Int, height: Int): String? = runCatching {
        reader().decodeWithState(
            BinaryBitmap(
                HybridBinarizer(PlanarYUVLuminanceSource(data, width, height, 0, 0, width, height, false)),
            ),
        ).text
    }.getOrNull()
}

/**
 * CameraX analyser that keeps only the first QR payload and stops reacting once
 * it has one, so a single frame cannot spam the importer.
 */
class QrFrameAnalyzer(
    private val onDecoded: (String) -> Unit,
) : ImageAnalysis.Analyzer {
    @Volatile
    private var delivered = false

    override fun analyze(image: ImageProxy) {
        try {
            if (delivered) return
            val frame = QrSupport.luminanceOf(image) ?: return
            val text = QrSupport.decodeLuminance(frame.first, frame.second, frame.third) ?: return
            delivered = true
            onDecoded(text)
        } finally {
            image.close()
        }
    }
}

/**
 * Live camera preview with QR analysis. The caller owns the permission flow and
 * only composes this when the grant is present; the binding is released when the
 * composable leaves the screen.
 */
@Composable
fun QrCameraPreview(
    modifier: Modifier = Modifier,
    onDecoded: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { java.util.concurrent.Executors.newSingleThreadExecutor() }
    val analyzer = remember { QrFrameAnalyzer(onDecoded) }
    var previewView by remember { mutableStateOf<PreviewView?>(null) }
    var provider by remember { mutableStateOf<androidx.camera.lifecycle.ProcessCameraProvider?>(null) }

    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = { viewContext ->
            PreviewView(viewContext).apply {
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }.also { previewView = it }
        },
    )

    LaunchedEffect(previewView, lifecycleOwner) {
        val view = previewView ?: return@LaunchedEffect
        val cameraProvider = suspendCancellableCoroutine { continuation ->
            val future = androidx.camera.lifecycle.ProcessCameraProvider.getInstance(context)
            future.addListener(
                {
                    runCatching { continuation.resume(future.get()) }
                        .onFailure { continuation.cancel(it) }
                },
                androidx.core.content.ContextCompat.getMainExecutor(context),
            )
        }
        provider = cameraProvider
        runCatching {
            val preview = androidx.camera.core.Preview.Builder().build().apply {
                surfaceProvider = view.surfaceProvider
            }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .apply { setAnalyzer(executor, analyzer) }
            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                lifecycleOwner,
                androidx.camera.core.CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                analysis,
            )
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            runCatching { provider?.unbindAll() }
            executor.shutdown()
        }
    }
}
