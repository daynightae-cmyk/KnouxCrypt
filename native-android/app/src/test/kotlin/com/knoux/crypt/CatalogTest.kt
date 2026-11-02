package com.knoux.crypt

import com.knoux.crypt.ui.normalizeSearch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogTest {
    @Test
    fun acceptedCatalogShapeIsPreserved() {
        assertEquals(34, Catalog.all.size)
        assertEquals(34, Catalog.all.map { it.id }.toSet().size)
        assertEquals(8, Catalog.essentials.size)
        assertEquals(
            listOf("ENCRYPT", "VAULT", "NOTES", "PASSWORDS", "KEY_FORGE", "AUTHENTICATOR", "PRIVACY", "BACKUP"),
            Catalog.essentials.map { it.id },
        )
        val restored = listOf("ENCRYPT", "VAULT", "NOTES", "PASSWORDS", "AUTHENTICATOR", "PRIVACY", "BACKUP")
        assertTrue(Catalog.all.map { it.id }.containsAll(restored))
        assertEquals(34, Catalog.groups.first { it.id == "all" }.ids.size)
        assertEquals(8, Catalog.groups.first { it.id == "essentials" }.ids.size)
        assertTrue(Catalog.all.all { it.titleAr.isNotBlank() && it.descAr.isNotBlank() })
        // A corrupted UTF-8 source once left question marks in place of Arabic.
        // Non-blank is not enough: every Arabic field must contain Arabic script.
        assertTrue(
            Catalog.all.all { service ->
                containsArabic(service.titleAr) && containsArabic(service.descAr)
            },
        )
    }

    private fun containsArabic(value: String): Boolean =
        value.any { it in '\u0600'..'\u06FF' }

    @Test
    fun groupsReferenceKnownUniqueDestinations() {
        Catalog.groups.forEach { group ->
            assertEquals(group.id, group.ids.size, group.ids.toSet().size)
            group.ids.forEach { id -> assertNotNull("Unknown id $id in ${group.id}", Catalog.byId(id)) }
        }
    }

    @Test
    fun onlyImplementedServicesHaveRoutes() {
        Catalog.all.forEach { service ->
            when (service.status) {
                ServiceStatus.IMPLEMENTED -> assertNotNull("Implemented service ${service.id} has no route", service.route)
                ServiceStatus.DESIGN_ONLY -> assertEquals("Design-only ${service.id} must not claim a workflow route", null, service.route)
                ServiceStatus.BLOCKED -> Unit // A blocked capability may still open an honest blocked screen.
            }
        }
        assertEquals(34, Catalog.all.map { Catalog.routeFor(it) }.toSet().size)
    }

    @Test
    fun bilingualSearchNormalization() {
        assertEquals("خزنه", normalizeSearch("خَزْنَة"))
        assertEquals("كلمات المرور", normalizeSearch("كَلِمَات المُرُور"))
        assertEquals("aes-256-gcm", normalizeSearch("AES-256-GCM"))
        assertEquals("vault", normalizeSearch("  Vault  "))
        assertTrue(normalizeSearch("ملاحظات آمنة").contains(normalizeSearch("ملاحظات")))
        assertTrue(normalizeSearch("Vault الخزنة").contains(normalizeSearch("خزنه")))
    }
}
