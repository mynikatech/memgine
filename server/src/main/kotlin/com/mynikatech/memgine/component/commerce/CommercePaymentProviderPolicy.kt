package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException

/** Runtime policy for provider routes persisted by Commerce. */
class CommercePaymentProviderPolicy(environment: String) {
    private val testAllowed = environment.lowercase() in setOf("local", "dev", "development")

    fun requireUsable(route: CommercePaymentProviderRouteRow) {
        val providerCode = route.providerCode.uppercase()
        if (providerCode == "TEST" && !testAllowed) {
            throw BadRequestException("TEST payment provider is unavailable in this environment")
        }
        if (providerCode != "TEST" && route.integrationConfigurationId.isNullOrBlank()) {
            throw BadRequestException("Commerce payment provider integration is required")
        }
    }

    fun requireConfigurable(providerCode: String, integrationConfigurationId: String?) {
        requireUsable(
            CommercePaymentProviderRouteRow(
                providerCode = providerCode,
                integrationConfigurationId = integrationConfigurationId
            )
        )
    }
}
