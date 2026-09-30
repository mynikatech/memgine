package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.*
import java.lang.reflect.Proxy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class CommerceServiceProviderOrderTest {
    private class FakeProvider(
        private val product: CommerceProductSnapshotWriteDto? = currentProduct(),
        private val result: CommerceCheckoutResult = validResult()
    ) : CommerceCatalogProvider, CommerceCheckoutProvider {
        override val providerCode = "FAKE"
        override val capabilities = setOf(CommerceCapability.CATALOG, CommerceCapability.PRODUCT_LOOKUP, CommerceCapability.ORDER, CommerceCapability.TERMINAL_PAYMENT)
        var prepareCalls = 0
        var startCalls = 0
        var request: CommerceCheckoutRequest? = null

        override fun getProduct(request: CommerceCatalogProductRequest) = product
        override fun syncProduct(request: CommerceCatalogProductRequest) = product
        override fun syncCatalog(request: CommerceCatalogSyncRequest) = emptyList<CommerceProductSnapshotWriteDto>()
        override fun prepareCheckout(request: CommerceCheckoutRequest): CommerceCheckoutResult {
            prepareCalls++
            this.request = request
            return CommerceCheckoutResult(providerStatus = "PREPARED")
        }
        override fun startCheckout(request: CommerceCheckoutRequest): CommerceCheckoutResult {
            startCalls++
            this.request = request
            return result
        }
        override fun getCheckoutStatus(request: CommerceCheckoutRequest) = result
        override fun cancelCheckout(request: CommerceCheckoutRequest) = result
    }

    @Test fun `ready transaction uses registry provider current price and persists order created`() {
        val state = State()
        val provider = FakeProvider()
        val result = service(state, provider).submitProviderOrder("org", "transaction", "actor")

        assertEquals("ORDER_CREATED", result.transaction.status)
        assertEquals("provider-order", result.transaction.providerOrderId)
        assertEquals(1, provider.prepareCalls)
        assertEquals(1, provider.startCalls)
        assertEquals("integration", provider.request?.integrationConfigurationId)
        assertEquals("actor", provider.request?.actorUserId)
        assertEquals("persisted-idempotency", provider.request?.idempotencyKey)
        assertEquals(600, provider.request?.lines?.single()?.unitPriceMinorAuthoritative)
        assertEquals(1, state.persistCalls)
        assertEquals("provider-order", state.persistedOrderId)
        assertEquals("CAD", state.persistedCurrency)
        assertTrue(state.persistedLinePricesJson!!.contains("600"))
    }

    @Test fun `order created retry returns persisted transaction without another provider post`() {
        val state = State(status = "ORDER_CREATED", providerOrderId = "provider-order")
        val provider = FakeProvider()

        val result = service(state, provider).submitProviderOrder("org", "transaction", "actor")

        assertEquals("ORDER_CREATED", result.transaction.status)
        assertEquals(0, provider.startCalls)
        assertEquals(0, state.persistCalls)
    }

    @Test fun `membership lines and adjustments are submitted to provider`() {
        val membership = State(lineType = "MEMBERSHIP")
        val membershipProvider = FakeProvider(
            result = CommerceCheckoutResult(
                providerOrderId = "provider-order",
                providerStatus = "OPENED",
                subtotalMinor = 2000,
                adjustmentTotalMinor = 0,
                taxTotalMinor = 0,
                totalMinor = 2000,
                currencyCode = "CAD"
            )
        )

        service(membership, membershipProvider)
            .submitProviderOrder("org", "transaction", "actor")

        assertEquals(1, membershipProvider.startCalls)

        val adjusted = State(hasAdjustment = true)
        val adjustedProvider = FakeProvider(
            result = CommerceCheckoutResult(
                providerOrderId = "provider-order",
                providerStatus = "OPENED",
                subtotalMinor = 1200,
                adjustmentTotalMinor = 100,
                taxTotalMinor = 0,
                totalMinor = 1100,
                currencyCode = "CAD"
            )
        )

        service(adjusted, adjustedProvider)
            .submitProviderOrder("org", "transaction", "actor")

        assertEquals(1, adjustedProvider.startCalls)
    }

    @Test fun `mapping from another integration is rejected before provider invocation`() {
        val state = State(mappingIntegrationId = "other-integration")
        val provider = FakeProvider()

        assertFailsWith<BadRequestException> {
            service(state, provider).submitProviderOrder("org", "transaction", "actor")
        }
        assertEquals(0, provider.startCalls)
        assertEquals(0, state.persistCalls)
    }

    @Test fun `missing current product and malformed provider result do not persist lifecycle`() {
        val unavailable = State()
        assertFailsWith<BadRequestException> {
            service(unavailable, FakeProvider(product = null)).submitProviderOrder("org", "transaction", "actor")
        }
        assertEquals(0, unavailable.persistCalls)

        val malformed = State()
        assertFailsWith<BadRequestException> {
            service(malformed, FakeProvider(result = validResult().copy(providerOrderId = null))).submitProviderOrder("org", "transaction", "actor")
        }
        assertEquals(0, malformed.persistCalls)
    }

    @Test fun `terminal payment uses persisted order values and records only a successful provider result`() {
        val state = State(status = "ORDER_CREATED", providerOrderId = "provider-order").apply {
            transaction.totalMinor = 600
            transaction.currencyCode = "CAD"
        }
        val service = service(state, FakeProvider())
        val instruction = service.startTerminalPayment("org", "transaction", "actor")
        assertEquals("provider-order", instruction.providerOrderId)
        assertEquals(600, instruction.amountMinor)
        assertEquals("CAD", instruction.currencyCode)
        assertEquals("PROVIDER_IN_PROGRESS", state.transaction.status)

        service.recordTerminalPaymentResult("org", "transaction", "actor",
            CommerceTerminalPaymentResultRequest("provider-payment", "SUCCEEDED", 600, "CAD"))
        assertEquals("PROVIDER_SUCCEEDED", state.transaction.status)
    }

    private fun service(state: State, provider: FakeProvider): CommerceService =
        CommerceService(state.sql(), CommerceProviderRegistry(listOf(provider)))

    private class State(
        status: String = "READY_FOR_PROVIDER",
        providerOrderId: String? = null,
        private val lineType: String = "EXTERNAL_PRODUCT",
        private val hasAdjustment: Boolean = false,
        private val mappingIntegrationId: String = "integration"
    ) {
        val transaction = CommerceTransactionRow(
            transactionId = "transaction", organizationId = "org", storeId = "store",
            integrationConfigurationId = "integration", sourceChannel = "COUNTER", status = status,
            providerOrderId = providerOrderId, idempotencyKey = "persisted-idempotency"
        )
        var persistCalls = 0
        var persistedOrderId: String? = null
        var persistedCurrency: String? = null
        var persistedLinePricesJson: String? = null

        fun sql(): CommerceSql = Proxy.newProxyInstance(
            CommerceSql::class.java.classLoader,
            arrayOf(CommerceSql::class.java)
        ) { _, method, args ->
            when (method.name) {
                "transaction" -> transaction
                "transactionLines" -> listOf(
                    if (lineType == "MEMBERSHIP") {
                        CommerceTransactionLineRow(
                            lineId = "line",
                            transactionId = "transaction",
                            lineType = "MEMBERSHIP",
                            subscriptionPlanId = "plan-1",
                            description = "Monthly Coffee Membership",
                            quantity = 1,
                            unitPriceMinorAuthoritative = 2000,
                            lineSubtotalMinor = 2000,
                            currencyCode = "CAD",
                            priceSource = "MEMGINE_MEMBERSHIP"
                        )
                    } else {
                        CommerceTransactionLineRow(
                            lineId = "line",
                            transactionId = "transaction",
                            lineType = "EXTERNAL_PRODUCT",
                            productMappingId = "mapping",
                            externalProductId = "product",
                            externalVariantId = "variant",
                            description = "Coffee",
                            quantity = 2,
                            unitPriceMinorSnapshot = 500,
                            currencyCode = "CAD",
                            priceSource = "EXTERNAL_SNAPSHOT"
                        )
                    }
                )
                "transactionAdjustments" -> if (hasAdjustment) listOf(
                    CommerceTransactionAdjustmentRow(
                        adjustmentId = "adjustment",
                        transactionId = "transaction",
                        targetLineId = "line",
                        commerceAdjustmentId = "commerce-adjustment-1",
                        sourceType = "BENEFIT",
                        sourceId = "benefit-1",
                        adjustmentType = "PRODUCT_FIXED_OFF",
                        requestedAmountMinor = 100,
                        currencyCode = "CAD",
                        status = "REQUESTED"
                    )
                ) else emptyList<CommerceTransactionAdjustmentRow>()
                "transactionRedemptions" -> emptyList<CommerceTransactionRedemptionRow>()
                "integrations" -> listOf(CommerceIntegrationRow("integration", "Integration", "FAKE", "POS"))
                "mappings" -> listOf(CommerceProductMappingRow(
                    mappingId = "mapping", organizationId = "org", integrationConfigurationId = mappingIntegrationId,
                    storeId = "store", externalProductId = "product", externalVariantId = "variant", active = true
                ))
                "persistMaterializedProviderOrder" -> {
                    persistCalls++
                    persistedOrderId = args!![1] as String
                    persistedLinePricesJson = args[2] as String
                    persistedCurrency = args[8] as String
                    transaction.status = "ORDER_CREATED"
                    transaction.providerOrderId = persistedOrderId
                    true
                }
                "startTerminalPayment" -> { transaction.status = "PROVIDER_IN_PROGRESS"; true }
                "recordTerminalPaymentResult" -> {
                    if (args!![3] == "SUCCEEDED") transaction.status = "PROVIDER_SUCCEEDED"
                    else transaction.status = "ORDER_CREATED"
                    true
                }
                else -> throw UnsupportedOperationException("Unexpected CommerceSql call: ${method.name}")
            }
        } as CommerceSql
    }

    private companion object {
        fun currentProduct() = CommerceProductSnapshotWriteDto(
            integrationConfigurationId = "integration", storeId = "store", externalProductId = "product",
            externalVariantId = "variant", productName = "Coffee", currencyCode = "CAD",
            unitPriceMinorSnapshot = 600, active = true
        )
        fun validResult() = CommerceCheckoutResult(
            providerOrderId = "provider-order", providerStatus = "OPENED", subtotalMinor = 1200,
            adjustmentTotalMinor = 0, taxTotalMinor = 156, totalMinor = 1356, currencyCode = "CAD"
        )
    }
}
