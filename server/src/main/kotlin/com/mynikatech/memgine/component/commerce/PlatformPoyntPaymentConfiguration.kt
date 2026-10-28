package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.component.activityaudit.ActivityAuditEvent
import com.mynikatech.memgine.component.activityaudit.ActivityAuditService
import com.mynikatech.memgine.component.activityaudit.ActivityEventType
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
import com.mynikatech.memgine.net.dto.PoyntApplePayRegistrationDiagnosticDto
import com.mynikatech.memgine.net.dto.PoyntApplePayReadinessDto
import com.mynikatech.memgine.net.dto.PoyntApplePayRegistrationResultDto
import com.mynikatech.memgine.net.dto.PoyntApplePayArtifactDto
import com.mynikatech.memgine.net.dto.PoyntApplePayConfigurationDto
import com.mynikatech.memgine.net.dto.PoyntStoreDiagnosticDto
import com.mynikatech.memgine.net.dto.PoyntDeviceDiagnosticDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import java.net.URI
import java.security.MessageDigest
import java.util.UUID

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

data class PoyntApplePayArtifactRow(
    var artifactId: String = "",
    var sha256: String = "",
    var s3Key: String = "",
    var status: String = "CANDIDATE",
    var retrievedAt: String? = null,
    var lastCheckedAt: String? = null
)

