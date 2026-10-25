package com.mynikatech.memgine.component.benefit

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.BenefitStoreAvailabilityMode
import com.mynikatech.memgine.net.dto.BenefitStoreAvailabilityWriteDto
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class BenefitStoreAvailabilityTest {
    @Test
    fun `new Benefit requires an explicit Store availability`() {
        assertFailsWith<BadRequestException> {
            validateStoreAvailability(null, create = true)
        }
    }

    @Test
    fun `older update payload leaves existing availability unchanged`() {
        assertNull(validateStoreAvailability(null, create = false))
    }

    @Test
    fun `ALL_STORES accepts no Store ids`() {
        val availability = validateStoreAvailability(
            BenefitStoreAvailabilityWriteDto(BenefitStoreAvailabilityMode.ALL_STORES),
            create = true
        )!!

        assertEquals(BenefitStoreAvailabilityMode.ALL_STORES, availability.mode)
        assertEquals(emptyList(), availability.storeIds)
    }

    @Test
    fun `SELECTED_STORES accepts one or more distinct Store ids`() {
        val oneStore = validateStoreAvailability(
            BenefitStoreAvailabilityWriteDto(
                BenefitStoreAvailabilityMode.SELECTED_STORES,
                listOf("STORE-1")
            ),
            create = true
        )!!
        val multipleStores = validateStoreAvailability(
            BenefitStoreAvailabilityWriteDto(
                BenefitStoreAvailabilityMode.SELECTED_STORES,
                listOf("STORE-1", "STORE-2")
            ),
            create = true
        )!!

        assertEquals(listOf("STORE-1"), oneStore.storeIds)
        assertEquals(listOf("STORE-1", "STORE-2"), multipleStores.storeIds)
    }

    @Test
    fun `invalid selected Store lists are rejected before persistence`() {
        listOf(
            BenefitStoreAvailabilityWriteDto(BenefitStoreAvailabilityMode.SELECTED_STORES),
            BenefitStoreAvailabilityWriteDto(BenefitStoreAvailabilityMode.SELECTED_STORES, emptyList()),
            BenefitStoreAvailabilityWriteDto(BenefitStoreAvailabilityMode.SELECTED_STORES, listOf("")),
            BenefitStoreAvailabilityWriteDto(BenefitStoreAvailabilityMode.SELECTED_STORES, listOf("STORE-1", "STORE-1")),
            BenefitStoreAvailabilityWriteDto(BenefitStoreAvailabilityMode.ALL_STORES, listOf("STORE-1"))
        ).forEach { request ->
            assertFailsWith<BadRequestException> {
                validateStoreAvailability(request, create = true)
            }
        }
    }

    @Test
    fun `database function rejects cross organization inactive and deleted Stores`() {
        val sql = migrationSql()

        assertEquals(true, sql.contains("s.organization_id = p_organization_id"))
        assertEquals(true, sql.contains("AND NOT s.is_deleted"))
        assertEquals(true, sql.contains("store_status.status_code = 'ACTIVE'"))
        assertEquals(true, sql.contains("Selected Store is unavailable or belongs to another organization"))
    }

    @Test
    fun `save function preserves existing selection on compatible replay and atomically replaces changed selection`() {
        val sql = migrationSql()

        assertEquals(
            true,
            sql.contains("AND benefit_store_availability.availability_mode IS DISTINCT FROM EXCLUDED.availability_mode")
        )
        assertEquals(true, sql.contains("OR NOT selected.store_id = ANY(p_store_ids)"))
        assertEquals(true, sql.contains("ON CONFLICT (benefit_id, store_id) DO UPDATE"))
        assertEquals(true, sql.contains("PERFORM 1\n      FROM benefits"))
    }

    @Test
    fun `migration backfills existing Benefits and fails closed when availability is missing`() {
        val sql = migrationSql()

        assertEquals(true, sql.contains("'ALL_STORES'"))
        assertEquals(true, sql.contains("Benefit Store availability is unavailable"))
        assertEquals(true, sql.contains("p_store_id IS NULL"))
    }

    @Test
    fun `Store eligibility is checked before direct Counter redemption and Commerce preparation`() {
        val sql = migrationSql()

        assertEquals(true, sql.contains("counter_redeem_benefits("))
        assertEquals(true, sql.contains("commerce_prepare_counter_redemption_transaction("))
        assertEquals(true, sql.contains("Poynt Product Catalog is not configured for this Store"))
        assertEquals(true, sql.contains("Select a POS product for this redemption"))
    }

    private fun migrationSql(): String {
        val relative = Path.of("DB", "liquibase", "sql", "212-benefit-store-availability.sql")
        val root = generateSequence(Path.of("").toAbsolutePath()) { it.parent }
            .firstOrNull { Files.isRegularFile(it.resolve(relative)) }
            ?: error("Migration 212 was not found from the test working directory")
        return Files.readString(root.resolve(relative))
    }
}
