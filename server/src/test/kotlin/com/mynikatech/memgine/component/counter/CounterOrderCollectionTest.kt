package com.mynikatech.memgine.component.counter

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Source-only contracts. Neither provider, database nor Liquibase is invoked. */
class CounterOrderCollectionTest {
    private fun migration(name: String) = Files.readString(Path.of("..", "DB", "liquibase", "sql", name))
    private val sql = migration("309c-counter-order-collection.sql")
    private val lifecycle = migration("309c-counter-order-lifecycle.sql")
    private val write = sql.substringAfter(".update_counter_order_lifecycle(").substringBefore("REVOKE ALL")

    @Test
    fun `detailed workflow and direct collection use canonical states`() {
        assertTrue(sql.contains("p_state='PLACED' AND p_command='START_PREPARING' THEN 'PREPARING'"))
        assertTrue(sql.contains("p_state='PREPARING' AND p_command='MARK_READY' THEN 'READY'"))
        assertTrue(sql.contains("p_state='READY' AND p_command='COMPLETE_COLLECTION' THEN 'FULFILLED'"))
        assertTrue(sql.contains("p_workflow IN ('NONE','SIMPLE') AND p_state='PLACED' AND p_command='COMPLETE_COLLECTION'"))
        assertTrue(write.contains("f.version_no IS DISTINCT FROM p_version"))
        assertTrue(write.contains("f.cancellation_requested_at IS NOT NULL"))
        assertTrue(write.contains("HANDOVER_CONFIRMED"))
    }

    @Test
    fun `scoped locks and credential checks precede the atomic writes`() {
        ordered(write, "counter_order_operator(", "FOR UPDATE OF f0", "ALREADY_FULFILLED", "STALE_ORDER",
            "FOR UPDATE OF q", "CREDENTIAL_USED", "CREDENTIAL_REVOKED", "CREDENTIAL_EXPIRED",
            "WHERE subscription_id=v_subscription AND NOT is_deleted FOR UPDATE",
            "ORDER BY i.payment_intent_id FOR UPDATE", "source_channel='CUSTOMER_FULFILLMENT' AND NOT is_deleted FOR UPDATE",
            "v_payment := counter_order_collection_payment", "consumed_quantity=reserved_quantity",
            "assert_fulfillment_pickup_entitlements(", "INSERT INTO redemptions(", "used_at=v_now", "status='COMPLETED'",
            "actual_collection_at=", "INSERT INTO fulfillment_actions(")
        assertTrue(write.contains("f0.organization_id=p_org AND f0.store_id=p_store"))
        assertTrue(write.contains("q.fulfillment_id=f.fulfillment_id AND q.token_hash=p_hash::char(64)"))
        assertTrue(write.contains("EXCEPTION WHEN unique_violation THEN"))
        assertTrue(write.contains("jsonb_build_object('staffId',p_staff,'storeId',p_store)"))
    }

    @Test
    fun `payment gate covers free and verified evidence and rejects financial risk`() {
        val payment = sql.substringAfter(".counter_order_collection_payment(").substringBefore("CREATE FUNCTION")
        ordered(payment, "FINANCIAL_EXCEPTION", "REFUND_CONFLICT", "i.status IN ('PENDING','PROCESSING')",
            "v_capture_count=0 AND v_terminal_count=0", "NO_PAYMENT_REQUIRED", "i.amount*100=c.total_minor",
            "v.merchant_store_id", "VERIFIED_ONLINE", "PAYMENT_REQUIRED", "a.amount_minor=c.total_minor", "VERIFIED_AT_COUNTER")
        assertTrue(payment.contains("late_capture_seen"))
        assertTrue(payment.contains("'PROVIDER_FAILED','CANCELLED'"))
        assertTrue(payment.contains("v.provider_transaction_id=c.provider_transaction_id"))
        assertFalse(payment.contains("transaction_receipts"))
    }

