package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.postgresql.util.PSQLException

class CommerceService(
    private val sql: CommerceSql,
    private val providers: CommerceProviderRegistry = CommerceProviderRegistry(),
    private val remotePaymentConfiguration: CommerceRemotePaymentConfiguration = CommerceRemotePaymentConfiguration()
) {
    fun integrations(organizationId: String, actorUserId: String): List<CommerceIntegrationDto> =
        translate {
            sql.integrations(validId(organizationId), actorUserId).map {
                CommerceIntegrationDto(
                    it.integrationConfigurationId,
                    it.integrationName,
                    it.providerCode,
                    it.integrationTypeCode,
                    providers.capabilities(it.providerCode)
                )
            }
        }

    fun snapshots(organizationId: String, actorUserId: String): List<CommerceProductSnapshotDto> =
        translate { sql.snapshots(validId(organizationId), actorUserId).map(::snapshotDto) }

    fun mappings(organizationId: String, actorUserId: String): List<CommerceProductMappingDto> = translate {
        val snapshots = sql.snapshots(validId(organizationId), actorUserId)
        sql.mappings(organizationId, actorUserId).map { mappingDto(it, snapshots) }
    }

    fun saveSnapshot(
        organizationId: String,
        request: CommerceProductSnapshotWriteDto,
        actorUserId: String
    ): CommerceProductSnapshotDto = translate {
        validateSnapshot(request)
        val id = sql.saveSnapshot(
            validId(organizationId), validId(request.integrationConfigurationId), request.storeId?.let(::validId),
            request.externalProductId.trim(), request.externalVariantId?.trim(), request.externalSku?.trim(),
            request.productName.trim(), request.description?.trim(), request.currencyCode.trim().uppercase(),
            request.unitPriceMinorSnapshot, request.active, request.sourceUpdatedAt, actorUserId
        )
        sql.snapshots(organizationId, actorUserId).firstOrNull { it.snapshotId == id }
            ?.let(::snapshotDto) ?: throw NotFoundException("Commerce product snapshot was not saved")
    }

    fun saveMapping(
        organizationId: String,
        request: CommerceProductMappingWriteDto,
        actorUserId: String
    ): CommerceProductMappingDto = translate {
        validateMapping(request)
        val id = sql.saveMapping(
            validId(organizationId), validId(request.integrationConfigurationId), request.storeId?.let(::validId),
            request.externalProductId.trim(), request.externalVariantId?.trim(), request.externalSku?.trim(),
            request.active, actorUserId
        )
        val snapshots = sql.snapshots(organizationId, actorUserId)
        sql.mappings(organizationId, actorUserId).firstOrNull { it.mappingId == id }
            ?.let { mappingDto(it, snapshots) } ?: throw NotFoundException("Commerce product mapping was not saved")
    }

    fun benefitApplicability(
        organizationId: String,
        benefitId: String,
        actorUserId: String
    ): CommerceApplicabilityDto? = applicability(
        validId(organizationId), validId(benefitId), actorUserId, true
    )

    fun offerApplicability(
        organizationId: String,
        offerId: String,
        actorUserId: String
    ): CommerceApplicabilityDto? = applicability(
        validId(organizationId), validId(offerId), actorUserId, false
    )

    fun saveBenefitApplicability(
        organizationId: String,
        benefitId: String,
        request: CommerceApplicabilityWriteDto,
        actorUserId: String
    ): CommerceApplicabilityDto = saveApplicability(
        validId(organizationId), validId(benefitId), request, actorUserId, true
    )

    fun saveOfferApplicability(
        organizationId: String,
        offerId: String,
        request: CommerceApplicabilityWriteDto,
        actorUserId: String
    ): CommerceApplicabilityDto = saveApplicability(
        validId(organizationId), validId(offerId), request, actorUserId, false
    )

    /** Phase 1 boundary only. No registered provider means no external catalog call occurs. */
    fun catalogProvider(providerCode: String): CommerceCatalogProvider =
        providers.catalogProvider(providerCode)
            ?: throw BadRequestException("Commerce catalog provider is not available")

    fun saveCatalogConfiguration(organizationId:String,integrationId:String,request:CommerceCatalogConfigurationWriteDto,actorUserId:String) = translate {
        if (request.applicationId.isBlank() || request.applicationId.length > 128 || request.providerBusinessId.isBlank() || request.credentialSecretReference.isBlank() || !currencyCodes.matches(request.merchantCurrencyCode.uppercase())) throw BadRequestException("Invalid Poynt catalog configuration")
        sql.saveCatalogConfiguration(validId(organizationId),validId(integrationId),request.applicationId.trim(),request.providerBusinessId.trim(),request.providerStoreId?.trim(),request.credentialSecretReference.trim(),request.merchantCurrencyCode.uppercase(),actorUserId)
    }
    /** Provider-specific catalog data is mapped into existing generic snapshots only. */
    fun syncCatalog(organizationId: String, integrationId: String, storeId: String?, incremental: Boolean, actorUserId: String): List<CommerceProductSnapshotDto> = translate {
        val org = validId(organizationId); val integration = integrations(org, actorUserId).firstOrNull { it.integrationConfigurationId == validId(integrationId) }
            ?: throw NotFoundException("Commerce integration was not found")
        val provider = providers.catalogProvider(integration.providerCode) ?: throw BadRequestException("Commerce catalog provider is not available")
        val scopedStore = storeId?.let(::validId)
        val request = CommerceCatalogSyncRequest(org, integrationId, scopedStore, null, incremental, actorUserId)
        try {
            val result = provider.syncCatalog(request).map { snapshot -> saveSnapshot(org, snapshot, actorUserId) }
            sql.recordCatalogSync(org, integrationId, scopedStore, incremental, "SUCCESS", null, null, actorUserId)
            result
        } catch (error: Exception) {
            sql.recordCatalogSync(org, integrationId, scopedStore, incremental, "FAILED", "CATALOG_SYNC_FAILED", "Poynt catalog synchronization failed", actorUserId)
            throw error
        }
    }

    fun refreshProductMapping(organizationId: String, mappingId: String, actorUserId: String): CommerceProductSnapshotDto? = translate {
        val mapping = sql.mappings(validId(organizationId), actorUserId).firstOrNull { it.mappingId == validId(mappingId) }
            ?: throw NotFoundException("Commerce product mapping was not found")
        val integration = integrations(organizationId, actorUserId).firstOrNull { it.integrationConfigurationId == mapping.integrationConfigurationId }
            ?: throw BadRequestException("Commerce integration is unavailable")
        val snapshot = providers.catalogProvider(integration.providerCode)?.syncProduct(
            CommerceCatalogProductRequest(organizationId, mapping.integrationConfigurationId, mapping.storeId, mapping.externalProductId, mapping.externalVariantId, actorUserId)
        ) ?: throw BadRequestException("Commerce catalog provider is not available")
        saveSnapshot(organizationId, snapshot, actorUserId)
    }
    /** Generic transaction orchestration. It persists a basket but never invokes a provider in Phase 2. */
    fun createTransaction(organizationId: String, request: CommerceTransactionCreateDto, actorUserId: String): CommerceTransactionDetailDto = translate {
        validateTransactionRequest(request)
        val id = sql.createTransaction(validId(organizationId), request.storeId?.let(::validId), request.customerUserId?.let(::validId), request.subscriptionId?.let(::validId), request.integrationConfigurationId?.let(::validId), request.sourceChannel.trim().uppercase(), request.idempotencyKey.trim(), actorUserId)
        transaction(organizationId, id, actorUserId)
    }

    fun transaction(organizationId: String, transactionId: String, actorUserId: String): CommerceTransactionDetailDto = translate {
        val org = validId(organizationId); val id = validId(transactionId)
        val row = sql.transaction(org, id, actorUserId) ?: throw NotFoundException("Commerce transaction was not found")
        CommerceTransactionDetailDto(transactionDto(row), sql.transactionLines(org,id,actorUserId).map(::lineDto), sql.transactionAdjustments(org,id,actorUserId).map(::adjustmentDto), sql.transactionRedemptions(org,id,actorUserId).map(::redemptionDto))
    }

    fun addExternalProductLine(organizationId: String, transactionId: String, request: CommerceExternalProductLineCreateDto, actorUserId: String): CommerceTransactionDetailDto = translate {
        if (request.quantity < 1 || request.description.isBlank() || request.description.length > 500) throw BadRequestException("Invalid commerce line")
        sql.addExternalProductLine(validId(transactionId), validId(request.commerceProductMappingId), request.quantity, request.description.trim(), actorUserId)
        transaction(organizationId, transactionId, actorUserId)
    }

    fun addMembershipLine(organizationId: String, transactionId: String, request: CommerceMembershipLineCreateDto, actorUserId: String): CommerceTransactionDetailDto = translate {
        if (request.quantity != 1) throw BadRequestException("Membership quantity must be one")
        sql.addMembershipLine(validId(transactionId), validId(request.subscriptionPlanId), request.quantity, actorUserId)
        transaction(organizationId, transactionId, actorUserId)
    }

    fun attachRedemption(organizationId: String, transactionId: String, request: CommerceRedemptionAttachDto, actorUserId: String): CommerceTransactionDetailDto = translate {
        sql.attachRedemption(validId(transactionId), validId(request.redemptionTransactionId), actorUserId)
        transaction(organizationId, transactionId, actorUserId)
    }

    fun materializeAdjustment(organizationId: String, transactionId: String, request: CommerceAdjustmentMaterializeDto, actorUserId: String): CommerceTransactionDetailDto = translate {
        if (request.sourceType.uppercase() !in setOf("BENEFIT", "OFFER")) throw BadRequestException("Invalid adjustment source")
        sql.materializeAdjustment(validId(transactionId), request.sourceType.uppercase(), validId(request.sourceId), request.targetLineId?.let(::validId), actorUserId)
        transaction(organizationId, transactionId, actorUserId)
    }

    fun markReady(organizationId: String, transactionId: String, actorUserId: String): CommerceTransactionDetailDto = translate {
        sql.markReady(validId(transactionId), actorUserId)
        transaction(organizationId, transactionId, actorUserId)
    }

    /**
     * Submits an already-ready external-product basket to its configured checkout provider.
     * A provider order is not a payment result: successful persistence ends at ORDER_CREATED.
     */
    fun submitProviderOrder(
        organizationId: String,
        transactionId: String,
        actorUserId: String
    ): CommerceTransactionDetailDto = translate {
        val organization = validId(organizationId)
        val id = validId(transactionId)
        val transaction = sql.transaction(organization, id, actorUserId)
            ?: throw NotFoundException("Commerce transaction was not found")

        if (transaction.status == "ORDER_CREATED") {
            if (transaction.providerOrderId.isNullOrBlank()) {
                throw BadRequestException("Order-created commerce transaction is missing its provider order")
            }
            return@translate transactionDetail(organization, id, actorUserId, transaction)
        }
        if (transaction.status != "READY_FOR_PROVIDER") {
            throw BadRequestException("Commerce transaction is not ready for provider order")
        }
        val integrationId = transaction.integrationConfigurationId?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Commerce transaction integration is required")
        val idempotencyKey = transaction.idempotencyKey.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Commerce transaction idempotency key is required")

        val integration = sql.integrations(organization, actorUserId)
            .firstOrNull { it.integrationConfigurationId == integrationId }
            ?: throw BadRequestException("Commerce transaction integration is unavailable")
        val checkoutProvider = providers.checkoutProvider(integration.providerCode)
            ?: throw BadRequestException("Commerce checkout provider is not available")
        if (CommerceCapability.ORDER !in checkoutProvider.capabilities) {
            throw BadRequestException("Commerce provider does not support orders")
        }
        val lines = sql.transactionLines(organization, id, actorUserId).map(::lineDto)
        val adjustments = sql.transactionAdjustments(organization, id, actorUserId).map(::adjustmentDto)
        if (lines.isEmpty() || lines.any { it.lineType !in setOf("EXTERNAL_PRODUCT", "MEMBERSHIP") })
            throw BadRequestException("Unsupported commerce transaction line")
        val catalogProvider = if (lines.any { it.lineType == "EXTERNAL_PRODUCT" })
            providers.catalogProvider(integration.providerCode)
                ?: throw BadRequestException("Commerce provider product lookup is not available")
        else null

        val mappingsById = sql.mappings(organization, actorUserId).associateBy { it.mappingId }
        val pricedLines = lines.map { line -> when (line.lineType) {
            "EXTERNAL_PRODUCT" -> {
                val mappingId = line.productMappingId ?: throw BadRequestException("Commerce product mapping is required")
                val mapping = mappingsById[mappingId] ?: throw BadRequestException("Commerce product mapping is unavailable")
                validateMappingForTransaction(mapping, transaction, integrationId, line)
                val current = requireNotNull(catalogProvider).getProduct(CommerceCatalogProductRequest(organization, integrationId, transaction.storeId, mapping.externalProductId, mapping.externalVariantId, actorUserId))
                    ?: throw BadRequestException("Current provider product is unavailable")
                validateCurrentProviderProduct(current, mapping)
                line.copy(externalProductId = current.externalProductId, externalVariantId = current.externalVariantId,
                    unitPriceMinorAuthoritative = current.unitPriceMinorSnapshot,
                    lineSubtotalMinor = current.unitPriceMinorSnapshot * line.quantity.toLong(),
                    currencyCode = current.currencyCode.uppercase(), priceSource = "PROVIDER_FINAL")
            }
            "MEMBERSHIP" -> {
                val unit = line.unitPriceMinorAuthoritative ?: throw BadRequestException("Membership price is unavailable")
                val currency = line.currencyCode?.uppercase()?.takeIf { currencyCodes.matches(it) }
                    ?: throw BadRequestException("Membership currency is unavailable")
                if (unit < 0 || line.priceSource != "MEMGINE_MEMBERSHIP") throw BadRequestException("Membership price is invalid")
                line.copy(lineSubtotalMinor = unit * line.quantity.toLong(), currencyCode = currency, priceSource = "MEMGINE_MEMBERSHIP")
            }
            else -> throw BadRequestException("Unsupported commerce transaction line")
        }}
        val currency = pricedLines.mapNotNull { it.currencyCode?.uppercase() }.distinct().singleOrNull()
            ?: throw BadRequestException("Provider product currencies must match")
        val materializedAdjustments = materializeAdjustments(adjustments, pricedLines)
        val adjustmentTotal = materializedAdjustments.sumOf { it.appliedAmountMinor }
        val subtotal = pricedLines.sumOf { requireNotNull(it.lineSubtotalMinor) }
        val request = CommerceCheckoutRequest(
            organizationId = organization,
            transactionId = id,
            storeId = transaction.storeId,
            customerUserId = transaction.customerUserId,
            sourceChannel = transaction.sourceChannel,
            idempotencyKey = idempotencyKey,
            lines = pricedLines,
            adjustments = adjustments,
            currencyCode = currency,
            integrationConfigurationId = integrationId,
            actorUserId = actorUserId,
            materializedAdjustments = materializedAdjustments
        )
        checkoutProvider.prepareCheckout(request)
        val result = checkoutProvider.startCheckout(request)
        validateProviderOrderResult(result, pricedLines, materializedAdjustments, currency)
        val linePrices = pricedLines.map {
            CommerceAuthoritativeLinePrice(
                it.lineId,
                requireNotNull(it.unitPriceMinorAuthoritative),
                requireNotNull(it.lineSubtotalMinor),
                currency,
                it.priceSource
            )
        }
        sql.persistMaterializedProviderOrder(
            id,
            requireNotNull(result.providerOrderId).trim(),
            Json.encodeToString(linePrices),
            Json.encodeToString(materializedAdjustments.map { CommerceAppliedAdjustment(it.adjustmentId, it.appliedAmountMinor, "APPLIED") }),
            subtotal,
            adjustmentTotal,
            requireNotNull(result.taxTotalMinor),
            requireNotNull(result.totalMinor),
            currency,
            actorUserId
        )
        transaction(organization, id, actorUserId)
    }

        /** Starts only the provider-neutral terminal-payment lifecycle; device interaction stays outside the server. */
    fun startTerminalPayment(
        organizationId: String,
        transactionId: String,
        actorUserId: String
    ): CommerceTerminalPaymentInstruction = translate {
        val organization = validId(organizationId)
        val id = validId(transactionId)

        val transaction = sql.transaction(organization, id, actorUserId)
            ?: throw NotFoundException("Commerce transaction was not found")

        if (transaction.status != "ORDER_CREATED") {
            throw BadRequestException("Commerce transaction is not ready for terminal payment")
        }

        val integrationId = transaction.integrationConfigurationId
            ?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Commerce transaction integration is required")

        val integration = sql.integrations(organization, actorUserId)
            .firstOrNull { it.integrationConfigurationId == integrationId }
            ?: throw BadRequestException("Commerce transaction integration is unavailable")

        if (CommerceCapability.TERMINAL_PAYMENT !in providers.capabilities(integration.providerCode)) {
            throw BadRequestException("Commerce provider does not support terminal payment")
        }

        val providerOrderId = transaction.providerOrderId
            ?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Commerce provider order is required")

        val amount = transaction.totalMinor
            ?: throw BadRequestException("Commerce payment amount is unavailable")

        if (amount <= 0) {
            throw BadRequestException("Commerce transaction does not require terminal payment")
        }

        val currency = transaction.currencyCode
            ?.uppercase()
            ?.takeIf { currencyCodes.matches(it) }
            ?: throw BadRequestException("Commerce payment currency is unavailable")

        sql.startTerminalPayment(
            organization,
            id,
            actorUserId
        )

        CommerceTerminalPaymentInstruction(
            id,
            integration.providerCode,
            providerOrderId,
            amount,
            currency,
            id
        )
    }

    fun startRemoteTerminalPayment(organizationId: String, transactionId: String, request: CommerceRemoteTerminalPaymentStartRequest, actorUserId: String): CommerceRemoteTerminalPaymentDispatchDto = translate {
        val callbackUrl = remotePaymentConfiguration.callbackUrl
        val callbackHeaderName = remotePaymentConfiguration.callbackHeaderName
        val callbackHeaderValue = remotePaymentConfiguration.callbackHeaderValue
        val ttlSeconds = remotePaymentConfiguration.ttlSeconds
        if (callbackUrl.isBlank() || callbackHeaderName.isBlank() || callbackHeaderValue.isBlank() || ttlSeconds <= 0) throw BadRequestException("Poynt Payment Bridge is not configured")
        val org = validId(organizationId); val tx = validId(transactionId); val device = validId(request.posDeviceId)
        val transaction = sql.transaction(org, tx, actorUserId) ?: throw NotFoundException("Commerce transaction was not found")
        val integration = transaction.integrationConfigurationId?.let { id -> sql.integrations(org, actorUserId).firstOrNull { it.integrationConfigurationId == id } } ?: throw BadRequestException("Commerce transaction integration is unavailable")
        val provider = providers.remoteTerminalPaymentProvider(integration.providerCode) ?: throw BadRequestException("Commerce provider does not support remote terminal payment")
        val reference = "MRP-" + java.util.UUID.randomUUID().toString()
        val row = sql.beginRemoteTerminalPayment(org, tx, device, reference, actorUserId)
        if (row.alreadyDispatched) return@translate CommerceRemoteTerminalPaymentDispatchDto(tx, row.providerReferenceId, "PROVIDER_IN_PROGRESS")
        provider.dispatchRemoteTerminalPayment(CommerceRemoteTerminalPaymentRequest(org,row.integrationConfigurationId,actorUserId,row.providerOrderId,row.amountMinor,row.currencyCode,row.providerReferenceId,CommerceRemoteTerminalTarget(row.providerBusinessId,row.providerStoreId,row.providerDeviceId),callbackUrl,callbackHeaderName,callbackHeaderValue,ttlSeconds))
        sql.markRemotePaymentDispatched(row.providerReferenceId)
        CommerceRemoteTerminalPaymentDispatchDto(tx, row.providerReferenceId, "PROVIDER_IN_PROGRESS")
    }
    internal fun recordRemoteTerminalPaymentCallback(callback: PoyntPaymentBridgeCallback) = translate {
        val candidate = callback.usableTransaction()
        val failure = callback.status !in setOf("RECEIVED", "STARTED", "CANCELED") &&
            (candidate == null || candidate.status != "CAPTURED" || candidate.authOnly)
        sql.recordRemotePaymentCallback(
            callback.referenceId, if (failure) "FAILED" else callback.status,
            candidate?.id, candidate?.status, candidate?.amountMinor, candidate?.currencyCode,
            candidate?.businessId, candidate?.storeId
        )
    }
    fun recordTerminalPaymentResult(
        organizationId: String,
        transactionId: String,
        actorUserId: String,
        request: CommerceTerminalPaymentResultRequest
    ): CommerceTransactionDetailDto = translate {
        val organization = validId(organizationId)
        val id = validId(transactionId)

        val transaction = sql.transaction(organization, id, actorUserId)
            ?: throw NotFoundException("Commerce transaction was not found")

        validateTerminalPaymentResult(request, transaction)

        sql.recordTerminalPaymentResult(
            organization,
            id,
            request.providerTransactionId
                ?.trim()
                ?.takeIf { it.isNotEmpty() },
            request.providerStatus.trim().uppercase(),
            request.amountMinor,
            request.currencyCode.trim().uppercase(),
            request.failureCode
                ?.trim()
                ?.takeIf { it.isNotEmpty() },
            request.failureMessage
                ?.trim()
                ?.takeIf { it.isNotEmpty() },
            actorUserId
        )

        transaction(
            organization,
            id,
            actorUserId
        )
    }

    /** Resolves an already-registered checkout provider without exposing provider-specific routes. */
    fun checkoutProvider(providerCode: String): CommerceCheckoutProvider = providers.checkoutProvider(providerCode)
        ?: throw BadRequestException("Commerce checkout provider is not available")

    /** Called only by a future authenticated provider callback/adapter boundary. */
    internal fun recordProviderResult(organizationId: String, transactionId: String, result: CommerceCheckoutResult, actorUserId: String): CommerceTransactionDetailDto = translate {
        sql.recordProviderResult(validId(transactionId), result.providerStatus.uppercase(), result.providerOrderId, result.providerTransactionId, result.subtotalMinor, result.adjustmentTotalMinor, result.taxTotalMinor, result.totalMinor, result.currencyCode?.uppercase(), result.failureCode, result.failureMessage, actorUserId)
        transaction(organizationId, transactionId, actorUserId)
    }

    /** Provider success is persisted first; a registered fulfillment executor may complete it idempotently. */
    internal fun finalizeFulfillment(organizationId: String, transactionId: String, actorUserId: String, executor: CommerceFulfillmentExecutor = UnavailableCommerceFulfillmentExecutor): CommerceTransactionDetailDto = translate {
        sql.markFulfillmentPending(validId(transactionId), actorUserId)
        val detail = transaction(organizationId, transactionId, actorUserId)
        val outcome = executor.fulfill(detail)
        if (outcome.completed) sql.completeFulfillment(transactionId, actorUserId)
        transaction(organizationId, transactionId, actorUserId)
    }
    private fun validateTransactionRequest(request: CommerceTransactionCreateDto) {
        if (request.sourceChannel.isBlank() || request.sourceChannel.length > 32 || request.idempotencyKey.isBlank() || request.idempotencyKey.length > 128) throw BadRequestException("Invalid commerce transaction")
    }

    private fun transactionDto(row: CommerceTransactionRow) = CommerceTransactionDto(row.transactionId,row.organizationId,row.storeId,row.customerUserId,row.subscriptionId,row.integrationConfigurationId,row.sourceChannel,row.status,row.currencyCode,row.subtotalMinor,row.adjustmentTotalMinor,row.taxTotalMinor,row.totalMinor,row.providerOrderId,row.providerTransactionId,row.idempotencyKey,row.failureCode,row.failureMessage,row.createdAt,row.updatedAt,row.completedAt,row.versionNo)
    private fun transactionDetail(organizationId: String, transactionId: String, actorUserId: String, transaction: CommerceTransactionRow) =
        CommerceTransactionDetailDto(transactionDto(transaction), sql.transactionLines(organizationId, transactionId, actorUserId).map(::lineDto), sql.transactionAdjustments(organizationId, transactionId, actorUserId).map(::adjustmentDto), sql.transactionRedemptions(organizationId, transactionId, actorUserId).map(::redemptionDto))
    private fun lineDto(row: CommerceTransactionLineRow) = CommerceTransactionLineDto(row.lineId,row.transactionId,row.lineType,row.sourceEntityType,row.sourceEntityId,row.productMappingId,row.subscriptionPlanId,row.externalProductId,row.externalVariantId,row.description,row.quantity,row.unitPriceMinorSnapshot,row.unitPriceMinorAuthoritative,row.lineSubtotalMinor,row.currencyCode,row.priceSource,row.metadataJson,row.versionNo)
    private fun adjustmentDto(row: CommerceTransactionAdjustmentRow) = CommerceTransactionAdjustmentDto(row.adjustmentId,row.transactionId,row.targetLineId,row.commerceAdjustmentId,row.sourceType,row.sourceId,row.adjustmentType,row.percentage,row.requestedAmountMinor,row.appliedAmountMinor,row.currencyCode,row.status,row.versionNo)
    private fun redemptionDto(row: CommerceTransactionRedemptionRow) = CommerceTransactionRedemptionDto(row.associationId,row.transactionId,row.redemptionTransactionId,row.redemptionStatus,row.versionNo)
    private fun saveApplicability(
        organizationId: String,
        entityId: String,
        request: CommerceApplicabilityWriteDto,
        actorUserId: String,
        benefit: Boolean
    ): CommerceApplicabilityDto = translate {
        validateApplicability(request)
        val adjustmentId = if (benefit) {
            sql.saveBenefitApplicability(
                organizationId, entityId, request.adjustmentType, request.percentage,
                request.amountMinor, request.currencyCode?.uppercase(), request.active,
                request.productMappingIds.toTypedArray(), actorUserId
            )
        } else {
            sql.saveOfferApplicability(
                organizationId, entityId, request.adjustmentType, request.percentage,
                request.amountMinor, request.currencyCode?.uppercase(), request.active,
                request.productMappingIds.toTypedArray(), actorUserId
            )
        }
        applicability(organizationId, entityId, actorUserId, benefit)
            ?.takeIf { it.adjustmentId == adjustmentId }
            ?: throw NotFoundException("Commerce applicability was not saved")
    }

    private fun applicability(
        organizationId: String,
        entityId: String,
        actorUserId: String,
        benefit: Boolean
    ): CommerceApplicabilityDto? = translate {
        val row = if (benefit) sql.benefitApplicability(organizationId, entityId, actorUserId)
        else sql.offerApplicability(organizationId, entityId, actorUserId)
        row?.let {
            CommerceApplicabilityDto(
                it.adjustmentId, it.organizationId, it.adjustmentType, it.percentage,
                it.amountMinor, it.currencyCode, it.active,
                sql.adjustmentMappings(organizationId, it.adjustmentId, actorUserId).map { mapping ->
                    mappingDto(mapping, emptyList())
                },
                it.versionNo
            )
        }
    }

    private fun validateSnapshot(request: CommerceProductSnapshotWriteDto) {
        validateMappingIdentity(request.integrationConfigurationId, request.storeId, request.externalProductId,
            request.externalVariantId, request.externalSku)
        if (request.productName.isBlank() || request.productName.length > 200 ||
            (request.description?.length ?: 0) > 2000 || !currencyCodes.matches(request.currencyCode) ||
            request.unitPriceMinorSnapshot < 0) {
            throw BadRequestException("Invalid commerce product snapshot")
        }
    }

    private fun validateMapping(request: CommerceProductMappingWriteDto) =
        validateMappingIdentity(request.integrationConfigurationId, request.storeId, request.externalProductId,
            request.externalVariantId, request.externalSku)

    private fun validateMappingIdentity(
        integrationId: String,
        storeId: String?,
        externalProductId: String,
        externalVariantId: String?,
        externalSku: String?
    ) {
        validId(integrationId)
        storeId?.let(::validId)
        if (externalProductId.isBlank() || externalProductId.length > 160 ||
            (externalVariantId?.length ?: 0) > 160 || (externalSku?.length ?: 0) > 160) {
            throw BadRequestException("Invalid commerce product mapping")
        }
    }

    private fun validateApplicability(request: CommerceApplicabilityWriteDto) {
        val type = request.adjustmentType
        if (type !in adjustmentTypes || request.productMappingIds.distinct().size != request.productMappingIds.size ||
            request.productMappingIds.any { it.isBlank() || it.length > 64 }) {
            throw BadRequestException("Invalid commerce applicability")
        }
        val product = type.startsWith("PRODUCT_")
        if (product != request.productMappingIds.isNotEmpty()) {
            throw BadRequestException("Product adjustments require product mappings; order adjustments do not")
        }
        when (type) {
            "PRODUCT_FREE" -> if (request.percentage != null || request.amountMinor != null || request.currencyCode != null) invalidAdjustment()
            "PRODUCT_PERCENT_OFF", "ORDER_PERCENT_OFF" -> if (request.percentage == null || request.percentage <= 0 || request.percentage > 100 || request.amountMinor != null || request.currencyCode != null) invalidAdjustment()
            else -> if (request.percentage != null || request.amountMinor == null || request.amountMinor < 0 || !currencyCodes.matches(request.currencyCode ?: "")) invalidAdjustment()
        }
    }

    private fun invalidAdjustment(): Nothing = throw BadRequestException("Invalid commerce adjustment value")

    private fun validateMappingForTransaction(
        mapping: CommerceProductMappingRow,
        transaction: CommerceTransactionRow,
        integrationId: String,
        line: CommerceTransactionLineDto
    ) {
        if (!mapping.active || mapping.integrationConfigurationId != integrationId ||
            (mapping.storeId != null && mapping.storeId != transaction.storeId) ||
            mapping.externalProductId != line.externalProductId ||
            mapping.externalVariantId != line.externalVariantId) {
            throw BadRequestException("Commerce product mapping is not valid for this transaction")
        }
    }

    private fun validateCurrentProviderProduct(
        current: CommerceProductSnapshotWriteDto,
        mapping: CommerceProductMappingRow
    ) {
        if (!current.active || current.integrationConfigurationId != mapping.integrationConfigurationId ||
            current.externalProductId != mapping.externalProductId ||
            current.externalVariantId != mapping.externalVariantId ||
            current.unitPriceMinorSnapshot < 0 || !currencyCodes.matches(current.currencyCode.uppercase())) {
            throw BadRequestException("Current provider product is invalid")
        }
    }

    private fun validateProviderOrderResult(
        result: CommerceCheckoutResult,
        pricedLines: List<CommerceTransactionLineDto>,
        adjustments: List<CommerceCheckoutAdjustment>,
        currency: String
    ) {
        val providerOrderId = result.providerOrderId?.trim()
        val subtotal = result.subtotalMinor
        val adjustment = result.adjustmentTotalMinor
        val tax = result.taxTotalMinor
        val total = result.totalMinor
        if (providerOrderId.isNullOrEmpty() || result.providerTransactionId != null ||
            result.providerStatus.isBlank() || result.providerStatus.uppercase() in setOf("SUCCEEDED", "PAID") ||
            result.currencyCode?.uppercase() != currency || subtotal == null || adjustment == null || tax == null || total == null ||
            subtotal < 0 || adjustment != adjustments.sumOf { it.appliedAmountMinor } || tax < 0 || total < 0 ||
            subtotal != pricedLines.sumOf { requireNotNull(it.lineSubtotalMinor) } || total != subtotal - adjustment + tax) {
            throw BadRequestException("Provider order result is invalid")
        }
    }

    private fun validateTerminalPaymentResult(
        request: CommerceTerminalPaymentResultRequest,
        transaction: CommerceTransactionRow
    ) {
        val status = request.providerStatus.trim().uppercase()

        val providerTransactionId = request.providerTransactionId
            ?.trim()
            ?.takeIf { it.isNotEmpty() }

        val currency = request.currencyCode.trim().uppercase()
        val transactionCurrency = transaction.currencyCode?.trim()?.uppercase()

        if (
            status !in setOf("SUCCEEDED", "FAILED", "CANCELLED") ||
            request.amountMinor < 0 ||
            transaction.totalMinor == null ||
            request.amountMinor != transaction.totalMinor ||
            transactionCurrency == null ||
            currency != transactionCurrency ||
            (status == "SUCCEEDED" && providerTransactionId == null) ||
            (providerTransactionId != null && providerTransactionId.length > 160) ||
            (request.failureCode?.trim()?.length ?: 0) > 80 ||
            (request.failureMessage?.trim()?.length ?: 0) > 500
        ) {
            throw BadRequestException("Invalid terminal payment result")
        }
    }

    private fun materializeAdjustments(
        adjustments: List<CommerceTransactionAdjustmentDto>,
        lines: List<CommerceTransactionLineDto>
    ): List<CommerceCheckoutAdjustment> {
        val byLine = lines.associateBy { it.lineId }
        val lineRemainders = lines.associate { it.lineId to requireNotNull(it.lineSubtotalMinor) }.toMutableMap()
        var appliedOrderDiscounts = 0L
        val ordered = adjustments.filter { it.adjustmentType.startsWith("PRODUCT_") } +
            adjustments.filter { it.adjustmentType.startsWith("ORDER_") }
        return ordered.map { adjustment ->
            if (adjustment.status != "REQUESTED") throw BadRequestException("Commerce adjustment is not pending")
            val amount = when (adjustment.adjustmentType) {
                "PRODUCT_FREE", "PRODUCT_PERCENT_OFF", "PRODUCT_FIXED_OFF", "PRODUCT_SPECIAL_PRICE" -> {
                    val line = adjustment.targetLineId?.let(byLine::get)
                        ?: throw BadRequestException("Product adjustment target line is invalid")
                    val remainder = requireNotNull(lineRemainders[line.lineId])
                    val applied = when (adjustment.adjustmentType) {
                        "PRODUCT_FREE" -> remainder
                        "PRODUCT_PERCENT_OFF" -> ((remainder * (adjustment.percentage ?: throw BadRequestException("Product percentage is required"))) / 100.0).toLong()
                        "PRODUCT_FIXED_OFF" -> minOf(remainder, adjustment.requestedAmountMinor ?: throw BadRequestException("Product discount amount is required"))
                        else -> maxOf(0, remainder - (adjustment.requestedAmountMinor ?: throw BadRequestException("Special price is required")) * line.quantity)
                    }
                    lineRemainders[line.lineId] = remainder - applied
                    applied
                }
                "ORDER_PERCENT_OFF", "ORDER_FIXED_OFF" -> {
                    val orderRemainder = lineRemainders.values.sum() - appliedOrderDiscounts
                    val amount = if (adjustment.adjustmentType == "ORDER_PERCENT_OFF")
                        ((orderRemainder * (adjustment.percentage ?: throw BadRequestException("Order percentage is required"))) / 100.0).toLong()
                    else adjustment.requestedAmountMinor ?: throw BadRequestException("Order discount amount is required")
                    minOf(orderRemainder, amount).also { appliedOrderDiscounts += it }
                }
                else -> throw BadRequestException("Unsupported commerce adjustment")
            }
            CommerceCheckoutAdjustment(adjustment.adjustmentId, adjustment.targetLineId, adjustment.sourceType, adjustment.sourceId, adjustment.adjustmentType, amount)
        }
    }

    private fun mappingDto(
        row: CommerceProductMappingRow,
        snapshots: List<CommerceProductSnapshotRow>
    ) = CommerceProductMappingDto(
        row.mappingId, row.organizationId, row.integrationConfigurationId, row.storeId,
        row.externalProductId, row.externalVariantId, row.externalSku, row.active,
        snapshots.firstOrNull {
            it.organizationId == row.organizationId &&
                it.integrationConfigurationId == row.integrationConfigurationId &&
                it.storeId == row.storeId && it.externalProductId == row.externalProductId &&
                it.externalVariantId == row.externalVariantId
        }?.let(::snapshotDto),
        row.versionNo
    )

    private fun snapshotDto(row: CommerceProductSnapshotRow) = CommerceProductSnapshotDto(
        row.snapshotId, row.organizationId, row.integrationConfigurationId, row.storeId,
        row.externalProductId, row.externalVariantId, row.externalSku, row.productName,
        row.description, row.currencyCode, row.unitPriceMinorSnapshot, row.active,
        row.sourceUpdatedAt, row.lastSyncedAt, row.versionNo
    )

    private fun validId(value: String): String {
        if (value.isBlank() || value.length > 64) throw BadRequestException("Invalid id")
        return value
    }

    private fun <T> translate(block: () -> T): T = try {
        block()
    } catch (error: Exception) {
        if (error is ApiException) throw error
        val postgres = generateSequence<Throwable>(error) { it.cause }
            .filterIsInstance<PSQLException>().firstOrNull()
        when (postgres?.sqlState) {
            "42501" -> throw ForbiddenException("Organization administration is not permitted")
            "23503", "23505", "22023", "22001", "23514", "22P02" -> throw BadRequestException("Invalid commerce configuration")
            else -> throw error
        }
    }

    private companion object {
        val adjustmentTypes = setOf(
            "PRODUCT_FREE", "PRODUCT_PERCENT_OFF", "PRODUCT_FIXED_OFF",
            "PRODUCT_SPECIAL_PRICE", "ORDER_PERCENT_OFF", "ORDER_FIXED_OFF"
        )
        val currencyCodes = Regex("^[A-Z]{3}$")
    }
}

@Serializable
private data class CommerceAuthoritativeLinePrice(
    @SerialName("line_id")
    val lineId: String,
    @SerialName("unit_price_minor")
    val unitPriceMinor: Long,
    @SerialName("line_subtotal_minor")
    val lineSubtotalMinor: Long,
    @SerialName("currency_code")
    val currencyCode: String,
    @SerialName("price_source")
    val priceSource: String
)

@Serializable
private data class CommerceAppliedAdjustment(
    @SerialName("adjustment_id") val adjustmentId: String,
    @SerialName("applied_amount_minor") val appliedAmountMinor: Long,
    val status: String
)

data class CommerceRemotePaymentConfiguration(
    val callbackUrl: String = "",
    val callbackHeaderName: String = "",
    val callbackHeaderValue: String = "",
    val ttlSeconds: Long = 45
)
