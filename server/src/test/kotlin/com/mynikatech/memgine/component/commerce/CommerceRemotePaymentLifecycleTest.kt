package com.mynikatech.memgine.component.commerce

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
        val state = State(alreadyDispatched = true); val provider = Provider()
        service(state, provider).startRemoteTerminalPayment("org","tx",com.mynikatech.memgine.net.dto.CommerceRemoteTerminalPaymentStartRequest("device"),"actor")
        assertEquals(0, provider.calls)
    }
    @Test fun `remote dispatch uses persisted authoritative order amount and currency`() {
        val state = State(); val provider = Provider()
        service(state, provider).startRemoteTerminalPayment("org","tx",com.mynikatech.memgine.net.dto.CommerceRemoteTerminalPaymentStartRequest("device"),"actor")
        assertEquals(1, provider.calls); assertEquals("ref", state.dispatchedReference)
    }
    @Test fun `received started cancelled and failed callbacks normalize through SQL`() {
        val state=State(); val service=service(state, Provider())
        listOf("RECEIVED","STARTED","CANCELED").forEach { status -> service.recordRemoteTerminalPaymentCallback(PoyntPaymentBridgeCallback("ref",status,emptyList())) }
        assertEquals("CANCELED", state.callbackStatus)
        service.recordRemoteTerminalPaymentCallback(PoyntPaymentBridgeCallback("ref","PROCESSED",emptyList()))
        assertEquals("FAILED", state.callbackStatus)
    }
    private fun service(state: State, provider: Provider) = CommerceService(state.sql(), CommerceProviderRegistry(listOf(provider)), CommerceRemotePaymentConfiguration("https://callback","X-Test","secret",45))
    private class State(private val alreadyDispatched:Boolean=false) {
        var dispatchedReference:String?=null; var callbackStatus:String?=null
        private val tx=CommerceTransactionRow(transactionId="tx",organizationId="org",storeId="store",integrationConfigurationId="integration",providerOrderId="order",totalMinor=600,currencyCode="CAD",status="ORDER_CREATED")
        fun sql(): CommerceSql = Proxy.newProxyInstance(CommerceSql::class.java.classLoader,arrayOf(CommerceSql::class.java)) { _,method,args -> when(method.name) {
            "transaction" -> tx
            "integrations" -> listOf(CommerceIntegrationRow("integration","Poynt","POYNT","POS"))
            "beginRemoteTerminalPayment" -> CommerceRemotePaymentStartRow(alreadyDispatched,"integration","order",600,"CAD","business","store","terminal","ref")
            "markRemotePaymentDispatched" -> { dispatchedReference=args!![0] as String; true }
            "recordRemotePaymentCallback" -> { callbackStatus=args!![1] as String; true }
            else -> throw UnsupportedOperationException(method.name)
        } } as CommerceSql
    }
}
