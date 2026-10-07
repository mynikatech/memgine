package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

class PoyntPosDeviceResolutionRow {
    var posDeviceId: String = ""
    var organizationId: String = ""
    var storeId: String = ""
    var revokedAt: String? = null
    var isDeleted: Boolean = false
}

class PoyntTerminalBindingResolutionRow {
    var posDeviceId: String = ""
    var organizationId: String = ""
    var storeId: String = ""
    var integrationConfigurationId: String? = null
    var poyntBusinessId: String = ""
    var poyntStoreId: String = ""
    var poyntTerminalId: String = ""
    var isDeleted: Boolean = false
    var integrationOrganizationId: String? = null
    var integrationProvider: String? = null
    var integrationDeleted: Boolean? = null
    var configuredBusinessId: String? = null
    var configuredStoreId: String? = null
}

interface PoyntTerminalBindingLookup {
    @SqlQuery("""
        SELECT
            d.pos_device_id AS "posDeviceId",
            d.organization_id AS "organizationId",
            d.store_id AS "storeId",
            d.revoked_at::text AS "revokedAt",
            d.is_deleted AS "isDeleted"
        FROM pos_devices d
        WHERE d.pos_device_id = :posDeviceId
    """)
    @RegisterBeanMapper(PoyntPosDeviceResolutionRow::class)
    fun device(@Bind("posDeviceId") posDeviceId: String): PoyntPosDeviceResolutionRow?

    @SqlQuery("""
        SELECT
            b.pos_device_id AS "posDeviceId",
            b.organization_id AS "organizationId",
            b.store_id AS "storeId",
            b.integration_configuration_id AS "integrationConfigurationId",
            b.poynt_business_id AS "poyntBusinessId",
            b.poynt_store_id AS "poyntStoreId",
            b.poynt_terminal_id AS "poyntTerminalId",
            b.is_deleted AS "isDeleted",
            i.organization_id AS "integrationOrganizationId",
            i.provider AS "integrationProvider",
            i.is_deleted AS "integrationDeleted",
            c.provider_business_id AS "configuredBusinessId",
            c.provider_store_id AS "configuredStoreId"
        FROM poynt_terminal_bindings b
        LEFT JOIN integration_configurations i
          ON i.integration_configuration_id = b.integration_configuration_id
        LEFT JOIN commerce_provider_catalog_configurations c
          ON c.integration_configuration_id = b.integration_configuration_id
         AND c.organization_id = b.organization_id
         AND NOT c.is_deleted
        WHERE b.pos_device_id = :posDeviceId
        ORDER BY b.created_at DESC
    """)
    @RegisterBeanMapper(PoyntTerminalBindingResolutionRow::class)
    fun bindings(@Bind("posDeviceId") posDeviceId: String): List<PoyntTerminalBindingResolutionRow>
}

fun interface PoyntTerminalBindingResolver {
    fun resolve(
        organizationId: String,
        integrationConfigurationId: String,
        targetPosDeviceId: String?
    ): CommerceRemoteTerminalTarget
}

class SqlPoyntTerminalBindingResolver(
    private val lookup: PoyntTerminalBindingLookup
) : PoyntTerminalBindingResolver {
    override fun resolve(
        organizationId: String,
        integrationConfigurationId: String,
        targetPosDeviceId: String?
    ): CommerceRemoteTerminalTarget {
        val deviceId = targetPosDeviceId?.trim()?.takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("Poynt terminal target is required")
        val organization = organizationId.trim().takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("Commerce organization is required")
        val integration = integrationConfigurationId.trim().takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("Commerce payment integration is required")

        val device = lookup.device(deviceId)
            ?: throw unavailable()
        if (device.isDeleted || device.revokedAt != null || device.organizationId != organization) {
            throw unavailable()
        }

        val activeBindings = lookup.bindings(deviceId).filterNot { it.isDeleted }
        if (activeBindings.isEmpty()) throw unavailable()

        val matches = activeBindings.filter {
            it.organizationId == organization &&
                it.integrationConfigurationId == integration
        }
        if (matches.size != 1) throw unavailable()

        val binding = matches.single()
        val configuredBusiness = binding.configuredBusinessId?.trim().orEmpty()
        val configuredStore = binding.configuredStoreId?.trim().orEmpty()
        val bindingBusiness = binding.poyntBusinessId.trim()
        val bindingStore = binding.poyntStoreId.trim()
        val terminalId = binding.poyntTerminalId.trim()

        if (binding.storeId != device.storeId ||
            binding.integrationOrganizationId != organization ||
            binding.integrationProvider?.trim()?.uppercase() != "POYNT" ||
            binding.integrationDeleted != false ||
            configuredBusiness.isEmpty() ||
            bindingBusiness.isEmpty() ||
            bindingBusiness != configuredBusiness ||
            bindingStore.isEmpty() ||
            (configuredStore.isNotEmpty() && bindingStore != configuredStore) ||
            terminalId.isEmpty()) {
            throw unavailable()
        }

        return CommerceRemoteTerminalTarget(bindingBusiness, bindingStore, terminalId)
    }

    private fun unavailable() = BadRequestException("Registered Poynt terminal is unavailable")
}

val RejectingPoyntTerminalBindingResolver = PoyntTerminalBindingResolver { _, _, _ ->
    throw BadRequestException("Poynt terminal binding resolver is unavailable")
}
