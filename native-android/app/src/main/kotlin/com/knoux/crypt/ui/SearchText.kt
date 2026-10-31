package com.knoux.crypt.ui

import java.text.Normalizer

/** Locale-neutral search key: strips Latin/Arabic diacritics, ligature marks and case. */
fun normalizeSearch(value: String): String =
    Normalizer.normalize(value, Normalizer.Form.NFKD)
        .replace(Regex("[\u0300-\u036f\u064B-\u065F\u0670\u0640]"), "")
        .replace('ة', 'ه')
        .replace('ى', 'ي')
        .replace('أ', 'ا')
        .replace('إ', 'ا')
        .replace('آ', 'ا')
        .lowercase()
        .trim()
