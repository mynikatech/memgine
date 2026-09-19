package com.mynikatech.memgine.security

import com.mynikatech.memgine.exception.BadRequestException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class PhoneNormalizerTest {
    private val normalizer = PhoneNormalizer()

    @Test
    fun `normalizes Canadian national number to E164`() {
        assertEquals(CanonicalPhone("+14165551234", "CA"), normalizer.normalize("(416) 555-1234", "CA"))
    }

    @Test
    fun `normalizes Indian national number to E164`() {
        assertEquals(CanonicalPhone("+919876543210", "IN"), normalizer.normalize("98765 43210", "IN"))
    }

    @Test
    fun `derives region from international number`() {
        assertEquals(CanonicalPhone("+14165551234", "CA"), normalizer.normalize("+1 416 555 1234", null))
    }

    @Test
    fun `rejects local number without region`() {
        assertFailsWith<BadRequestException> { normalizer.normalize("4165551234", null) }
    }
}
