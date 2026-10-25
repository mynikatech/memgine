package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntTokenService
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.PoyntOperationalStoreDto
import com.mynikatech.memgine.net.dto.PoyntOperationalStoresDto
import com.mynikatech.memgine.net.dto.PoyntOperationalTerminalDto
import com.mynikatech.memgine.net.dto.PoyntOperationalTerminalsDto
import com.mynikatech.memgine.net.dto.PoyntStoreCatalogConfigurationDto
import com.mynikatech.memgine.net.dto.PoyntStoreCatalogConfigurationsDto
import com.mynikatech.memgine.net.dto.PoyntStoreTerminalAssignmentDto
import com.mynikatech.memgine.net.dto.PoyntStoreTerminalAssignmentWriteDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class PoyntOperationalConfigurationRow(
    var organizationId: String = "",
    var integrationConfigurationId: String = "",
    var applicationId: String = "",
    var providerBusinessId: String = "",
    var credentialSecretReference: String = "",
    var merchantCurrencyCode: String = ""
)

data class PoyntStoreCatalogConfigurationRow(
    var storeId: String = "",
    var storeName: String = "",
    var poyntStoreId: String? = null,
    var effectiveCatalogId: String? = null,
    var effectiveCatalogName: String? = null,
    var configurationStatus: String = "NOT_CONFIGURED"
)

interface PoyntOperationalDiscoverySql {
    @SqlQuery("SELECT * FROM organization_get_poynt_operational_configuration(:organizationId,:integrationId,:actorUserId)")
    @RegisterBeanMapper(PoyntOperationalConfigurationRow::class)
    fun configuration(@Bind("organizationId") organizationId: String, @Bind("integrationId") integrationId: String, @Bind("actorUserId") actorUserId: String): PoyntOperationalConfigurationRow?

    @SqlQuery("SELECT * FROM organization_list_poynt_store_catalog_configurations(:organizationId,:integrationId,:actorUserId)")
    @RegisterBeanMapper(PoyntStoreCatalogConfigurationRow::class)
    fun configurations(@Bind("organizationId") organizationId: String, @Bind("integrationId") integrationId: String, @Bind("actorUserId") actorUserId: String): List<PoyntStoreCatalogConfigurationRow>

    @SqlQuery("SELECT organization_save_poynt_store_terminal_assignment(:organizationId,:integrationId,:storeId,:poyntStoreId,:catalogId,:catalogName,:terminalId,:deviceName,:actorUserId,CAST(:verifiedBindingsJson AS jsonb))")
    fun save(@Bind("organizationId") organizationId: String, @Bind("integrationId") integrationId: String, @Bind("storeId") storeId: String, @Bind("poyntStoreId") poyntStoreId: String, @Bind("catalogId") catalogId: String, @Bind("catalogName") catalogName: String?, @Bind("terminalId") terminalId: String, @Bind("deviceName") deviceName: String, @Bind("actorUserId") actorUserId: String, @Bind("verifiedBindingsJson") verifiedBindingsJson: String): String
}

