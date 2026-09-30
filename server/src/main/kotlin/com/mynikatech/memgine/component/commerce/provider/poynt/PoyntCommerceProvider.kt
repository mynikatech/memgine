package com.mynikatech.memgine.component.commerce.provider.poynt

import com.mynikatech.memgine.component.commerce.*
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.CommerceCapability
import com.mynikatech.memgine.net.dto.CommerceCheckoutRequest
import com.mynikatech.memgine.net.dto.CommerceCheckoutResult
import com.mynikatech.memgine.net.dto.CommerceProductSnapshotWriteDto
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
        val configuration = config(request.organizationId, request.integrationConfigurationId, request.actorUserId)
        (paymentBridgeClient ?: throw BadRequestException("Poynt Payment Bridge client is unavailable")).dispatch(configuration, request)
    }
    override fun getProduct(request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto? = product(request)
    override fun syncProduct(request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto? = product(request)
    override fun syncCatalog(request: CommerceCatalogSyncRequest): List<CommerceProductSnapshotWriteDto> {
        val config = config(request.organizationId, request.integrationConfigurationId, request.actorUserId)
        val mapped = mutableListOf<CommerceProductSnapshotWriteDto>()
        var offset = 0
        while (true) {
            val body = client.get(config, client.productsUri(config.businessId, offset), if (request.incremental) config.lastIncrementalSyncAt else request.modifiedSince)
            val products = parseProducts(body)
            mapped += products.flatMap { mapProduct(it, config, null) }
            if (products.size < 100) break
            offset += products.size
        }
        return mapped
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
        val config = config(request.organizationId, request.integrationConfigurationId, request.actorUserId)
        val body = client.get(config, client.productUri(config.businessId, request.externalProductId))
        val product = parseProduct(Json.parseToJsonElement(body).jsonObject) ?: return null
        return mapProduct(product, config, null).firstOrNull { it.externalVariantId == request.externalVariantId }
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
        val orderDiscounts = request.materializedAdjustments.filter { it.targetLineId == null }.map(::discount)
        return PreparedPoyntOrder(
            configuration,
            PoyntOrder(
                items = items,
                amounts = PoyntOrderAmounts(
                    subTotal = subtotal,
                    taxTotal = 0,
                    discountTotal = discountTotal,
                    feeTotal = 0,
                    netTotal = subtotal - discountTotal,
                    currency = currency
                ),
                discounts = orderDiscounts,
                context = PoyntOrderContext(
                    source = request.sourceChannel,
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
                details = "Memgine membership",
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
        amount = adjustment.appliedAmountMinor
    )

    private fun result(order: PoyntOrder): CommerceCheckoutResult {
        val id = order.id?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Poynt order response did not include an order ID")
        val amounts = order.amounts
        return CommerceCheckoutResult(
            providerOrderId = id,
            providerStatus = order.statuses?.status ?: "UNKNOWN",
            subtotalMinor = amounts?.subTotal,
            adjustmentTotalMinor = amounts?.discountTotal,
            taxTotalMinor = amounts?.taxTotal,
            totalMinor = amounts?.netTotal,
            currencyCode = amounts?.currency
        )
    }

    private fun orderClientOrThrow(): PoyntOrderClient =
        orderClient ?: throw BadRequestException("Poynt order client is unavailable")

    private fun checkoutConfigurationResolverOrThrow(): PoyntCheckoutConfigurationResolver =
        checkoutConfigurationResolver ?: throw BadRequestException("Poynt checkout configuration is unavailable")

    private fun config(org: String, integration: String, actor: String): PoyntCatalogConfiguration = sql.catalogConfiguration(org, integration, actor)?.let {
        PoyntCatalogConfiguration(it.integrationConfigurationId,it.organizationId,it.applicationId,it.businessId,it.providerStoreId,it.secretReference,it.merchantCurrencyCode,it.lastIncrementalSyncAt)
    } ?: throw BadRequestException("Poynt catalog configuration is unavailable")

    private fun mapProduct(product: PoyntProduct, config: PoyntCatalogConfiguration, storeId: String?): List<CommerceProductSnapshotWriteDto> {
        val variants = product.variants.filter { it.active }
        val choices = if (variants.isEmpty()) listOf<PoyntProductVariant?>(null) else variants
        return choices.map { variant ->
            val price = variant?.price ?: product.price ?: throw BadRequestException("Poynt product price is unavailable")
            val amount = price.amount ?: throw BadRequestException("Poynt product price is unavailable")
            CommerceProductSnapshotWriteDto(config.integrationConfigurationId, storeId, product.id, variant?.id ?: variant?.sku, variant?.sku ?: product.sku ?: product.shortCode, listOfNotNull(product.name, variant?.name).joinToString(" - "), product.description, (price.currency ?: config.merchantCurrencyCode).uppercase(), amount, product.active && (variant?.active != false), variant?.updatedAt ?: product.updatedAt)
        }
    }

    private fun parseProducts(body: String): List<PoyntProduct> {
        val root = Json.parseToJsonElement(body).jsonObject
        val array = root["products"] ?: root["items"] ?: return emptyList()
        return array.jsonArray.mapNotNull { parseProduct(it.jsonObject) }
    }
    private fun parseProduct(o: JsonObject): PoyntProduct? {
        val id = o["id"]?.jsonPrimitive?.contentOrNull ?: return null
        fun text(name: String) = o[name]?.jsonPrimitive?.contentOrNull
        fun price(element: JsonElement?): PoyntPrice? { val p=element?.jsonObject ?: return null; return PoyntPrice(p["amount"]?.jsonPrimitive?.longOrNull,p["currency"]?.jsonPrimitive?.contentOrNull) }
        val variants = o["variants"]?.jsonArray?.mapNotNull { v -> val x=v.jsonObject; PoyntProductVariant(x["id"]?.jsonPrimitive?.contentOrNull,x["sku"]?.jsonPrimitive?.contentOrNull,x["name"]?.jsonPrimitive?.contentOrNull,price(x["price"]),x["active"]?.jsonPrimitive?.booleanOrNull ?: true,x["updatedAt"]?.jsonPrimitive?.contentOrNull) } ?: emptyList()
        return PoyntProduct(id,text("name") ?: return null,text("description"),text("sku"),text("shortCode"),price(o["price"]),variants,o["active"]?.jsonPrimitive?.booleanOrNull ?: true,text("updatedAt"))
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
        val row = sql.catalogConfiguration(request.organizationId, integrationId, actorUserId)
            ?: throw BadRequestException("Poynt checkout configuration is unavailable")
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
}