data class PoyntApplePayRegistrationStateRow(
    var status: String = "",
    var lastVerifiedAt: String? = null
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

    @SqlQuery("SELECT * FROM platform_find_poynt_apple_pay_artifact(:providerEnvironment, :businessId, :actorUserId)")
    @RegisterBeanMapper(PoyntApplePayArtifactRow::class)
    fun findApplePayArtifact(
        @Bind("providerEnvironment") providerEnvironment: String,
        @Bind("businessId") businessId: String,
        @Bind("actorUserId") actorUserId: String
    ): PoyntApplePayArtifactRow?

    @SqlQuery("SELECT platform_save_poynt_apple_pay_artifact(:artifactId, :providerEnvironment, :businessId, :sha256, :s3Key, :actorUserId)")
    fun saveApplePayArtifact(
        @Bind("artifactId") artifactId: String,
        @Bind("providerEnvironment") providerEnvironment: String,
        @Bind("businessId") businessId: String,
        @Bind("sha256") sha256: String,
        @Bind("s3Key") s3Key: String,
        @Bind("actorUserId") actorUserId: String
    ): String

    @SqlQuery("SELECT * FROM platform_get_poynt_apple_pay_artifact(:artifactId, :providerEnvironment, :businessId, :actorUserId)")
    @RegisterBeanMapper(PoyntApplePayArtifactRow::class)
    fun getApplePayArtifact(
        @Bind("artifactId") artifactId: String,
        @Bind("providerEnvironment") providerEnvironment: String,
        @Bind("businessId") businessId: String,
        @Bind("actorUserId") actorUserId: String
    ): PoyntApplePayArtifactRow?

    @SqlQuery("SELECT platform_approve_poynt_apple_pay_artifact(:artifactId, :actorUserId)")
    fun approveApplePayArtifact(@Bind("artifactId") artifactId: String, @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT platform_record_poynt_apple_pay_hosting(:checkoutHostname, :artifactId, :status, :actorUserId)")
    fun recordApplePayHosting(
        @Bind("checkoutHostname") checkoutHostname: String,
        @Bind("artifactId") artifactId: String,
        @Bind("status") status: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT platform_record_poynt_apple_pay_registration(:providerEnvironment, :businessId, :checkoutHostname, :status, :httpStatus, :actorUserId)")
    fun recordApplePayRegistration(
        @Bind("providerEnvironment") providerEnvironment: String,
        @Bind("businessId") businessId: String,
        @Bind("checkoutHostname") checkoutHostname: String,
        @Bind("status") status: String,
        @Bind("httpStatus") httpStatus: Int?,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT platform_set_poynt_apple_pay_capability(:integrationId, :enabled, :actorUserId)")
    fun setApplePayCapability(
        @Bind("integrationId") integrationId: String,
        @Bind("enabled") enabled: Boolean,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT platform_poynt_apple_pay_capability_enabled(:integrationId, :actorUserId)")
    fun applePayCapabilityEnabled(
        @Bind("integrationId") integrationId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT * FROM platform_get_poynt_apple_pay_registration(:providerEnvironment, :businessId, :checkoutHostname, :actorUserId)")
    @RegisterBeanMapper(PoyntApplePayRegistrationStateRow::class)
    fun applePayRegistrationState(
        @Bind("providerEnvironment") providerEnvironment: String,
        @Bind("businessId") businessId: String,
        @Bind("checkoutHostname") checkoutHostname: String,
        @Bind("actorUserId") actorUserId: String
    ): PoyntApplePayRegistrationStateRow?
}

class PlatformPoyntPaymentService(
    private val sql: PlatformPoyntPaymentSql,
    private val credentials: PoyntCredentialResolver,
    private val tokens: PoyntTokenService,
    private val transport: PoyntHttpTransport,
    private val environment: String,
    private val diagnosticsEnabled: Boolean = false,
    private val applePayRegistrationEnabled: Boolean = false,
    private val checkoutUrl: String = "",
    private val associationInstallPath: String = "",
    private val activityAudit: ActivityAuditService? = null,
    private val associationVerifier: ApplePayAssociationVerifier = HttpApplePayAssociationVerifier(),
    private val applePayStorage: PoyntApplePayArtifactStorage? = null,
    private val providerEnvironment: String = "",
    private val applePayArtifactPrefix: String = "",
    private val applePayApprovedKey: String = ""
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
        if (!diagnosticsEnabled) {
            throw BadRequestException("Poynt stores diagnostic is disabled")
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

    /**
     * Temporary LOCAL/DEV read-only diagnostic. It intentionally exposes only
     * the provider HTTP status and recognized registration/domain fields.
     */
    fun applePayRegistrationDiagnostic(
        integrationId: String,
        actorUserId: String
    ): PoyntApplePayRegistrationDiagnosticDto {
        if (!diagnosticsEnabled) {
            throw BadRequestException("Poynt Apple Pay registration diagnostic is disabled")
        }
        val row = sql.get(integrationId, actorUserId)
            ?: throw BadRequestException("Poynt payment configuration not found")
        val businessId = row.providerBusinessId?.trim()?.takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("Poynt Business ID is not configured")
        val credentialReference = sql.credentialReference(integrationId, actorUserId)
        val configuration = PoyntCatalogConfiguration(
            row.integrationConfigurationId,
            row.organizationId,
            row.applicationId.orEmpty(),
            businessId,
            row.providerStoreId,
            credentialReference,
            row.merchantCurrencyCode.orEmpty(),
            null
        )

        repeat(2) { attempt ->
            val token = tokens.token(configuration)
            val response = transport.get(
                transport.applePayRegistrationUri(businessId),
                "${token.tokenType} ${token.value}"
            )
            if (response.statusCode == 401 && attempt == 0) {
                tokens.invalidate(configuration.integrationConfigurationId)
                return@repeat
            }
            return parseApplePayRegistration(
                response.statusCode,
                response.body,
                configuredCheckoutDomainOrNull()
            )
        }
        throw BadRequestException("Poynt Apple Pay registration request was not authorized")
    }

    /**
     * LOCAL/DEV-only read-only diagnostic. The returned body is the provider's
     * association file and is intentionally not parsed, logged, or persisted.
     */
    fun applePayDomainAssociationFile(
        integrationId: String,
        actorUserId: String
    ): String {
        if (!diagnosticsEnabled) {
            throw BadRequestException("Poynt Apple Pay domain association diagnostic is disabled")
        }
        val row = sql.get(integrationId, actorUserId)
            ?: throw BadRequestException("Poynt payment configuration not found")
        val businessId = row.providerBusinessId?.trim()?.takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("Poynt Business ID is not configured")
        val credentialReference = sql.credentialReference(integrationId, actorUserId)
        val configuration = PoyntCatalogConfiguration(
            row.integrationConfigurationId,
            row.organizationId,
            row.applicationId.orEmpty(),
            businessId,
            row.providerStoreId,
            credentialReference,
            row.merchantCurrencyCode.orEmpty(),
            null
        )
        repeat(2) { attempt ->
            val token = tokens.token(configuration)
            val response = transport.get(
                transport.applePayDomainAssociationFileUri(businessId),
                "${token.tokenType} ${token.value}"
            )
            if (response.statusCode == 401 && attempt == 0) {
                tokens.invalidate(configuration.integrationConfigurationId)
                return@repeat
            }
            if (response.statusCode == 200) return response.body
            throw BadRequestException(
                "Poynt Apple Pay domain association request failed (HTTP ${response.statusCode})"
            )
        }
        throw BadRequestException("Poynt Apple Pay domain association request was not authorized")
    }

    /**
     * Reads merchant registration and verifies that this integration's exact
     * provider association file matches both the installed and public file.
     */
    fun applePayReadiness(
        integrationId: String,
        actorUserId: String
    ): PoyntApplePayReadinessDto {
        requireApplePayReadinessEnabled()
        return applePayReadiness(applePayContext(integrationId, actorUserId))
    }

    /**
     * Integration-scoped Apple Pay state. Artifact bytes, object locations and
     * credentials never leave the backend.
     */
    fun applePayConfiguration(integrationId: String, actorUserId: String): PoyntApplePayConfigurationDto {
        requireApplePayReadinessEnabled()
        val context = applePayContext(integrationId, actorUserId)
        val artifact = sql.findApplePayArtifact(providerEnvironmentValue(), context.businessId, actorUserId)
        val readiness = applePayReadiness(context)
        val enabled = sql.applePayCapabilityEnabled(context.row.integrationConfigurationId, actorUserId)
        val registration = sql.applePayRegistrationState(
            providerEnvironmentValue(), context.businessId, context.checkoutDomain, actorUserId
        )
        return PoyntApplePayConfigurationDto(
            context.row.integrationConfigurationId,
            context.merchantName.orEmpty(),
            context.businessId,
            providerEnvironmentValue(),
            context.checkoutDomain,
            artifact?.toDto(),
            readiness,
            enabled,
            if (enabled && readiness.status == "READY") "AVAILABLE" else "NOT_AVAILABLE",
            applePayStorage != null,
            applePayRegistrationEnabled,
            registration?.lastVerifiedAt
        )
    }

    /** Reuses verified private S3 evidence when present; otherwise retrieves a new immutable candidate. */
    fun retrieveOrReuseApplePayAssociation(integrationId: String, actorUserId: String): PoyntApplePayArtifactDto {
        requireApplePayReadinessEnabled()
        val context = applePayContext(integrationId, actorUserId)
        val existing = sql.findApplePayArtifact(providerEnvironmentValue(), context.businessId, actorUserId)
        if (existing?.status == "APPROVED" &&
            storage().read(existing.s3Key)?.let { storage().sha256(it) } == existing.sha256
        ) {
            return existing.toDto()
        }
        return fetchAndStoreApplePayAssociation(context, actorUserId)
    }

    /** Explicit Poynt GET. A changed provider response becomes a candidate and never replaces an approved artifact. */
    fun refreshApplePayAssociation(integrationId: String, actorUserId: String): PoyntApplePayArtifactDto {
        requireApplePayReadinessEnabled()
        return fetchAndStoreApplePayAssociation(applePayContext(integrationId, actorUserId), actorUserId)
    }

    fun approveApplePayAssociation(integrationId: String, artifactId: String, actorUserId: String): PoyntApplePayArtifactDto {
        requireApplePayReadinessEnabled()
        val context = applePayContext(integrationId, actorUserId)
        val artifact = sql.getApplePayArtifact(artifactId, providerEnvironmentValue(), context.businessId, actorUserId)
            ?: throw BadRequestException("No Apple Pay association artifact is available")
        sql.approveApplePayArtifact(artifactId, actorUserId)
        return artifact.copy(status = "APPROVED").toDto()
    }

    /**
     * Writes the approved private deployment object and verifies the public
     * endpoint. EC2 activation remains deployment-script controlled; an
     * unverifiable endpoint is persisted as such and is never reported active.
     */
    fun publishAndVerifyApplePayAssociation(integrationId: String, artifactId: String, actorUserId: String): PoyntApplePayReadinessDto {
        requireApplePayReadinessEnabled()
        val context = applePayContext(integrationId, actorUserId)
        val artifact = sql.getApplePayArtifact(artifactId, providerEnvironmentValue(), context.businessId, actorUserId)
            ?: throw BadRequestException("No approved Apple Pay association artifact is available")
        if (artifact.status != "APPROVED") {
            throw BadRequestException("Apple Pay artifact is not approved for this merchant")
        }
        val bytes = storage().read(artifact.s3Key) ?: throw BadRequestException("Apple Pay association artifact is unavailable")
        if (storage().sha256(bytes) != artifact.sha256) throw BadRequestException("Apple Pay association artifact checksum mismatch")
        val approvedKey = approvedKey()
        storage().publish(approvedKey, bytes)
        val evidence = associationVerifier.verify(context.checkoutUrl, associationInstallPath)
        sql.recordApplePayHosting(context.checkoutDomain, artifact.artifactId, evidence.status, actorUserId)
        return applePayReadiness(context)
    }

    fun setApplePayCapability(integrationId: String, enabled: Boolean, actorUserId: String): PoyntApplePayConfigurationDto {
        requireApplePayReadinessEnabled()
        val context = applePayContext(integrationId, actorUserId)
        val readiness = applePayReadiness(context)
        if (enabled && readiness.status != "READY") {
            throw BadRequestException("Apple Pay cannot be enabled until association hosting and merchant registration are ready")
        }
        sql.setApplePayCapability(context.row.integrationConfigurationId, enabled, actorUserId)
        return applePayConfiguration(integrationId, actorUserId).copy(
            capabilityEnabled = enabled,
            effectiveAvailability = if (enabled && readiness.status == "READY") "AVAILABLE" else "NOT_AVAILABLE"
        )
    }

    /** Explicit Platform Admin operation; never called by payment workflows or deployment. */
    fun registerApplePayDomain(
        integrationId: String,
        confirmed: Boolean,
        actorUserId: String
    ): PoyntApplePayRegistrationResultDto {
        requireApplePayRegistrationEnabled()
        if (!confirmed) {
            throw BadRequestException("Explicit Apple Pay registration confirmation is required")
        }

        val context = applePayContext(integrationId, actorUserId)
        val before = applePayReadiness(context)
        if (before.status == "BLOCKED_DOMAIN_ASSOCIATION_CONFLICT") {
            auditApplePayRegistration(context, actorUserId, "BLOCKED_DOMAIN_ASSOCIATION_CONFLICT", null)
            return PoyntApplePayRegistrationResultDto("BLOCKED_DOMAIN_ASSOCIATION_CONFLICT", before)
        }
        if (before.associationStatus != "ASSOCIATION_PUBLIC_VERIFIED" ||
            before.providerAssociationSha256 != before.installedAssociationSha256
        ) {
            auditApplePayRegistration(context, actorUserId, "BLOCKED_ASSOCIATION_NOT_READY", null)
            return PoyntApplePayRegistrationResultDto("BLOCKED_ASSOCIATION_NOT_READY", before)
        }
        if (before.configuredDomainRegistered == true) {
            auditApplePayRegistration(context, actorUserId, "ALREADY_REGISTERED", null)
            return PoyntApplePayRegistrationResultDto("ALREADY_REGISTERED", before)
        }

        val requestId = UUID.randomUUID().toString()
        auditApplePayRegistration(context, actorUserId, "REQUESTED", requestId, requested = true)

        val resultStatus = try {
            val response = postApplePayRegistration(context, requestId)
            when (response.statusCode) {
                in 200..299 -> reconcileRegistration(context, "REGISTRATION_UNCONFIRMED")
                401 -> "PROVIDER_UNAUTHORIZED"
                400 -> "PROVIDER_BAD_REQUEST"
                403 -> "PROVIDER_FORBIDDEN"
                404 -> "PROVIDER_NOT_FOUND_OR_UNSUPPORTED"
                409 -> reconcileRegistration(context, "PROVIDER_CONFLICT")
                429 -> "PROVIDER_RATE_LIMITED"
                in 500..599 -> "PROVIDER_SERVER_ERROR"
                else -> "PROVIDER_HTTP_${response.statusCode}"
            }
        } catch (_: Exception) {
            // A timeout or transport failure is ambiguous. Reconcile with a
            // read only GET; never submit a second registration POST.
            reconcileRegistration(context, "REGISTRATION_UNKNOWN_REQUIRES_RECONCILIATION")
        }

        val after = applePayReadiness(context)
        val finalStatus = if (after.configuredDomainRegistered == true &&
            resultStatus in setOf("REGISTERED", "REGISTERED_RECONCILED", "REGISTRATION_UNCONFIRMED")
        ) {
            "REGISTERED"
        } else {
            resultStatus
        }
        auditApplePayRegistration(context, actorUserId, finalStatus, requestId)
        sql.recordApplePayRegistration(
            providerEnvironmentValue(), context.businessId, context.checkoutDomain,
            finalStatus, after.registrationHttpStatus, actorUserId
        )
        return PoyntApplePayRegistrationResultDto(finalStatus, after)
    }

    private fun fetchAndStoreApplePayAssociation(context: ApplePayContext, actorUserId: String): PoyntApplePayArtifactDto {
        val response = providerAssociationBytes(context)
        if (response.statusCode != 200 || response.body.isEmpty()) {
            throw BadRequestException("Poynt Apple Pay association request failed (HTTP ${response.statusCode})")
        }
        val storage = storage()
        val hash = storage.sha256(response.body)
        val existing = sql.findApplePayArtifact(providerEnvironmentValue(), context.businessId, actorUserId)
        if (existing != null && existing.sha256 == hash) return existing.toDto()
        val key = artifactKey(context, hash)
        storage.writeImmutable(key, response.body)
        val artifactId = sql.saveApplePayArtifact(
            "apple-pay-artifact-${UUID.randomUUID()}", providerEnvironmentValue(), context.businessId,
            hash, key, actorUserId
        )
        return sql.getApplePayArtifact(artifactId, providerEnvironmentValue(), context.businessId, actorUserId)
            ?.toDto() ?: throw BadRequestException("Apple Pay association artifact was not saved")
    }

    private data class ApplePayContext(
        val row: PlatformPoyntPaymentRow,
        val configuration: PoyntCatalogConfiguration,
        val businessId: String,
        val merchantName: String?,
        val checkoutUrl: String,
        val checkoutDomain: String
    )

    private data class ProviderAssociationFile(val httpStatus: Int?, val sha256: String?)

    private fun applePayContext(integrationId: String, actorUserId: String): ApplePayContext {
        val row = sql.get(integrationId, actorUserId)
            ?: throw BadRequestException("Poynt payment configuration not found")
        val businessId = row.providerBusinessId?.trim()?.takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("Poynt Business ID is not configured")
        val merchantName = sql.list(actorUserId)
            .firstOrNull {
                it.integrationConfigurationId == integrationId
            }
            ?.organizationName
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
        val configuredUrl = checkoutUrl.trim().trimEnd('/')
        val checkoutDomain = configuredDomain(configuredUrl)
            ?: throw BadRequestException("Configured checkout URL is invalid")
        val credentialReference = sql.credentialReference(integrationId, actorUserId)
        return ApplePayContext(
            row,
            PoyntCatalogConfiguration(
                row.integrationConfigurationId,
                row.organizationId,
                row.applicationId.orEmpty(),
                businessId,
                row.providerStoreId,
                credentialReference,
                row.merchantCurrencyCode.orEmpty(),
                null
            ),
            businessId,
            merchantName,
            configuredUrl,
            checkoutDomain
        )
    }

    private fun applePayReadiness(context: ApplePayContext): PoyntApplePayReadinessDto {
        val registration = try {
            readApplePayRegistration(context)
        } catch (_: Exception) {
            PoyntApplePayRegistrationDiagnosticDto(httpStatus = 0)
        }
        val evidence = associationVerifier.verify(context.checkoutUrl, associationInstallPath)
        val providerFile = providerAssociationFile(context)
        val configuredDomainRegistered = registration.registeredDomains?.any {
            it.equals(context.checkoutDomain, ignoreCase = true)
        }
        val status = when {
            evidence.status != "ASSOCIATION_PUBLIC_VERIFIED" -> evidence.status
            providerFile.httpStatus != 200 -> "PROVIDER_ASSOCIATION_HTTP_${providerFile.httpStatus ?: "UNAVAILABLE"}"
            providerFile.sha256 != evidence.installedSha256 -> "BLOCKED_DOMAIN_ASSOCIATION_CONFLICT"
            registration.httpStatus == 0 -> "REGISTRATION_PROVIDER_UNAVAILABLE"
            configuredDomainRegistered == true -> "READY"
            configuredDomainRegistered == false -> "NOT_REGISTERED"
            else -> "REGISTRATION_INCONCLUSIVE"
        }
        return PoyntApplePayReadinessDto(
            context.row.integrationConfigurationId,
            context.checkoutDomain,
            status,
            registration.httpStatus,
            configuredDomainRegistered,
            evidence.status,
            providerFile.sha256,
            evidence.installedSha256,
            evidence.publicSha256
        )
    }

    private fun readApplePayRegistration(context: ApplePayContext): PoyntApplePayRegistrationDiagnosticDto {
        repeat(2) { attempt ->
            val token = tokens.token(context.configuration)
            val response = transport.get(
                transport.applePayRegistrationUri(context.businessId),
                "${token.tokenType} ${token.value}"
            )
            if (response.statusCode == 401 && attempt == 0) {
                tokens.invalidate(context.configuration.integrationConfigurationId)
                return@repeat
            }
            return parseApplePayRegistration(response.statusCode, response.body, context.checkoutDomain)
        }
        throw BadRequestException("Poynt Apple Pay registration request was not authorized")
    }

    private fun providerAssociationFile(context: ApplePayContext): ProviderAssociationFile {
        try {
            repeat(2) { attempt ->
                val token = tokens.token(context.configuration)
                val response = transport.getBytes(
                    transport.applePayDomainAssociationFileUri(context.businessId),
                    "${token.tokenType} ${token.value}"
                )
                if (response.statusCode == 401 && attempt == 0) {
                    tokens.invalidate(context.configuration.integrationConfigurationId)
                    return@repeat
                }
                return ProviderAssociationFile(
                    response.statusCode,
                    response.body.takeIf { response.statusCode == 200 }?.let(::sha256)
                )
            }
        } catch (_: Exception) {
            return ProviderAssociationFile(null, null)
        }
        return ProviderAssociationFile(401, null)
    }

    private fun providerAssociationBytes(context: ApplePayContext): com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpBinaryResponse {
        repeat(2) { attempt ->
            val token = tokens.token(context.configuration)
            val response = transport.getBytes(
                transport.applePayDomainAssociationFileUri(context.businessId),
                "${token.tokenType} ${token.value}"
            )
            if (response.statusCode == 401 && attempt == 0) {
                tokens.invalidate(context.configuration.integrationConfigurationId)
                return@repeat
            }
            return response
        }
        throw BadRequestException("Poynt Apple Pay domain association request was not authorized")
    }

    private fun PoyntApplePayArtifactRow.toDto() = PoyntApplePayArtifactDto(
        artifactId, sha256, status, retrievedAt, lastCheckedAt
    )

    private fun providerEnvironmentValue(): String = providerEnvironment.trim().trimEnd('/').takeIf { it.isNotBlank() }
        ?: throw BadRequestException("Poynt provider environment is not configured")

    private fun storage(): PoyntApplePayArtifactStorage = applePayStorage
        ?: throw BadRequestException("Apple Pay private artifact storage is not configured")

    private fun artifactKey(context: ApplePayContext, sha256: String): String {
        val prefix = applePayArtifactPrefix.trim().trim('/').takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Apple Pay artifact prefix is not configured")
        return "$prefix/merchants/${safePath(providerEnvironmentValue())}/${safePath(context.businessId)}/versions/$sha256/domain-association"
    }

    private fun approvedKey(): String = applePayApprovedKey.trim().takeIf { it.isNotBlank() }
        ?: throw BadRequestException("Apple Pay approved artifact key is not configured")

    private fun safePath(value: String): String = value.map { if (it.isLetterOrDigit() || it in "._-" ) it else '_' }.joinToString("")

    private fun postApplePayRegistration(
        context: ApplePayContext,
        requestId: String
    ) = run {
        val merchantName = context.merchantName
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: throw BadRequestException(
                "Merchant name is required for Apple Pay registration"
            )

        val body = buildJsonObject {
            put("registerDomains", buildJsonArray {
                add(JsonPrimitive(context.checkoutDomain))
            })
            put("merchantName", merchantName)
            put("merchantUrl", context.checkoutUrl)
        }.toString()

        repeat(2) { attempt ->
            val token = tokens.token(context.configuration)

            val response = transport.post(
                transport.applePayRegistrationUri(context.businessId),
                "${token.tokenType} ${token.value}",
                requestId,
                body
            )

            if (response.statusCode == 401 && attempt == 0) {
                tokens.invalidate(
                    context.configuration.integrationConfigurationId
                )
                return@repeat
            }

            return@run response
        }

        throw BadRequestException(
            "Poynt Apple Pay registration request was not authorized"
        )
    }

    private fun reconcileRegistration(context: ApplePayContext, unresolvedStatus: String): String = try {
        if (readApplePayRegistration(context).registeredDomains?.any {
                it.equals(context.checkoutDomain, ignoreCase = true)
            } == true
        ) {
            "REGISTERED_RECONCILED"
        } else {
            unresolvedStatus
        }
    } catch (_: Exception) {
        unresolvedStatus
    }

    private fun auditApplePayRegistration(
        context: ApplePayContext,
        actorUserId: String,
        result: String,
        requestId: String?,
        requested: Boolean = false
    ) {
        val metadata = buildJsonObject {
            put("integrationConfigurationId", context.row.integrationConfigurationId)
            put("checkoutDomain", context.checkoutDomain)
            put("result", result)
        }.toString()
        activityAudit?.record(
            ActivityAuditEvent(
                if (requested) ActivityEventType.POYNT_APPLE_PAY_REGISTRATION_REQUESTED
                else ActivityEventType.POYNT_APPLE_PAY_REGISTRATION_RESULT,
                actorUserId = actorUserId,
                actorRole = "PLATFORM_ADMIN",
                organizationId = context.row.organizationId,
                platform = "UNKNOWN",
                source = "PLATFORM_ADMIN",
                metadata = metadata,
                deduplicationKey = requestId?.let { "POYNT_APPLE_PAY:$it:$result" }
            )
        )
    }

    private fun requireApplePayReadinessEnabled() {
        if (!diagnosticsEnabled || environment.lowercase() !in setOf("local", "dev", "development")) {
            throw BadRequestException("Poynt Apple Pay readiness is disabled")
        }
    }

    private fun requireApplePayRegistrationEnabled() {
        requireApplePayReadinessEnabled()
        if (!applePayRegistrationEnabled) {
            throw BadRequestException("Poynt Apple Pay registration is disabled")
        }
    }

    private fun configuredCheckoutDomainOrNull(): String? = configuredDomain(checkoutUrl)

    private fun configuredDomain(url: String): String? = try {
        URI(url).takeIf { it.scheme.equals("https", ignoreCase = true) }
            ?.host
            ?.trim()
            ?.lowercase()
            ?.takeIf { it.isNotEmpty() }
    } catch (_: Exception) {
        null
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it) }
    
    /** Temporary LOCAL/DEV operational diagnostic. Returns only non-sensitive terminal identity fields. */
        fun devicesDiagnostic(
            integrationId: String,
            storeId: String,
            actorUserId: String
        ): List<PoyntDeviceDiagnosticDto> {
            if (!diagnosticsEnabled) {
                throw BadRequestException(
                    "Poynt devices diagnostic is disabled"
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

    private fun parseApplePayRegistration(
        httpStatus: Int,
        body: String,
        configuredDomain: String? = null
    ): PoyntApplePayRegistrationDiagnosticDto {
        // Only a successful response, or a 404 carrying an explicit
        // registration marker, can establish a registration state.
        if (httpStatus !in 200..299 && httpStatus != 404) {
            return PoyntApplePayRegistrationDiagnosticDto(httpStatus = httpStatus)
        }
        val root = try {
            Json.parseToJsonElement(body) as? JsonObject
        } catch (_: Exception) {
            null
        } ?: return PoyntApplePayRegistrationDiagnosticDto(httpStatus = httpStatus)
        val registration = root["registration"] as? JsonObject
        val registered = registrationState(root) ?: registration?.let(::registrationState)
        val domains = registeredDomains(root) ?: registration?.let(::registeredDomains)
        return PoyntApplePayRegistrationDiagnosticDto(
            httpStatus = httpStatus,
            registered = registered,
            registeredDomains = domains,
            memgineDevDomainRegistered = configuredDomain?.let { expected ->
                domains?.any { it.equals(expected, ignoreCase = true) }
            }
        )
    }

    /** Only provider fields explicitly named as registration/domain fields are accepted. */
    private fun registrationState(value: JsonObject): Boolean? =
        listOf("registered", "isRegistered").firstNotNullOfOrNull { name ->
            (value[name] as? JsonPrimitive)?.contentOrNull?.trim()?.lowercase()?.let {
                when (it) {
                    "true", "registered" -> true
                    "false", "unregistered" -> false
                    else -> null
                }
            }
        } ?: (value["registrationStatus"] as? JsonPrimitive)
            ?.contentOrNull
            ?.trim()
            ?.uppercase()
            ?.let { status ->
                when (status) {
                    "REGISTERED" -> true
                    "UNREGISTERED" -> false
                    else -> null
                }
            }

    private fun registeredDomains(value: JsonObject): List<String>? =
        listOf("registeredDomains", "domains", "domain").firstNotNullOfOrNull { name ->
            (value[name] as? JsonArray)?.mapNotNull { domain ->
                (domain as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
            }
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
