package com.mynikatech.memgine.component.commerce.provider.poynt

import com.mynikatech.memgine.component.commerce.*
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.CommerceCapability
import com.mynikatech.memgine.net.dto.CommerceCheckoutRequest
import com.mynikatech.memgine.net.dto.CommerceCheckoutResult
import com.mynikatech.memgine.net.dto.CommerceProductSnapshotWriteDto
import com.mynikatech.memgine.net.dto.CommerceExternalCategoryReferenceDto
import kotlinx.serialization.json.*
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

class PoyntCommerceProvider(
    private val sql: PoyntCommerceSql,
    private val client: PoyntAuthenticatedCatalogClient,
    private val orderClient: PoyntOrderClient? = null,
    private val checkoutConfigurationResolver: PoyntCheckoutConfigurationResolver? = null,
    private val paymentBridgeClient: PoyntPaymentBridgeClient? = null
) : CommerceCatalogProvider, CommerceCheckoutProvider, CommerceRemoteTerminalPaymentProvider {
    override val providerCode = "POYNT"
    override val capabilities get() = buildSet { addAll(setOf(CommerceCapability.CATALOG, CommerceCapability.PRODUCT_LOOKUP, CommerceCapability.ORDER, CommerceCapability.DISCOUNT, CommerceCapability.TERMINAL_PAYMENT)); if (paymentBridgeClient != null) add(CommerceCapability.REMOTE_PAYMENT) }

    override fun dispatchRemoteTerminalPayment(request: CommerceRemoteTerminalPaymentRequest) {
        val configuration = config(
            request.organizationId,
            request.integrationConfigurationId,
            request.actorUserId,
            request.transactionId
        )
        (paymentBridgeClient ?: throw BadRequestException("Poynt Payment Bridge client is unavailable")).dispatch(configuration, request)
    }
    override fun getProduct(request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto? = product(request)
    override fun syncProduct(request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto? = product(request)
    override fun syncCatalog(request: CommerceCatalogSyncRequest): List<CommerceProductSnapshotWriteDto> {
        val config = config(request.organizationId, request.integrationConfigurationId, request.actorUserId)
        val mapped = mutableListOf<CommerceProductSnapshotWriteDto>()
        var offset = 0
        val seenProductIds = mutableSetOf<String>()
        val seenPages = mutableSetOf<List<String>>()
        while (true) {
            val body = client.get(config, client.productsUri(config.businessId, offset), if (request.incremental) config.lastIncrementalSyncAt else request.modifiedSince)
            val products = parseProducts(body)
            val pageIds = products.map(PoyntProduct::id)
            if (pageIds.size != pageIds.toSet().size ||
                (pageIds.isNotEmpty() && !seenPages.add(pageIds)) ||
                pageIds.any { !seenProductIds.add(it) }
            ) {
                throw BadRequestException("Poynt catalog pagination was inconsistent")
            }
            mapped += products.flatMap { mapProduct(it, config, request.storeId) }
            if (products.size < CATALOG_PAGE_SIZE) break
            offset += products.size
        }
        val catalogId = request.externalCatalogId?.trim()?.takeIf { it.isNotEmpty() } ?: return mapped
        val categories = parseCatalogCategories(client.get(config, client.catalogFullUri(config.businessId, catalogId)))
        return mapped.map { snapshot -> snapshot.copy(externalCategories = categories[snapshot.externalProductId].orEmpty(), categoryMetadataAvailable = true) }
    }

    /** Validates the currently supported provider-order shape without creating an order. */
    override fun prepareCheckout(request: CommerceCheckoutRequest): CommerceCheckoutResult {
        checkoutOrder(request)
        return CommerceCheckoutResult(providerStatus = "PREPARED")
    }

    /** Creates a Poynt Order only. Commerce transaction persistence remains outside this adapter. */
    override fun startCheckout(request: CommerceCheckoutRequest): CommerceCheckoutResult {
        val prepared = checkoutOrder(request)
        val created = orderClientOrThrow().createOrder(prepared.configuration, request.idempotencyKey, prepared.order)
        return result(created)
    }

    override fun getCheckoutStatus(request: CommerceCheckoutRequest): CommerceCheckoutResult =
        throw BadRequestException("Poynt order status is unavailable before the provider order is persisted")

    override fun cancelCheckout(request: CommerceCheckoutRequest): CommerceCheckoutResult =
        throw BadRequestException("Poynt order cancellation is not supported in this phase")

    private fun product(request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto? {
        val config = config(
            request.organizationId,
            request.integrationConfigurationId,
            request.actorUserId,
            request.transactionId,
            request.redemptionTransactionId,
            request.storeId,
            request.counterStaffId
        )
        val body = client.get(config, client.productUri(config.businessId, request.externalProductId))
        val product = parseProduct(Json.parseToJsonElement(body).jsonObject)
        return mapProduct(product, config, request.storeId)
            .firstOrNull { it.externalVariantId == request.externalVariantId }
    }

    private fun checkoutOrder(request: CommerceCheckoutRequest): PreparedPoyntOrder {
        if (request.idempotencyKey.isBlank()) {
            throw BadRequestException("Commerce provider request ID is required")
        }
        if (request.lines.isEmpty()) {
            throw BadRequestException("Poynt order requires at least one external product line")
        }
        val currency = request.currencyCode?.trim()?.uppercase()
            ?.takeIf { it.matches(Regex("^[A-Z]{3}$")) }
            ?: throw BadRequestException("Poynt order currency is required")
        val configuration = checkoutConfigurationResolverOrThrow().resolve(request)
        val providerStoreId = configuration.providerStoreId?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Poynt provider store configuration is required")
        val items = request.lines.map { line -> orderItem(line, currency, request.materializedAdjustments) }
        val subtotal = items.sumOf { item -> item.unitPrice!! * item.quantity!!.toLong() }
        val discountTotal = request.materializedAdjustments.sumOf { it.appliedAmountMinor }
        if (discountTotal < 0 || discountTotal > subtotal) {
            throw BadRequestException("Poynt order discounts are invalid")
        }
        val taxTotal = request.authoritativeTaxTotalMinor ?: 0L
        if (taxTotal < 0) {
            throw BadRequestException("Poynt order tax is invalid")
        }
        val calculatedTotal = subtotal - discountTotal + taxTotal
        val netTotal = request.authoritativeTotalMinor ?: calculatedTotal
        if (netTotal != calculatedTotal) {
            throw BadRequestException(
                "Poynt order total mismatch: " +
                    "subtotal=$subtotal, " +
                    "discountTotal=$discountTotal, " +
                    "taxTotal=$taxTotal, " +
                    "calculatedTotal=$calculatedTotal, " +
                    "authoritativeTotal=$netTotal, " +
                    "currency=$currency"
            )
        }
        val orderDiscounts = request.materializedAdjustments.filter { it.targetLineId == null }.map(::discount)
        return PreparedPoyntOrder(
            configuration,
            PoyntOrder(
                items = items,
                amounts = PoyntOrderAmounts(
                    subTotal = subtotal,
                    taxTotal = taxTotal,
                    discountTotal = -discountTotal,
                    feeTotal = 0,
                    netTotal = netTotal,
                    currency = currency
                ),
                discounts = orderDiscounts,
                context = PoyntOrderContext(
                    source = when (request.sourceChannel.uppercase()) {
                        "COUNTER", "COUNTER_MEMBERSHIP", "COUNTER_REDEMPTION" -> "INSTORE"
                        "CUSTOMER_MEMBERSHIP" -> "WEB"
                        else -> "WEB"
                    },
                    transactionInstruction = "EXTERNALLY_PROCESSED",
                    businessId = configuration.businessId,
                    storeId = providerStoreId
                ),
                statuses = PoyntOrderStatuses(status = "OPENED")
            )
        )
    }

    private fun orderItem(
        line: com.mynikatech.memgine.net.dto.CommerceTransactionLineDto,
        currency: String,
        adjustments: List<com.mynikatech.memgine.net.dto.CommerceCheckoutAdjustment>
    ): PoyntOrderItem {
        if (line.quantity < 1) throw BadRequestException("Poynt order quantity must be positive")
        if (line.currencyCode != null && !line.currencyCode.equals(currency, ignoreCase = true)) {
            throw BadRequestException("Poynt order line currency must match the checkout currency")
        }
        val unitPrice = line.unitPriceMinorAuthoritative
            ?: throw BadRequestException("Poynt order requires an authoritative unit price")
        if (unitPrice < 0) throw BadRequestException("Poynt order unit price is invalid")
        val lineDiscounts = adjustments.filter { it.targetLineId == line.lineId }.map(::discount)
        return when (line.lineType) {
            "EXTERNAL_PRODUCT" -> PoyntOrderItem(
            productId = line.externalProductId?.trim()?.takeIf { it.isNotEmpty() }
                ?: throw BadRequestException("Poynt external product ID is required"),
            selectedVariants = line.externalVariantId?.trim()?.takeIf { it.isNotEmpty() }
                ?.let { listOf(PoyntVariant(id = it)) } ?: emptyList(),
            name = line.description,
            unitPrice = unitPrice,
            quantity = line.quantity.toDouble(),
            unitOfMeasure = "EACH",
            status = "ORDERED",
            externalId = line.lineId,
            discounts = lineDiscounts
        )
            "MEMBERSHIP" -> PoyntOrderItem(
                sku = line.subscriptionPlanId ?: line.lineId,
                name = line.description,
                unitPrice = unitPrice,
                quantity = line.quantity.toDouble(),
                unitOfMeasure = "EACH",
                status = "ORDERED",
                externalId = line.lineId,
                discounts = lineDiscounts
            )
            else -> throw BadRequestException("Commerce line type ${line.lineType} is not supported by Poynt order checkout")
        }
    }

    private fun discount(adjustment: com.mynikatech.memgine.net.dto.CommerceCheckoutAdjustment) = PoyntDiscount(
        customName = adjustment.adjustmentType,
        externalId = adjustment.adjustmentId,
        amount = -adjustment.appliedAmountMinor
    )

    private fun result(order: PoyntOrder): CommerceCheckoutResult {
        val id = order.id?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Poynt order response did not include an order ID")
        val amounts = order.amounts
        return CommerceCheckoutResult(
            providerOrderId = id,
            providerStatus = order.statuses?.status ?: "UNKNOWN",
            subtotalMinor = amounts?.subTotal,
            adjustmentTotalMinor = amounts?.discountTotal?.let { kotlin.math.abs(it) },
            taxTotalMinor = amounts?.taxTotal,
            totalMinor = amounts?.netTotal,
            currencyCode = amounts?.currency
        )
    }

    private fun orderClientOrThrow(): PoyntOrderClient =
        orderClient ?: throw BadRequestException("Poynt order client is unavailable")

    private fun checkoutConfigurationResolverOrThrow(): PoyntCheckoutConfigurationResolver =
        checkoutConfigurationResolver ?: throw BadRequestException("Poynt checkout configuration is unavailable")

    private fun config(
        org: String,
        integration: String,
        actor: String,
        transactionId: String? = null,
        redemptionTransactionId: String? = null,
        storeId: String? = null,
        counterStaffId: String? = null
    ): PoyntCatalogConfiguration {
        val row = when {
            !redemptionTransactionId.isNullOrBlank() ->
                sql.counterRedemptionReviewCatalogConfiguration(
                    org,
                    redemptionTransactionId,
                    storeId?.takeIf { it.isNotBlank() }
                        ?: throw BadRequestException("Counter Store is unavailable"),
                    counterStaffId?.takeIf { it.isNotBlank() }
                        ?: throw BadRequestException("Counter staff context is unavailable"),
                    actor
                )?.takeIf { it.integrationConfigurationId == integration }
            transactionId.isNullOrBlank() ->
            sql.catalogConfiguration(org, integration, actor)
            else ->
            sql.counterCatalogConfiguration(transactionId, actor)
                ?.takeIf { it.organizationId == org && it.integrationConfigurationId == integration }
        } ?: throw BadRequestException("Poynt catalog configuration is unavailable")

        return PoyntCatalogConfiguration(
            row.integrationConfigurationId,
            row.organizationId,
            row.applicationId,
            row.businessId,
            row.providerStoreId,
            row.secretReference,
            row.merchantCurrencyCode,
            row.lastIncrementalSyncAt
        )
    }

    private fun mapProduct(product: PoyntProduct, config: PoyntCatalogConfiguration, storeId: String?): List<CommerceProductSnapshotWriteDto> {
        val variants = product.variants
        val choices = if (variants.isEmpty()) listOf<PoyntProductVariant?>(null) else variants
        return choices.map { variant ->
            val price = variant?.price ?: product.price ?: throw BadRequestException("Poynt product price is unavailable")
            val amount = price.amount ?: throw BadRequestException("Poynt product price is unavailable")
            if (amount < 0) throw BadRequestException("Poynt product price is invalid")
            CommerceProductSnapshotWriteDto(
                config.integrationConfigurationId,
                storeId,
                product.id,
                variant?.id,
                variant?.sku ?: product.sku ?: product.shortCode,
                listOfNotNull(product.name, variant?.name).joinToString(" - "),
                product.description,
                (price.currency ?: config.merchantCurrencyCode).trim().uppercase(),
                amount,
                product.active && (variant?.active != false),
                variant?.updatedAt ?: product.updatedAt
            )
        }
    }

    private fun parseProducts(body: String): List<PoyntProduct> = try {
        val root = Json.parseToJsonElement(body).jsonObject
        val array = (root["products"] ?: root["items"]) as? JsonArray
            ?: throw IllegalArgumentException("Product array is missing")
        array.mapIndexed { index, element ->
            parseProduct(element as? JsonObject ?: throw IllegalArgumentException("Product $index is invalid"))
        }
    } catch (_: BadRequestException) {
        throw BadRequestException("Poynt catalog response was invalid")
    } catch (_: Exception) {
        throw BadRequestException("Poynt catalog response was invalid")
    }

    /** Parses only documented category/product associations. Unknown shapes leave no association. */
    private fun parseCatalogCategories(body: String): Map<String, List<CommerceExternalCategoryReferenceDto>> = try {
        val root = Json.parseToJsonElement(body).jsonObject
        val categories = root["categories"] as? JsonArray
            ?: throw BadRequestException("Poynt catalog category response was invalid")
        val output = linkedMapOf<String, MutableList<CommerceExternalCategoryReferenceDto>>()
        fun visit(category: JsonObject, parentId: String?) {
            val categoryId = string(category, "id") ?: return
            val reference = CommerceExternalCategoryReferenceDto(categoryId, string(category, "name"), parentId)
            val products = category["products"] as? JsonArray
            products?.forEach { item ->
                val product = item as? JsonObject ?: return@forEach
                val productId = string(product, "productId") ?: string(product["product"] as? JsonObject ?: product, "id")
                if (productId != null) output.getOrPut(productId) { mutableListOf() }.add(reference)
            }
            (category["categories"] as? JsonArray)?.forEach { nested ->
                (nested as? JsonObject)?.let { visit(it, categoryId) }
            }
        }
        categories.forEach { (it as? JsonObject)?.let { category -> visit(category, null) } }
        output.mapValues { (_, refs) -> refs.distinctBy { it.externalCategoryId } }
    } catch (error: BadRequestException) { throw error }
      catch (_: Exception) { throw BadRequestException("Poynt catalog category response was invalid") }

    private fun parseProduct(o: JsonObject): PoyntProduct {
        val id = string(o, "id") ?: throw BadRequestException("Poynt product ID is unavailable")
        val name = string(o, "name") ?: throw BadRequestException("Poynt product name is unavailable")
        val variants = when (val value = o["variants"]) {
            null -> emptyList()
            is JsonArray -> value.mapIndexed { index, element ->
                parseVariant(element as? JsonObject ?: throw BadRequestException("Poynt product variant $index is invalid"))
            }
            else -> throw BadRequestException("Poynt product variants are invalid")
        }
        return PoyntProduct(
            id = id,
            name = name,
            description = string(o, "description"),
            sku = string(o, "sku"),
            shortCode = string(o, "shortCode"),
            price = price(o["price"]),
            variants = variants,
            active = active(o),
            updatedAt = string(o, "updatedAt")
        )
    }

    private fun parseVariant(value: JsonObject): PoyntProductVariant = PoyntProductVariant(
        id = string(value, "id") ?: throw BadRequestException("Poynt product variant ID is unavailable"),
        sku = string(value, "sku"),
        name = string(value, "name"),
        price = price(value["price"]),
        active = active(value),
        updatedAt = string(value, "updatedAt")
    )

    private fun price(value: JsonElement?): PoyntPrice? = when (value) {
        null, JsonNull -> null
        is JsonPrimitive -> PoyntPrice(
            minorUnits(value)
        )
        is JsonObject -> PoyntPrice(
            minorUnits(value["amount"] as? JsonPrimitive),
            string(value, "currency")
        )
        else -> throw BadRequestException("Poynt product price is invalid")
    }.also { parsed ->
        if (parsed != null && parsed.amount != null && parsed.amount < 0) {
            throw BadRequestException("Poynt product price is invalid")
        }
    }

    private fun minorUnits(value: JsonPrimitive?): Long {
        if (value == null || value.isString) {
            throw BadRequestException("Poynt product price is invalid")
        }
        return value.longOrNull ?: throw BadRequestException("Poynt product price is invalid")
    }

    private fun active(value: JsonObject): Boolean {
        val active = value["active"] ?: return true
        return active.jsonPrimitive.booleanOrNull
            ?: throw BadRequestException("Poynt product active status is invalid")
    }

    private fun string(value: JsonObject, name: String): String? =
        value[name]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

    private companion object {
        const val CATALOG_PAGE_SIZE = 100
    }
}

private data class PreparedPoyntOrder(
    val configuration: PoyntCatalogConfiguration,
    val order: PoyntOrder
)

fun interface PoyntCheckoutConfigurationResolver {
    fun resolve(request: CommerceCheckoutRequest): PoyntCatalogConfiguration
}

class PoyntSqlCheckoutConfigurationResolver(
    private val sql: PoyntCommerceSql
) : PoyntCheckoutConfigurationResolver {
    override fun resolve(request: CommerceCheckoutRequest): PoyntCatalogConfiguration {
        val integrationId = request.integrationConfigurationId?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Commerce integration configuration is required")
        val actorUserId = request.actorUserId?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Commerce checkout actor is required")
        val row = if (request.sourceChannel in setOf("COUNTER", "COUNTER_REDEMPTION")) {
            sql.counterCatalogConfiguration(request.transactionId, actorUserId)
                ?.takeIf {
                    it.organizationId == request.organizationId &&
                        it.integrationConfigurationId == integrationId
                }
        } else {
            sql.catalogConfiguration(request.organizationId, integrationId, actorUserId)
        } ?: throw BadRequestException("Poynt checkout configuration is unavailable")
        return PoyntCatalogConfiguration(
            row.integrationConfigurationId,
            row.organizationId,
            row.applicationId,
            row.businessId,
            row.providerStoreId,
            row.secretReference,
            row.merchantCurrencyCode,
            row.lastIncrementalSyncAt
        )
    }
}

data class PoyntCatalogConfigurationRow(var integrationConfigurationId: String="",var organizationId: String="",var applicationId: String="",var businessId: String="",var providerStoreId: String?=null,var secretReference: String="",var merchantCurrencyCode: String="",var storeId: String?=null,var lastFullSyncAt: String?=null,var lastIncrementalSyncAt: String?=null)
interface PoyntCommerceSql {
 @SqlQuery("SELECT * FROM commerce_get_catalog_configuration(:organizationId,:integrationId,:actorUserId)") @RegisterBeanMapper(PoyntCatalogConfigurationRow::class)
 fun catalogConfiguration(@Bind("organizationId") organizationId:String,@Bind("integrationId") integrationId:String,@Bind("actorUserId") actorUserId:String):PoyntCatalogConfigurationRow?

 @SqlQuery("SELECT * FROM commerce_get_poynt_catalog_configuration_for_counter_transaction(:transactionId,:actorUserId)") @RegisterBeanMapper(PoyntCatalogConfigurationRow::class)
 fun counterCatalogConfiguration(@Bind("transactionId") transactionId:String,@Bind("actorUserId") actorUserId:String):PoyntCatalogConfigurationRow?

 @SqlQuery(
    "SELECT * FROM commerce_get_poynt_catalog_configuration_for_counter_redemption_review(" +
        ":organizationId, :redemptionTransactionId, :storeId, :staffId, :actorUserId)"
)
@RegisterBeanMapper(PoyntCatalogConfigurationRow::class)
fun counterRedemptionReviewCatalogConfiguration(
    @Bind("organizationId") organizationId: String,
    @Bind("redemptionTransactionId") redemptionTransactionId: String,
    @Bind("storeId") storeId: String,
    @Bind("staffId") staffId: String,
    @Bind("actorUserId") actorUserId: String
): PoyntCatalogConfigurationRow?
}
