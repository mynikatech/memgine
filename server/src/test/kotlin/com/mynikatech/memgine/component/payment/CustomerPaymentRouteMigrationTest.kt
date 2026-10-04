package com.mynikatech.memgine.component.payment

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Static boundary checks; the migration is intentionally not applied by tests. */
class CustomerPaymentRouteMigrationTest {
    private val sql by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "143-customer-commerce-payment-routing.sql"))
    }
    private val collectReader by lazy {
        sql.substringAfter("CREATE OR REPLACE FUNCTION \"\${schemaName}\".payment_get_poynt_collect_configuration(")
    }

    @Test fun `only one organization scoped CUSTOMER route can start payment`() {
        assertTrue(sql.contains("route.organization_id = p_organization_id"))
        assertTrue(sql.contains("route.source_channel = 'CUSTOMER'"))
        assertTrue(sql.contains("route.store_id IS NULL"))
        assertTrue(sql.contains("v_route_count <> 1"))
        assertTrue(sql.contains("customer_can_start_membership_purchase(p_organization_id, p_customer_user_id)"))
    }

    @Test fun `Poynt maps to remote Collect and its configured integration is verified`() {
        assertTrue(sql.contains("WHEN 'POYNT' THEN 'POYNT_COLLECT'"))
        assertTrue(sql.contains("FROM commerce_provider_catalog_configurations c"))
        assertTrue(sql.contains("c.integration_configuration_id = v_integration_id"))
        assertTrue(sql.contains("v_collect_integration_id IS DISTINCT FROM v_integration_id"))
        assertTrue(sql.contains("v_collect_count <> 1"))
        assertTrue(sql.contains("v_collect_currency IS DISTINCT FROM v_started.\"currencyCode\""))
        assertTrue(sql.contains("payment_start_customer_commerce_membership_intent("))
    }

    @Test fun `two Poynt integrations do not affect the selected route at start`() {
        assertTrue(sql.contains("c.integration_configuration_id = v_integration_id"))
        assertTrue(sql.contains("v_collect_count <> 1"))
        assertTrue(sql.contains("collect_integration_configuration_id = v_integration_id"))
        assertTrue(sql.contains("v_started.\"paymentIntentId\" IS DISTINCT FROM p_intent_id"))
        assertTrue(sql.contains("v_bound_integration_id IS DISTINCT FROM v_integration_id"))
    }

    @Test fun `bootstrap and confirmation read only the intent bound integration`() {
        assertTrue(collectReader.contains("v_intent.collect_integration_configuration_id IS NULL"))
        assertTrue(collectReader.contains(
            "c.integration_configuration_id = v_intent.collect_integration_configuration_id"
        ))
        assertTrue(collectReader.contains("c.merchant_currency_code = v_intent.currency_code"))
        assertTrue(collectReader.contains("integration_state.status_code = 'ACTIVE'"))
        assertFalse(collectReader.contains("SELECT count(*)"))
    }

    @Test fun `wrong organization or user cannot read another Collect configuration`() {
        assertTrue(collectReader.contains("pi.payment_intent_id = p_intent_id"))
        assertTrue(collectReader.contains("pi.organization_id = p_organization_id"))
        assertTrue(collectReader.contains("payment_actor_is_authorized(pi.payment_intent_id, p_actor_user_id)"))
        assertTrue(collectReader.contains("pi.authorization_mode = 'CUSTOMER_SESSION'"))
        assertTrue(collectReader.contains("RAISE EXCEPTION 'Collect payment is unavailable' USING ERRCODE = '42501'"))
    }

    @Test fun `route changes cannot rebind an existing intent`() {
        assertTrue(sql.contains("OLD.collect_integration_configuration_id IS NOT NULL"))
        assertTrue(sql.contains("NEW.collect_integration_configuration_id IS DISTINCT FROM"))
        assertTrue(sql.contains("RAISE EXCEPTION 'Collect payment integration is immutable'"))
        assertTrue(sql.contains("v_bound_integration_id IS DISTINCT FROM v_integration_id"))
        assertTrue(collectReader.contains(
            "c.integration_configuration_id = v_intent.collect_integration_configuration_id"
        ))
    }

    @Test fun `route resolution is not client supplied and definer privileges are restricted`() {
        assertTrue(!sql.contains("p_provider_code varchar"))
        assertTrue(sql.contains("p_actor_user_id IS DISTINCT FROM p_customer_user_id"))
        assertTrue(sql.contains("SET search_path = pg_catalog, \"\${schemaName}\""))
        assertTrue(sql.contains("FROM PUBLIC"))
        assertTrue(sql.contains("TO \"\${appRole}\""))
    }
}
