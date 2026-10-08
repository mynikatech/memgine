package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCredentialResolver
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntTokenService
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.IntegrationConfigurationWriteDto
import com.mynikatech.memgine.net.dto.OrganizationPoyntPaymentSummaryDto
import com.mynikatech.memgine.net.dto.PlatformPoyntPaymentDto
import com.mynikatech.memgine.net.dto.PlatformPoyntPaymentWriteDto
import com.mynikatech.memgine.net.dto.PoyntCredentialProfileDto
import com.mynikatech.memgine.net.dto.PoyntStoreDiagnosticDto
import com.mynikatech.memgine.net.dto.PoyntDeviceDiagnosticDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class PlatformPoyntPaymentRow(
    var organizationId: String = "", var organizationName: String = "",
    var integrationConfigurationId: String = "", var integrationName: String = "",
    var provider: String = "",
    var integrationTypeId: String = "", var integrationStatusId: String = "",
    var integrationStatus: String = "", var integrationVersionNo: Int = 1,
    var applicationId: String? = null,
    var providerBusinessId: String? = null, var providerStoreId: String? = null,
    var merchantCurrencyCode: String? = null, var credentialProfileId: String? = null,
    var credentialStatus: String = "NOT_CONFIGURED",
    var connectionStatus: String = "NOT_TESTED", var lastVerifiedAt: String? = null,
    var verificationMessage: String? = null, var versionNo: Int = 1
)

data class PoyntCredentialProfileRow(
    var credentialProfileId: String = "",
    var displayName: String = ""
)

interface PlatformPoyntPaymentSql {
    @SqlQuery("SELECT * FROM platform_list_payment_integrations(:actorUserId)")
    @RegisterBeanMapper(PlatformPoyntPaymentRow::class)
    fun list(@Bind("actorUserId") actorUserId: String): List<PlatformPoyntPaymentRow>

    @SqlQuery("SELECT * FROM platform_get_poynt_payment_configuration(:integrationId, :actorUserId)")
    @RegisterBeanMapper(PlatformPoyntPaymentRow::class)
    fun get(@Bind("integrationId") integrationId: String, @Bind("actorUserId") actorUserId: String): PlatformPoyntPaymentRow?

    @SqlQuery("SELECT platform_get_poynt_backend_credential_reference(:integrationId, :actorUserId)")
    fun credentialReference(@Bind("integrationId") integrationId: String, @Bind("actorUserId") actorUserId: String): String

    @SqlQuery("SELECT * FROM platform_list_poynt_credential_profiles(:actorUserId)")
    @RegisterBeanMapper(PoyntCredentialProfileRow::class)
    fun credentialProfiles(@Bind("actorUserId") actorUserId: String): List<PoyntCredentialProfileRow>

    @SqlQuery("""SELECT platform_save_payment_integration_shell(
        :organizationId, :id, :integrationName, :integrationTypeId, :provider,
        :integrationStatusId, :versionNo, :actorUserId, :create)""")
    fun saveIntegrationShell(
        @Bind("organizationId") organizationId: String,
        @Bind("id") id: String,
        @Bind("integrationName") integrationName: String,
        @Bind("integrationTypeId") integrationTypeId: String,
        @Bind("provider") provider: String,
        @Bind("integrationStatusId") integrationStatusId: String,
        @Bind("versionNo") versionNo: Int,
        @Bind("actorUserId") actorUserId: String,
        @Bind("create") create: Boolean
    ): Boolean

