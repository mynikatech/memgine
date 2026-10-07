package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCredentialResolver
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntTokenService
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.IntegrationConfigurationWriteDto
import com.mynikatech.memgine.net.dto.OrganizationPoyntPaymentSummaryDto
import com.mynikatech.memgine.net.dto.PlatformPoyntPaymentDto
import com.mynikatech.memgine.net.dto.PlatformPoyntPaymentWriteDto
import com.mynikatech.memgine.net.dto.PoyntCredentialProfileDto
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
    private val tokens: PoyntTokenService
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
