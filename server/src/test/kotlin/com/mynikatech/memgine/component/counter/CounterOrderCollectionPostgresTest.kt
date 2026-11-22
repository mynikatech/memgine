package com.mynikatech.memgine.component.counter

import java.sql.Connection
import java.sql.DriverManager
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Assume.assumeTrue

/**
 * Opt-in integration contract for a disposable, pre-migrated local database.
 * Prepare one ready, free, uncollected Order with a fresh QR and an authorized
 * Counter operator. These tests commit one handover and never initiate payment.
 */
class CounterOrderCollectionPostgresTest {
    @Test
    fun `collection rolls back as a unit and concurrent confirmations perform one handover`() {
        assumeTrue(System.getenv("MEMGINE_309C_POSTGRES_TEST") == "1")
        val fixture = Fixture()
        val before = fixture.connect().use { fixture.snapshot(it) }
        assertEquals("READY", before.state)
        assertEquals(0, before.handoverCount)
        assertEquals(0, before.usedCount)
        assertEquals(0, before.consumed)
        assertEquals(0, before.receiptCount)
        assertTrue(before.reserved > 0)

        fixture.connect().use { transaction ->
            transaction.autoCommit = false
            try {
                assertTrue(fixture.verify(transaction).contains("\"code\": \"VERIFIED\""))
                assertEquals(before, fixture.snapshot(transaction))
                assertEquals("COLLECTION_AUTHORIZED", fixture.authorize(transaction, before.version))
                val authorized = fixture.snapshot(transaction)
                assertEquals(before.copy(version = before.version + 1), authorized)
                assertEquals("COLLECTION_COMPLETED", fixture.collect(transaction, authorized.version))
                assertCollected(authorized, fixture.snapshot(transaction))
                fixture.connect().use { assertEquals(before, fixture.snapshot(it)) }
            } finally {
                transaction.rollback()
            }
        }
        fixture.connect().use { assertEquals(before, fixture.snapshot(it)) }
        val authorized = fixture.connect().use { connection ->
            assertEquals("COLLECTION_AUTHORIZED", fixture.authorize(connection, before.version))
            fixture.snapshot(connection)
        }

        val start = CountDownLatch(1)
        val workers = Executors.newFixedThreadPool(2)
        try {
            val results = listOf(false, true).map { secondOperator ->
                workers.submit<String> {
                    fixture.connect().use { connection ->
                        check(start.await(10, TimeUnit.SECONDS))
                        fixture.collect(connection, authorized.version, secondOperator)
                    }
                }
            }
            start.countDown()
            assertEquals(setOf("COLLECTION_COMPLETED", "ALREADY_FULFILLED"), results.map { it.get(20, TimeUnit.SECONDS) }.toSet())
        } finally {
            workers.shutdownNow()
        }
        fixture.connect().use { assertCollected(authorized, fixture.snapshot(it)) }
    }

    private fun assertCollected(before: Snapshot, after: Snapshot) {
        assertEquals("FULFILLED", after.state)
        assertEquals(before.version + 1, after.version)
        assertEquals(before.reserved, after.consumed)
        assertEquals(1, after.handoverCount)
        assertEquals(1, after.usedCount)
        assertEquals(1, after.receiptCount)
    }

    private data class Snapshot(
        val version: Int, val state: String, val handoverCount: Int,
        val usedCount: Int, val consumed: Int, val reserved: Int, val receiptCount: Int,
    )

    private class Fixture {
        private fun env(key: String) = requireNotNull(System.getenv("MEMGINE_309C_TEST_$key")) { "Missing MEMGINE_309C_TEST_$key" }
        private val url = env("JDBC_URL").also {
            require(Regex("""jdbc:postgresql://127\.0\.0\.1:[0-9]+/memgine_309c_test""").matches(it))
        }
        private val schema = env("SCHEMA").also { require(Regex("[a-z][a-z0-9_]{0,62}").matches(it)) }
        private val org = env("ORG")
        private val store = env("STORE")
        private val staff = env("STAFF")
        private val actor = env("ACTOR")
        private val secondStaff = env("SECOND_STAFF").also { require(it != staff) }
        private val secondActor = env("SECOND_ACTOR").also { require(it != actor) }
        private val order = env("ORDER")
        private val hash = requireNotNull(counterPickupDigest(env("QR"))) { "Invalid fixture pickup QR" }

        fun connect(): Connection = DriverManager.getConnection(url, env("USER"), env("PASSWORD")).also { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT current_database()").use {
                    check(it.next() && it.getString(1) == "memgine_309c_test")
                }
            }
        }

        fun verify(db: Connection): String = result(db, "SELECT ${schema}.verify_counter_pickup_qr(?,?,?,?,?)", org, store, staff, actor, hash)

        fun authorize(db: Connection, version: Int): String = result(db,
            "SELECT ${schema}.update_counter_order_lifecycle(?,?,?,?,?,?,?,?)",
            org, store, staff, actor, order, version, "AUTHORIZE_PICKUP_QR", hash)

        fun collect(db: Connection, version: Int, secondOperator: Boolean = false): String = result(db,
            "SELECT ${schema}.update_counter_order_lifecycle(?,?,?,?,?,?,?,CAST(NULL AS varchar))",
            org, store, if (secondOperator) secondStaff else staff, if (secondOperator) secondActor else actor,
            order, version, "COMPLETE_COLLECTION")

        fun snapshot(db: Connection): Snapshot = db.prepareStatement("""
            SELECT f.version_no,s.status_code,
              (SELECT count(*) FROM $schema.fulfillment_actions a JOIN $schema.statuses ast ON ast.status_id=a.action_type_status_id
                WHERE a.fulfillment_id=f.fulfillment_id AND ast.status_code='HANDOVER_CONFIRMED'),
              (SELECT count(*) FROM $schema.fulfillment_credentials q WHERE q.fulfillment_id=f.fulfillment_id AND q.used_at IS NOT NULL),
              (SELECT sum(r.consumed_quantity) FROM $schema.redemption_entitlement_reservations r WHERE r.fulfillment_id=f.fulfillment_id),
              (SELECT sum(r.reserved_quantity) FROM $schema.redemption_entitlement_reservations r WHERE r.fulfillment_id=f.fulfillment_id),
              (SELECT count(*) FROM $schema.transaction_receipts r WHERE r.source_commerce_transaction_id=c.commerce_transaction_id)
            FROM $schema.fulfillments f JOIN $schema.statuses s ON s.status_id=f.fulfillment_status_id
            JOIN $schema.commerce_transactions c ON c.commerce_transaction_id=f.commerce_transaction_id
            WHERE f.fulfillment_id=? AND f.organization_id=? AND f.store_id=? AND c.total_minor=0
        """.trimIndent()).use { statement ->
            listOf(order, org, store).forEachIndexed { index, value -> statement.setString(index + 1, value) }
            statement.executeQuery().use {
                check(it.next()) { "Expected a free pickup fixture in the specified Store" }
                Snapshot(it.getInt(1), it.getString(2), it.getInt(3), it.getInt(4), it.getInt(5), it.getInt(6), it.getInt(7))
            }
        }

        private fun result(db: Connection, sql: String, vararg values: Any): String = db.prepareStatement(sql).use { statement ->
            statement.queryTimeout = 15
            values.forEachIndexed { index, value -> statement.setObject(index + 1, value) }
            statement.executeQuery().use { rows -> check(rows.next()); rows.getString(1) }
        }
    }
}