    @SqlQuery("SELECT platform_save_poynt_payment_configuration(:integrationId, :applicationId, :businessId, :storeId, :credentialProfileId, :currency, :versionNo, :actorUserId)")
    fun save(@Bind("integrationId") integrationId: String, @Bind("applicationId") applicationId: String, @Bind("businessId") businessId: String, @Bind("storeId") storeId: String?, @Bind("credentialProfileId") credentialProfileId: String, @Bind("currency") currency: String, @Bind("versionNo") versionNo: Int, @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT platform_record_poynt_payment_verification(:integrationId, :credentialStatus, :connectionStatus, :message, :actorUserId)")
    fun record(@Bind("integrationId") integrationId: String, @Bind("credentialStatus") credentialStatus: String, @Bind("connectionStatus") connectionStatus: String, @Bind("message") message: String, @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT platform_record_poynt_credential_status(:integrationId, :credentialStatus, :actorUserId)")
    fun recordCredentialStatus(@Bind("integrationId") integrationId: String, @Bind("credentialStatus") credentialStatus: String, @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT * FROM organization_get_poynt_payment_summaries(:organizationId, :actorUserId)")
    @RegisterBeanMapper(PlatformPoyntPaymentRow::class)
    fun summaries(@Bind("organizationId") organizationId: String, @Bind("actorUserId") actorUserId: String): List<PlatformPoyntPaymentRow>
}

class PlatformPoyntPaymentService(
    private val sql: PlatformPoyntPaymentSql,
    private val credentials: PoyntCredentialResolver,
    private val tokens: PoyntTokenService,
    private val transport: PoyntHttpTransport,
    private val environment: String
) {
    private val integrationPolicy = PlatformPaymentIntegrationPolicy()

    fun list(actorUserId: String) = sql.list(actorUserId).map(::dto)

    fun credentialProfiles(actorUserId: String): List<PoyntCredentialProfileDto> =
        sql.credentialProfiles(actorUserId).map { PoyntCredentialProfileDto(it.credentialProfileId, it.displayName) }

    fun saveIntegrationShell(
        organizationId: String,
        request: IntegrationConfigurationWriteDto,
        create: Boolean,
        actorUserId: String
    ): PlatformPoyntPaymentDto {
        val provider = integrationPolicy.requireSupported(request.integrationTypeId, request.provider)
        if (request.id.isBlank() || request.id.length > 40 ||
            request.integrationName.isBlank() || request.integrationName.length > 100 ||
            request.integrationStatusId.isBlank() || request.versionNo < 1) {
            throw BadRequestException("Invalid payment integration shell")
        }
        sql.saveIntegrationShell(
            organizationId,
            request.id,
            request.integrationName.trim(),
            request.integrationTypeId,
            provider,
            request.integrationStatusId,
            request.versionNo,
            actorUserId,
            create
        )
        return refreshed(request.id, actorUserId)
    }
    private fun parseDevices(
        body: String
    ): List<PoyntDeviceDiagnosticDto> = try {

        val root = Json.parseToJsonElement(body).jsonObject

        val devices =
            (root["storeDevices"] as? JsonArray)
                ?: return emptyList()

        devices.mapNotNull { element ->
            val device =
                element as? JsonObject
                    ?: return@mapNotNull null

            val deviceId =
                device.string("deviceId")
                    ?: return@mapNotNull null

            PoyntDeviceDiagnosticDto(
                deviceId = deviceId,
                name = device.string("name"),
                serialNumber = device.string("serialNumber"),
                externalTerminalId =
                    device.string("externalTerminalId"),
                storeId = device.string("storeId"),
                status = device.string("status"),
                type = device.string("type"),
                lastSeenAt = device.string("lastSeenAt")
            )
        }
    } catch (_: Exception) {
        throw BadRequestException(
            "Poynt devices response was invalid"
        )
    }

    fun save(integrationId: String, request: PlatformPoyntPaymentWriteDto, actorUserId: String): PlatformPoyntPaymentDto {
        if (request.credentialProfileId.isBlank()) throw BadRequestException("Poynt credential profile is required")
        sql.save(integrationId, request.applicationId.trim(), request.providerBusinessId.trim(), request.providerStoreId?.trim(), request.credentialProfileId.trim(), request.merchantCurrencyCode.trim().uppercase(), request.versionNo, actorUserId)
        val credentialReference = sql.credentialReference(integrationId, actorUserId)
        sql.recordCredentialStatus(integrationId, credentialStatus(credentialReference), actorUserId)
        return refreshed(integrationId, actorUserId)
    }

    /** Verifies Cloud App authentication only. Merchant/store validation requires a supported Poynt API. */
    fun verify(integrationId: String, actorUserId: String): PlatformPoyntPaymentDto {
        val row = sql.get(integrationId, actorUserId) ?: throw BadRequestException("Poynt payment configuration not found")
        val credentialReference = sql.credentialReference(integrationId, actorUserId)
        val credentialStatus = credentialStatus(credentialReference)
        if (credentialStatus != "CONFIGURED") {
            sql.record(integrationId, credentialStatus, "FAILED", "Credentials could not be verified", actorUserId)
            return refreshed(integrationId, actorUserId)
        }
        return try {
            tokens.token(PoyntCatalogConfiguration(row.integrationConfigurationId, row.organizationId, row.applicationId.orEmpty(), row.providerBusinessId.orEmpty(), row.providerStoreId, credentialReference, row.merchantCurrencyCode.orEmpty(), null))
            sql.record(integrationId, "CONFIGURED", "VERIFIED", "Poynt authentication verified", actorUserId)
            refreshed(integrationId, actorUserId)
        } catch (_: Exception) {
            sql.record(integrationId, "CONFIGURED", "FAILED", "Poynt connection verification failed", actorUserId)
            refreshed(integrationId, actorUserId)
        }
    }

    fun summaries(organizationId: String, actorUserId: String): List<OrganizationPoyntPaymentSummaryDto> =
        sql.summaries(organizationId, actorUserId).map {
            OrganizationPoyntPaymentSummaryDto(it.integrationConfigurationId, it.integrationName, it.integrationStatus, it.providerBusinessId, it.providerStoreId, it.merchantCurrencyCode, it.credentialStatus, it.connectionStatus, it.lastVerifiedAt)
        }

    /** Temporary LOCAL/DEV operational diagnostic. It never persists or returns sensitive provider data. */
    fun storesDiagnostic(integrationId: String, actorUserId: String): List<PoyntStoreDiagnosticDto> {
        if (environment.lowercase() !in setOf("local", "dev", "development")) {
            throw BadRequestException("Poynt stores diagnostic is unavailable in this environment")
        }
        val row = sql.get(integrationId, actorUserId)
            ?: throw BadRequestException("Poynt payment configuration not found")
        val businessId = row.providerBusinessId?.trim()?.takeIf { it.isNotEmpty() }
           ?: throw BadRequestException("Poynt Business ID is not configured")
        //val businessId = "41413bb9-379c-45a7-aad4-f9ab128b6e26"
        val credentialReference = sql.credentialReference(integrationId, actorUserId)
        val configuration = PoyntCatalogConfiguration(
            row.integrationConfigurationId, row.organizationId, row.applicationId.orEmpty(), businessId,
            row.providerStoreId, credentialReference, row.merchantCurrencyCode.orEmpty(), null
        )
        repeat(2) { attempt ->
            val token = tokens.token(configuration)
            val response = transport.get(transport.storesUri(businessId), "${token.tokenType} ${token.value}")
            if (response.statusCode in 200..299) return parseStores(response.body)
            if (response.statusCode == 401 && attempt == 0) {
                tokens.invalidate(configuration.integrationConfigurationId)
                return@repeat
            }
            throw BadRequestException("Poynt stores request failed (HTTP ${response.statusCode})")
           
        }
        throw BadRequestException("Poynt stores request was not authorized")
    }
    
    /** Temporary LOCAL/DEV operational diagnostic. Returns only non-sensitive terminal identity fields. */
        fun devicesDiagnostic(
            integrationId: String,
            storeId: String,
            actorUserId: String
        ): List<PoyntDeviceDiagnosticDto> {
            if (environment.lowercase() !in setOf("local", "dev", "development")) {
                throw BadRequestException(
                    "Poynt devices diagnostic is unavailable in this environment"
                )
            }

            val row = sql.get(integrationId, actorUserId)
                ?: throw BadRequestException(
                    "Poynt payment configuration not found"
                )

            val businessId = row.providerBusinessId
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?: throw BadRequestException(
                    "Poynt Business ID is not configured"
                )

            val providerStoreId = storeId.trim().takeIf { it.isNotEmpty() }
                ?: throw BadRequestException(
                    "Poynt Store ID is required"
                )

            val credentialReference =
                sql.credentialReference(integrationId, actorUserId)

            val configuration = PoyntCatalogConfiguration(
                row.integrationConfigurationId,
                row.organizationId,
                row.applicationId.orEmpty(),
                businessId,
                providerStoreId,
                credentialReference,
                row.merchantCurrencyCode.orEmpty(),
                null
            )

            repeat(2) { attempt ->
                val token = tokens.token(configuration)

                val response = transport.get(
                    transport.storeUri(
                        businessId,
                        providerStoreId
                    ),
                    "${token.tokenType} ${token.value}"
                )

                if (response.statusCode in 200..299) {
                    return parseDevices(response.body)
                }

                if (response.statusCode == 401 && attempt == 0) {
                    tokens.invalidate(
                        configuration.integrationConfigurationId
                    )
                    return@repeat
                }

                throw BadRequestException(
                    "Poynt devices request failed " +
                        "(HTTP ${response.statusCode}): " +
                        response.body.take(1500)
                )
            }

            throw BadRequestException(
                "Poynt devices request was not authorized"
            )
        }

    private fun refreshed(integrationId: String, actorUserId: String): PlatformPoyntPaymentDto =
        list(actorUserId).firstOrNull { it.integrationConfigurationId == integrationId }
            ?: throw BadRequestException("Payment integration was not saved")

    private fun credentialStatus(reference: String?): String = try {
        credentials.resolve(reference?.takeIf { it.isNotBlank() } ?: throw IllegalArgumentException())
        "CONFIGURED"
    } catch (_: Exception) {
        "VERIFICATION_UNAVAILABLE"
    }

    private fun dto(row: PlatformPoyntPaymentRow): PlatformPoyntPaymentDto {
        return PlatformPoyntPaymentDto(
            row.organizationId, row.organizationName, row.integrationConfigurationId, row.integrationName,
            row.provider,
            row.integrationTypeId, row.integrationStatusId, row.integrationStatus, row.integrationVersionNo,
            row.applicationId, row.providerBusinessId, row.providerStoreId,
            row.merchantCurrencyCode, row.credentialProfileId, row.credentialStatus, row.connectionStatus,
            row.lastVerifiedAt,
            row.versionNo
        )
    }

    private fun parseStores(body: String): List<PoyntStoreDiagnosticDto> = try {
        val root = Json.parseToJsonElement(body)
        val stores = when (root) {
            is JsonArray -> root
            is JsonObject -> (root["stores"] ?: root["items"] ?: root["data"])?.jsonArray
                ?: throw IllegalArgumentException()
            else -> throw IllegalArgumentException()
        }
        stores.mapNotNull { element ->
            val store = element as? JsonObject ?: return@mapNotNull null
            val id = store.string("id") ?: return@mapNotNull null
            PoyntStoreDiagnosticDto(
                id = id,
                name = store.string("name"),
                displayName = store.string("displayName"),
                status = store.string("status"),
                address = store.address()
            )
        }
    } catch (_: Exception) {
        throw BadRequestException("Poynt stores response was invalid")
    }

    private fun JsonObject.string(name: String): String? =
        (this[name] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

    private fun JsonObject.address(): String? {
        val value = this["address"] as? JsonObject ?: return null
        return listOfNotNull(value.string("line1"), value.string("line2"), value.string("city"), value.string("state"), value.string("postalCode"), value.string("country"))
            .joinToString(", ").takeIf { it.isNotEmpty() }
    }
}

internal class PlatformPaymentIntegrationPolicy {
    fun requireSupported(integrationTypeId: String, provider: String): String {
        if (integrationTypeId != "integration-type-pos") {
            throw BadRequestException("Unsupported payment integration type")
        }
        val normalized = provider.trim().uppercase()
        if (normalized != "POYNT") {
            throw BadRequestException("Unsupported payment provider")
        }
        return normalized
    }
}
