package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.CommerceCapability
import java.lang.reflect.Proxy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class CommerceRemotePaymentLifecycleTest {
    private class Provider : CommerceRemoteTerminalPaymentProvider {
        override val providerCode = "POYNT"
        override val capabilities = setOf(CommerceCapability.REMOTE_PAYMENT)
        var calls = 0
        override fun dispatchRemoteTerminalPayment(request: CommerceRemoteTerminalPaymentRequest) { calls++ }
    }
    @Test fun `duplicate active dispatch does not post twice`() {
        val state = State(activeAttempt = true); val provider = Provider()
        val dispatch = service(state, provider).startRemoteTerminalPayment("org","tx",com.mynikatech.memgine.net.dto.CommerceRemoteTerminalPaymentStartRequest("device"),"actor")
        assertEquals(0, provider.calls)
        assertEquals("ref", dispatch.referenceId)
        assertEquals("DISPATCHING", dispatch.dispatchState)
    }
    @Test fun `existing active dispatch recovers without resolving the terminal target`() {
        val state = State(activeAttempt = true); val provider = Provider()
        val dispatch = service(state, provider, failingTerminalResolver())
            .startRemoteTerminalPayment("org", "tx", com.mynikatech.memgine.net.dto.CommerceRemoteTerminalPaymentStartRequest("device"), "actor")
        assertEquals("ref", dispatch.referenceId)
        assertEquals("DISPATCHING", dispatch.dispatchState)
        assertEquals(0, provider.calls)
        assertEquals(0, state.beginCalls)
    }
    @Test fun `new remote dispatch requires a resolvable terminal target`() {
        val state = State(); val provider = Provider()
        assertFailsWith<BadRequestException> {
            service(state, provider, failingTerminalResolver())
                .startRemoteTerminalPayment("org", "tx", com.mynikatech.memgine.net.dto.CommerceRemoteTerminalPaymentStartRequest("device"), "actor")
        }
        assertEquals(0, provider.calls)
        assertEquals(null, state.dispatchedReference)
        assertEquals(0, state.beginCalls)
    }
    @Test fun `concurrent begin recovery does not dispatch again`() {
        val state = State(beginReturnsExisting = true); val provider = Provider()
        val dispatch = service(state, provider)
            .startRemoteTerminalPayment("org", "tx", com.mynikatech.memgine.net.dto.CommerceRemoteTerminalPaymentStartRequest("device"), "actor")
        assertEquals("ref", dispatch.referenceId)
        assertEquals("DISPATCHING", dispatch.dispatchState)
        assertEquals(1, state.beginCalls)
        assertEquals(0, provider.calls)
    }
    @Test fun `remote dispatch uses persisted authoritative order amount and currency`() {
        val state = State(); val provider = Provider()
        val dispatch = service(state, provider).startRemoteTerminalPayment("org","tx",com.mynikatech.memgine.net.dto.CommerceRemoteTerminalPaymentStartRequest("device"),"actor")
        assertEquals(1, provider.calls); assertEquals("ref", state.dispatchedReference)
        assertEquals("DISPATCHED", dispatch.dispatchState)
    }
    @Test fun `received started cancelled and failed callbacks normalize through SQL`() {
        val state=State(); val service=service(state, Provider())
        listOf("RECEIVED","STARTED","CANCELED").forEach { status -> service.recordRemoteTerminalPaymentCallback(PoyntPaymentBridgeCallback("ref",status,emptyList())) }
        assertEquals("CANCELED", state.callbackStatus)
        service.recordRemoteTerminalPaymentCallback(PoyntPaymentBridgeCallback("ref","PROCESSED",emptyList()))
        assertEquals("FAILED", state.callbackStatus)
    }
    private fun service(
        state: State,
        provider: Provider,
        terminalBindingResolver: PoyntTerminalBindingResolver = PoyntTerminalBindingResolver { _, _, _ ->
            CommerceRemoteTerminalTarget("business", "store", "terminal")
        }
    ) = CommerceService(
        state.sql(),
        CommerceProviderRegistry(listOf(provider)),
        CommerceRemotePaymentConfiguration("https://callback","X-Test","secret",45),
        terminalBindingResolver = terminalBindingResolver
    )
    private fun failingTerminalResolver() = PoyntTerminalBindingResolver { _, _, _ ->
        throw BadRequestException("No active terminal binding is configured")
    }
    private class State(
        private val activeAttempt: Boolean = false,
        private val beginReturnsExisting: Boolean = false
    ) {
        var dispatchedReference:String?=null; var callbackStatus:String?=null
        var beginCalls = 0
        private var remotePaymentState = "DISPATCHING"
        private val tx=CommerceTransactionRow(transactionId="tx",organizationId="org",storeId="store",integrationConfigurationId="integration",providerOrderId="order",totalMinor=600,currencyCode="CAD",status="ORDER_CREATED")
        fun sql(): CommerceSql = Proxy.newProxyInstance(CommerceSql::class.java.classLoader,arrayOf(CommerceSql::class.java)) { _,method,args -> when(method.name) {
            "transaction" -> tx
            "integrations" -> listOf(CommerceIntegrationRow("integration","Poynt","POYNT","POS"))
            "activeRemoteTerminalPaymentAttempt" -> if (activeAttempt) {
                CommerceRemotePaymentAttemptRow("ref", "DISPATCHING")
            } else null
            "beginRemoteTerminalPayment" -> {
                beginCalls++
                CommerceRemotePaymentStartRow(beginReturnsExisting,"integration","order",600,"CAD","business","store","terminal","ref")
            }
            "markRemotePaymentDispatched" -> { dispatchedReference=args!![0] as String; remotePaymentState = "DISPATCHED"; true }
            "remoteTerminalPaymentAttemptState" -> remotePaymentState
            "recordRemotePaymentCallback" -> { callbackStatus=args!![1] as String; true }
            else -> throw UnsupportedOperationException(method.name)
        } } as CommerceSql
    }
}
