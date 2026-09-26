package com.mynikatech.memgine.component.otp

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class OtpDeliveryModeResolverTest {
    @Test
    fun `local and dev default to mock delivery`() {
        assertEquals(OtpDeliveryMode.MOCK, OtpDeliveryModeResolver("local", false).resolve("DEFAULT"))
        assertEquals(OtpDeliveryMode.MOCK, OtpDeliveryModeResolver("dev", false).resolve("MOCK"))
    }

    @Test
    fun `live delivery requires explicit local or dev opt in`() {
        assertFailsWith<IllegalStateException> {
            OtpDeliveryModeResolver("dev", false).resolve("LIVE")
        }
        assertEquals(OtpDeliveryMode.LIVE, OtpDeliveryModeResolver("dev", true).resolve("LIVE"))
    }

    @Test
    fun `production always resolves to live delivery`() {
        assertEquals(OtpDeliveryMode.LIVE, OtpDeliveryModeResolver("prod", false).resolve("DEFAULT"))
        assertEquals(OtpDeliveryMode.LIVE, OtpDeliveryModeResolver("prod", false).resolve("MOCK"))
    }
}
