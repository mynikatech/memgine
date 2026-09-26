package com.mynikatech.memgine.component.otp

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class OtpSmsRouteResolverTest {
    @Test
    fun `canadian live SMS uses the configured Canadian origin`() {
        val route = OtpSmsRouteResolver("+14165550100").resolve("+14165550101")
        assertEquals(OtpLiveSmsRoute.CANADA_DEDICATED, route.route)
        assertEquals("+14165550100", route.originationIdentity)
    }

    @Test
    fun `India live SMS uses ILDO without an origin identity`() {
        val route = OtpSmsRouteResolver("").resolve("+919876543210")
        assertEquals(OtpLiveSmsRoute.INDIA_ILDO, route.route)
        assertNull(route.originationIdentity)
    }

    @Test
    fun `Canada requires a configured live origin`() {
        assertFailsWith<IllegalStateException> {
            OtpSmsRouteResolver("").resolve("+14165550101")
        }
    }

    @Test
    fun `unsupported live destinations fail safely`() {
        assertFailsWith<IllegalStateException> {
            OtpSmsRouteResolver("+14165550100").resolve("+447700900123")
        }
    }
}
