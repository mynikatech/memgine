package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class PoyntTerminalBindingResolverTest {
    @Test
    fun `missing target device is rejected`() {
        assertFailsWith<BadRequestException> { resolver(FakeLookup()).resolve("org", "integration", " ") }
    }

    @Test
    fun `nonexistent device is rejected`() {
        assertFailsWith<BadRequestException> { resolver(FakeLookup()).resolve("org", "integration", "missing") }
    }

    @Test
    fun `revoked device is rejected`() {
        val lookup = validLookup()
        lookup.devices["device"]!!.revokedAt = "2026-01-01"
        assertFailsWith<BadRequestException> { resolver(lookup).resolve("org", "integration", "device") }
    }

    @Test
    fun `device without terminal binding is rejected`() {
        val lookup = validLookup()
        lookup.bindingRows["device"] = emptyList()
        assertFailsWith<BadRequestException> { resolver(lookup).resolve("org", "integration", "device") }
    }

    @Test
    fun `binding for wrong integration is rejected`() {
        val lookup = validLookup()
        lookup.bindingRows["device"]!!.single().integrationConfigurationId = "other-integration"
        assertFailsWith<BadRequestException> { resolver(lookup).resolve("org", "integration", "device") }
    }

    @Test
    fun `binding for wrong organization is rejected`() {
        val lookup = validLookup()
        lookup.bindingRows["device"]!!.single().organizationId = "other-org"
        assertFailsWith<BadRequestException> { resolver(lookup).resolve("org", "integration", "device") }
    }

    @Test
    fun `deleted binding is rejected`() {
        val lookup = validLookup()
        lookup.bindingRows["device"]!!.single().isDeleted = true
        assertFailsWith<BadRequestException> { resolver(lookup).resolve("org", "integration", "device") }
    }

    @Test
    fun `blank Poynt terminal id is rejected`() {
        val lookup = validLookup()
        lookup.bindingRows["device"]!!.single().poyntTerminalId = " "
        assertFailsWith<BadRequestException> { resolver(lookup).resolve("org", "integration", "device") }
    }

    @Test
    fun `valid exact binding resolves Payment Bridge target`() {
        val target = resolver(validLookup()).resolve("org", "integration", "device")
        assertEquals("business", target.providerBusinessId)
        assertEquals("poynt-store", target.providerStoreId)
        assertEquals("terminal", target.providerDeviceId)
    }

    @Test
    fun `resolver never falls back to another terminal`() {
        val lookup = validLookup()
        lookup.devices["other-device"] = validDevice("other-device")
        lookup.bindingRows["other-device"] = listOf(validBinding("other-device"))
        assertFailsWith<BadRequestException> {
            resolver(lookup).resolve("org", "integration", "requested-device")
        }
        assertEquals(listOf("requested-device"), lookup.deviceRequests)
        assertEquals(emptyList(), lookup.bindingRequests)
    }

    private fun resolver(lookup: FakeLookup) = SqlPoyntTerminalBindingResolver(lookup)

    private fun validLookup() = FakeLookup().also {
        it.devices["device"] = validDevice("device")
        it.bindingRows["device"] = listOf(validBinding("device"))
    }

    private fun validDevice(id: String) = PoyntPosDeviceResolutionRow().also {
        it.posDeviceId = id
        it.organizationId = "org"
        it.storeId = "store"
        it.isDeleted = false
    }

    private fun validBinding(deviceId: String) = PoyntTerminalBindingResolutionRow().also {
        it.posDeviceId = deviceId
        it.organizationId = "org"
        it.storeId = "store"
        it.integrationConfigurationId = "integration"
        it.poyntBusinessId = "business"
        it.poyntStoreId = "poynt-store"
        it.poyntTerminalId = "terminal"
        it.isDeleted = false
        it.integrationOrganizationId = "org"
        it.integrationProvider = "POYNT"
        it.integrationDeleted = false
        it.configuredBusinessId = "business"
        it.configuredStoreId = "poynt-store"
    }

    private class FakeLookup : PoyntTerminalBindingLookup {
        val devices = mutableMapOf<String, PoyntPosDeviceResolutionRow>()
        val bindingRows = mutableMapOf<String, List<PoyntTerminalBindingResolutionRow>>()
        val deviceRequests = mutableListOf<String>()
        val bindingRequests = mutableListOf<String>()

        override fun device(posDeviceId: String): PoyntPosDeviceResolutionRow? {
            deviceRequests += posDeviceId
            return devices[posDeviceId]
        }

        override fun bindings(posDeviceId: String): List<PoyntTerminalBindingResolutionRow> {
            bindingRequests += posDeviceId
            return bindingRows[posDeviceId].orEmpty()
        }
    }
}