    @Test
    fun `existing customer projections observe collection without mutating the lookup contract`() {
        val customer = migration("308g-customer-fulfillment-final-corrections.sql")
        val lookup = migration("309b-counter-pickup-lookup.sql")
        assertTrue(customer.contains("st.status_code NOT IN ('FULFILLED','CANCELLED')"))
        assertTrue(customer.contains("f.fulfilled_at AT TIME ZONE 'UTC'"))
        assertTrue(customer.contains("h.reserved_quantity>h.consumed_quantity+h.released_quantity"))
        assertTrue(sql.contains("get_counter_fulfillment_orders(p_org,p_store,p_staff,p_actor,p_order"))
        assertFalse(Regex("\\b(?:INSERT|UPDATE|DELETE)\\b", RegexOption.IGNORE_CASE).containsMatchIn(lookup))
    }

    @Test
    fun `simple orders must be ready and collection uses persisted verification`() {
        assertTrue(lifecycle.contains("p_workflow='SIMPLE' AND p_state='PLACED' AND p_command='MARK_READY'"))
        assertTrue(lifecycle.contains("p_workflow IN ('SIMPLE','DETAILED') AND p_state='READY' AND p_command='COMPLETE_COLLECTION'"))
        val collection = lifecycle.substringAfter("IF p_command='COMPLETE_COLLECTION' THEN")
        ordered(collection, "COLLECTION_AUTHORIZED", "AUTHORIZATION_EXPIRED", "AUTHORIZATION_REVOKED",
            "FOR UPDATE OF q", "counter_order_collection_payment", "consumed_quantity=reserved_quantity", "used_at=v_now")
        assertFalse(collection.substringBefore("END;").contains("token_hash=p_hash"))
    }

    @Test
    fun `advance cash records payment on the existing Commerce transaction and Collect accepts only an exact mirror`() {
        assertTrue(lifecycle.contains("a.payment_channel='LEGACY_PAYMENT_INTENT' AND a.amount_minor=c.total_minor AND a.currency_code=c.currency_code"))
        assertTrue(lifecycle.contains("c.source_channel='CUSTOMER_FULFILLMENT' THEN RETURN true"))
        val cash = lifecycle.substringAfter("IF p_command IN ('START_CASH','CONFIRM_CASH')").substringBefore("v_target :=")
        ordered(cash, "AUTHORIZATION_REQUIRED", "ORDER BY i.payment_intent_id FOR UPDATE",
            "source_channel='CUSTOMER_FULFILLMENT' AND NOT is_deleted FOR UPDATE", "ENTITLEMENT_CONFLICT",
            "counter_order_collection_payment", "commerce_begin_counter_redemption_cash_payment",
            "commerce_confirm_counter_redemption_cash_payment")
        assertFalse(cash.contains("consumed_quantity=reserved_quantity"))
    }

    @Test
    fun `phone and assisted authorization require order-bound evidence`() {
        assertTrue(lifecycle.contains("b.payload->>'collectionOrderId'=p_order AND b.payload->>'counterActorId'=p_actor"))
        assertTrue(lifecycle.contains("b.staff_id=p_staff AND b.user_id=f.customer_user_id"))
        assertTrue(lifecycle.contains("business_otp_consume_context(v_source,'COUNTER_REDEMPTION_VERIFY')"))
        assertTrue(lifecycle.contains("upper(s.subscription_number)=upper(p_hash) AND customer_has_active_relationship(p_org,f.customer_user_id)"))
    }

    @Test
    fun `support requests record a case without automatic payment or entitlement mutations`() {
        val support = lifecycle.substringAfter("IF p_command IN ('LINK_SUPPORT','REQUEST_CANCELLATION','REPORT_NO_SHOW')").substringBefore("IF f.cancelled_at IS NOT NULL OR f.cancellation_requested_at")
        ordered(support, "r.customer_user_id=f.customer_user_id", "counter_support_request_visible(",
            "CANCELLATION_REQUESTED", "NO_SHOW_RECORDED", "support_reference_id")
        assertTrue(lifecycle.contains("THEN RETURN 'SUPPORT_UNRESOLVED'; END IF"))
        assertFalse(Regex("payment_refunds|UPDATE redemption_entitlement_reservations").containsMatchIn(support))
    }

    private fun ordered(body: String, vararg markers: String) {
        var start = 0
        for (marker in markers) {
            val index = body.indexOf(marker, start)
            assertTrue(index >= 0, "Missing or out-of-order marker: $marker")
            start = index + marker.length
        }
    }
}
