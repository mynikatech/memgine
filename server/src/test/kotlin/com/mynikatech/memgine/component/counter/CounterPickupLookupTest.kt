package com.mynikatech.memgine.component.counter

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CounterPickupLookupTest {
    private val token = "A".repeat(43)
    private val sql = Files.readString(Path.of("..", "DB", "liquibase", "sql", "309b-counter-pickup-lookup.sql"))

    @Test
    fun `hashes the exact canonical issuer payload and accepts keyboard framing whitespace`() {
        assertEquals("0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a", counterPickupDigest(" MEMGINE_PICKUP:$token\r\n"))
    }

    @Test
    fun `rejects short codes redemption QRs wrapped values and noncanonical tokens`() {
        listOf("123456", "MEMGINE_REDEMPTION:$token", "https://example.test/MEMGINE_PICKUP:$token",
            "MEMGINE_PICKUP:${token.dropLast(1)}B", "MEMGINE_PICKUP:$token=", "MEMGINE_PICKUP:${token.dropLast(1)}")
            .forEach { assertNull(counterPickupDigest(it)) }
        assertEquals("RTX_00000091", counterPickupOrderReference(" #RTX_00000091 "))
        assertNull(counterPickupOrderReference("MEMGINE_PICKUP:$token"))
    }

    @Test
    fun `scopes both reads and validates credential lifecycle before verification`() {
        assertEquals(2, Regex("get_counter_order_stores\\(p_org,p_actor,p_staff,p_store\\)").findAll(sql).count())
        assertTrue(sql.contains("f.organization_id=p_org"))
        assertTrue(sql.contains("f.store_id=p_store"))
        assertTrue(sql.contains("kind.status_code='PICKUP_QR'"))
        val gates = listOf("WHEN NOT s.authorized", "WHEN c.fulfillment_id IS NULL", "WHEN c.store_id<>p_store", "WHEN c.used_at IS NOT NULL",
            "WHEN c.revoked_at IS NOT NULL", "WHEN c.expires_at IS NULL OR c.expires_at<=", "WHEN c.state NOT IN ('PLACED','PREPARING','READY')", "ELSE 'VERIFIED'")
        val positions = gates.map { sql.indexOf(it) }
        assertTrue(positions.all { it >= 0 } && positions.zipWithNext().all { (before, after) -> before < after })
    }

    @Test
    fun `only a scoped success exposes an order id and neither read changes state`() {
        assertEquals("""{"code":"VERIFIED","orderId":"FUL_order"}""", Json.encodeToString(CounterPickupLookupResult("VERIFIED", "FUL_order")))
        assertEquals("""{"code":"WRONG_STORE"}""", Json.encodeToString(CounterPickupLookupResult("WRONG_STORE")))
        assertTrue(sql.contains("WHEN code='VERIFIED' THEN jsonb_build_object('code',code,'orderId',fulfillment_id)"))
        assertTrue(sql.contains("WHEN m.count=1 THEN jsonb_build_object('code','LOCATED','orderId',m.id)"))
        assertFalse(Regex("\\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\\b", RegexOption.IGNORE_CASE).containsMatchIn(sql))
    }
}