class PoyntOperationalDiscoveryService(
    private val sql: PoyntOperationalDiscoverySql,
    private val terminalBindings: OrganizationPoyntTerminalBindingService,
    private val tokens: PoyntTokenService,
    private val transport: PoyntHttpTransport
) {
    fun stores(organizationId: String, integrationId: String, actorUserId: String): PoyntOperationalStoresDto {
        val configuration = configuration(organizationId, integrationId, actorUserId)
        val body = get(configuration, transport.storesUri(configuration.businessId))
        return PoyntOperationalStoresDto(parseStores(body))
    }

    fun terminals(organizationId: String, integrationId: String, poyntStoreId: String, actorUserId: String): PoyntOperationalTerminalsDto {
        val store = poyntStoreId.trim().takeIf { it.isNotEmpty() } ?: throw BadRequestException("Poynt Store ID is required")
        val configuration = configuration(organizationId, integrationId, actorUserId)
        return PoyntOperationalTerminalsDto(
            discoverTerminals(configuration, store).map(DiscoveredTerminal::dto)
        )
    }

    fun configurations(organizationId: String, integrationId: String, actorUserId: String): PoyntStoreCatalogConfigurationsDto {
        configuration(organizationId, integrationId, actorUserId)
        val bindings = terminalBindings.list(organizationId, integrationId, actorUserId).groupBy { it.storeId }
        return PoyntStoreCatalogConfigurationsDto(sql.configurations(organizationId, integrationId, actorUserId).map { row ->
            PoyntStoreCatalogConfigurationDto(row.storeId, row.storeName, row.poyntStoreId, row.effectiveCatalogId, row.effectiveCatalogName, row.configurationStatus, bindings[row.storeId].orEmpty())
        })
    }

    fun save(organizationId: String, integrationId: String, request: PoyntStoreTerminalAssignmentWriteDto, actorUserId: String): PoyntStoreTerminalAssignmentDto {
        val configuration = configuration(organizationId, integrationId, actorUserId)
        val memgineStoreId = request.storeId.trim().takeIf { it.isNotEmpty() && it.length <= 64 }
            ?: throw BadRequestException("Memgine Store ID is required")
        val storeId = request.poyntStoreId.trim().takeIf { it.isNotEmpty() } ?: throw BadRequestException("Poynt Store ID is required")
        val terminalId = request.terminalId.trim().takeIf { it.isNotEmpty() } ?: throw BadRequestException("Poynt terminal ID is required")
        val terminals = discoverTerminals(configuration, storeId)
        val terminal = terminals.singleOrNull { it.bindingTerminalId == terminalId }
            ?: throw BadRequestException("Poynt terminal is not available for the selected Poynt Store")
        if (!terminal.configurationEligible || terminal.catalogId.isNullOrBlank()) {
            throw BadRequestException(terminal.ineligibilityReason ?: "Poynt terminal does not have a verified catalog assignment")
        }
        val verifiedCatalog = verifyCatalog(configuration, terminal.catalogId)
        val existingBindings = terminalBindings.list(organizationId, integrationId, actorUserId)
            .filter { it.active && it.storeId == memgineStoreId }
        val verifiedBindings = existingBindings.map { binding ->
            if (binding.poyntBusinessId != configuration.businessId || binding.poyntStoreId != storeId) {
                throw BadRequestException("Existing terminal bindings require reconciliation before catalog configuration")
            }
            val existingTerminal = terminals.singleOrNull { it.bindingTerminalId == binding.poyntTerminalId }
                ?: throw BadRequestException("Existing terminal bindings require reconciliation before catalog configuration")
            if (!existingTerminal.configurationEligible || existingTerminal.catalogId.isNullOrBlank()) {
                throw BadRequestException("Existing terminal bindings require reconciliation before catalog configuration")
            }
            val existingCatalog = verifyCatalog(configuration, existingTerminal.catalogId)
            if (existingCatalog.id != verifiedCatalog.id) {
                throw BadRequestException("Existing terminal bindings require reconciliation before catalog configuration")
            }
            VerifiedBindingSnapshot(
                binding.bindingId,
                binding.posDeviceId,
                binding.poyntTerminalId,
                binding.poyntBusinessId,
                binding.poyntStoreId,
                existingCatalog.id,
                binding.active
            )
        }

        val bindingId = sql.save(
            organizationId,
            integrationId,
            memgineStoreId,
            storeId,
            verifiedCatalog.id,
            verifiedCatalog.name,
            terminalId,
            terminal.name?.trim().takeUnless { it.isNullOrEmpty() } ?: terminalId,
            actorUserId,
            Json.encodeToString(verifiedBindings)
        )
        return PoyntStoreTerminalAssignmentDto(bindingId)
    }

    private fun configuration(organizationId: String, integrationId: String, actorUserId: String): PoyntCatalogConfiguration {
        val row = sql.configuration(validId(organizationId), validId(integrationId), actorUserId)
            ?: throw BadRequestException("Verified Poynt integration is not available")
        return PoyntCatalogConfiguration(row.integrationConfigurationId, row.organizationId, row.applicationId, row.providerBusinessId, null, row.credentialSecretReference, row.merchantCurrencyCode, null)
    }

    private fun get(configuration: PoyntCatalogConfiguration, uri: java.net.URI): String {
        repeat(2) { attempt ->
            val token = tokens.token(configuration)
            val response = transport.get(uri, "${token.tokenType} ${token.value}")
            if (response.statusCode in 200..299) return response.body
            if (response.statusCode == 401 && attempt == 0) {
                tokens.invalidate(configuration.integrationConfigurationId)
                return@repeat
            }
            throw BadRequestException("Poynt operational discovery failed (HTTP ${response.statusCode})")
        }
        throw BadRequestException("Poynt operational discovery was not authorized")
    }

    private fun discoverTerminals(
        configuration: PoyntCatalogConfiguration,
        poyntStoreId: String
    ): List<DiscoveredTerminal> {
        val stores = parseStores(get(configuration, transport.storesUri(configuration.businessId)))
        if (stores.none { it.id == poyntStoreId }) {
            throw BadRequestException("Poynt Store is not available for this integration")
        }
        return parseTerminals(
            get(configuration, transport.storeUri(configuration.businessId, poyntStoreId)),
            poyntStoreId
        )
    }

    private fun verifyCatalog(
        configuration: PoyntCatalogConfiguration,
        assignedCatalogId: String
    ): VerifiedCatalog {
        val expectedId = assignedCatalogId.trim().takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("Poynt terminal does not have a verified catalog assignment")
        val root = try {
            Json.parseToJsonElement(
                get(configuration, transport.catalogFullUri(configuration.businessId, expectedId))
            ).jsonObject
        } catch (_: BadRequestException) {
            throw BadRequestException("Poynt terminal catalog is unavailable")
        } catch (_: Exception) {
            throw BadRequestException("Poynt terminal catalog response was invalid")
        }
        val identities = listOfNotNull(root.string("id"), root.string("catalogId")).toSet()
        if (identities.size != 1 || identities.single() != expectedId) {
            throw BadRequestException("Poynt terminal catalog identity could not be verified")
        }
        return VerifiedCatalog(expectedId, root.string("name") ?: root.string("catalogName"))
    }

    private fun parseStores(body: String): List<PoyntOperationalStoreDto> = try {
        val root = Json.parseToJsonElement(body)
        val stores = when (root) {
            is JsonArray -> root
            is JsonObject -> (root["stores"] ?: root["items"] ?: root["data"])?.jsonArray ?: throw IllegalArgumentException()
            else -> throw IllegalArgumentException()
        }
        stores.mapNotNull { element ->
            val store = element as? JsonObject ?: return@mapNotNull null
            val id = store.string("id") ?: return@mapNotNull null
            PoyntOperationalStoreDto(id, store.string("name") ?: store.string("displayName"))
        }
    } catch (_: Exception) { throw BadRequestException("Poynt stores response was invalid") }

    private fun parseTerminals(body: String, selectedStoreId: String): List<DiscoveredTerminal> = try {
        val root = Json.parseToJsonElement(body).jsonObject
        val devices = root["storeDevices"]?.jsonArray ?: root["devices"]?.jsonArray ?: throw IllegalArgumentException()
        val responseStoreId = root.string("storeId") ?: root.string("merchantStoreId")
        devices.mapNotNull { element ->
            val device = element as? JsonObject ?: return@mapNotNull null
            // PoyntCloudMessage names this field deviceId. The Poynt resource id and an
            // external terminal identifier are distinct and cannot replace it.
            val deviceId = device.string("deviceId") ?: return@mapNotNull null
            val resourceId = device.string("id")
            val externalTerminalId = device.string("externalTerminalId")
            val deviceStoreId = device.string("storeId") ?: device.string("merchantStoreId")
            val catalog = device["catalog"] as? JsonObject ?: device["productCatalog"] as? JsonObject
            val catalogIds = linkedSetOf<String>().apply {
                device.string("catalogId")?.let(::add)
                device.string("productCatalogId")?.let(::add)
                catalog?.string("id")?.let(::add)
                listOf("catalogIds", "productCatalogIds", "catalogs", "productCatalogs").forEach { key ->
                    (device[key] as? JsonArray).orEmpty().forEach { value ->
                        when (value) {
                            is JsonObject -> value.string("id")?.let(::add)
                            else -> (value as? kotlinx.serialization.json.JsonPrimitive)
                                ?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }?.let(::add)
                        }
                    }
                }
            }
            val catalogId = catalogIds.singleOrNull()
            val catalogName = device.string("catalogName") ?: catalog?.string("name")
            val reason = when {
                responseStoreId != null && responseStoreId != selectedStoreId -> "Poynt Store response did not match the selected Store"
                deviceStoreId != null && deviceStoreId != selectedStoreId -> "Poynt terminal belongs to another Poynt Store"
                catalogIds.size > 1 -> "Poynt terminal exposes multiple catalog assignments"
                catalogId.isNullOrBlank() -> "Poynt terminal catalog assignment was not returned"
                else -> null
            }
            DiscoveredTerminal(
                deviceId,
                resourceId,
                externalTerminalId,
                device.string("deviceName") ?: device.string("name") ?: device.string("displayName") ?: device.string("terminalName"),
                selectedStoreId,
                catalogId,
                catalogName,
                reason == null,
                reason
            )
        }
    } catch (_: Exception) { throw BadRequestException("Poynt terminal response was invalid") }

    private fun JsonObject.string(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
    private fun validId(value: String): String = value.trim().takeIf { it.isNotEmpty() && it.length <= 64 } ?: throw BadRequestException("Invalid id")

    private data class VerifiedCatalog(val id: String, val name: String?)

    @Serializable
    private data class VerifiedBindingSnapshot(
        val bindingId: String,
        val posDeviceId: String,
        val terminalId: String,
        val poyntBusinessId: String,
        val poyntStoreId: String,
        val catalogId: String,
        val active: Boolean
    )

    private data class DiscoveredTerminal(
        val bindingTerminalId: String,
        val providerResourceId: String?,
        val externalTerminalId: String?,
        val name: String?,
        val storeId: String,
        val catalogId: String?,
        val catalogName: String?,
        val configurationEligible: Boolean,
        val ineligibilityReason: String?
    ) {
        fun dto() = PoyntOperationalTerminalDto(
            bindingTerminalId,
            name,
            storeId,
            catalogId,
            catalogName,
            configurationEligible,
            ineligibilityReason
        )
    }
}
