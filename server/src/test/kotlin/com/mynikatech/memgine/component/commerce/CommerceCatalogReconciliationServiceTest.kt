package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.net.dto.CommerceProductSnapshotWriteDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CommerceCatalogReconciliationServiceTest {
    private val service = CommerceCatalogReconciliationService()

    @Test
    fun `empty canonical catalog produces new candidates without writes`() {
        val plan = reconcile(snapshots = listOf(snapshot("coffee", sku = "COFFEE"), snapshot("tea", sku = "TEA")))

        assertEquals(listOf(CommerceCatalogReconciliationAction.NEW, CommerceCatalogReconciliationAction.NEW), plan.rows.map { it.action })
        assertEquals(listOf("coffee", "tea"), plan.rows.map { it.externalProductId })
        assertTrue(plan.rows.all { it.canonicalProductId == null })
    }

    @Test
    fun `existing exact integration mapping is retained and provider changes are update only`() {
        val mapping = mapping("map-coffee", "PRD-coffee", "integration-a", "coffee")
        val previous = previousSnapshot("integration-a", "coffee", price = 100)

        val unchanged = reconcile(
            snapshots = listOf(snapshot("coffee", price = 100)),
            products = listOf(product("PRD-coffee", sku = "COFFEE")),
            mappings = listOf(mapping),
            previous = listOf(previous)
        ).rows.single()
        val update = reconcile(
            snapshots = listOf(snapshot("coffee", price = 125)),
            products = listOf(product("PRD-coffee", sku = "COFFEE")),
            mappings = listOf(mapping),
            previous = listOf(previous)
        ).rows.single()

        assertEquals(CommerceCatalogReconciliationAction.UNCHANGED, unchanged.action)
        assertEquals(CommerceCatalogReconciliationAction.UPDATE, update.action)
        assertEquals("PRD-coffee", update.canonicalProductId)
        assertEquals(100L, update.previousAttributes!!.unitPriceMinor)
        assertEquals(125L, update.proposedAttributes!!.unitPriceMinor)
    }

    @Test
    fun `uniquely matching Excel imported business SKU is matched while duplicate canonical SKU conflicts`() {
        val matched = reconcile(
            snapshots = listOf(snapshot("poynt-coffee", sku = "COFFEE")),
            products = listOf(product("PRD-coffee", sku = "COFFEE"))
        ).rows.single()
        val conflict = reconcile(
            snapshots = listOf(snapshot("poynt-coffee", sku = "COFFEE")),
            products = listOf(product("PRD-coffee-a", sku = "COFFEE"), product("PRD-coffee-b", sku = "COFFEE"))
        ).rows.single()

        assertEquals(CommerceCatalogReconciliationAction.MATCHED, matched.action)
        assertEquals("PRD-coffee", matched.canonicalProductId)
        assertEquals(CommerceCatalogReconciliationAction.CONFLICT, conflict.action)
    }

    @Test
    fun `duplicate Poynt SKUs retain distinct identities and blank SKU remains a new candidate`() {
        val rows = reconcile(snapshots = listOf(
            snapshot("poynt-a", sku = "COFFEE"),
            snapshot("poynt-b", sku = "COFFEE"),
            snapshot("poynt-c", sku = null)
        )).rows

        assertEquals(listOf("poynt-a", "poynt-b", "poynt-c"), rows.map { it.externalProductId })
        assertEquals(listOf(CommerceCatalogReconciliationAction.NEW, CommerceCatalogReconciliationAction.NEW, CommerceCatalogReconciliationAction.NEW), rows.map { it.action })
    }

    @Test
    fun `legacy SKU mapping is a warning only when it agrees and conflict when it does not`() {
        val product = product("PRD-coffee", sku = "COFFEE")
        val compatible = reconcile(
            snapshots = listOf(snapshot("poynt-coffee", sku = "COFFEE")),
            products = listOf(product),
            mappings = listOf(mapping("legacy", "PRD-coffee", "integration-a", "COFFEE", sku = "COFFEE"))
        ).rows.single()
        val conflicting = reconcile(
            snapshots = listOf(snapshot("poynt-coffee", sku = "COFFEE")),
            products = listOf(product, product("PRD-other", sku = "OTHER")),
            mappings = listOf(mapping("legacy", "PRD-other", "integration-a", "COFFEE", sku = "COFFEE"))
        ).rows.single()

        assertEquals(CommerceCatalogReconciliationAction.MATCHED, compatible.action)
        assertTrue(compatible.reason!!.contains("Legacy"))
        assertEquals(CommerceCatalogReconciliationAction.CONFLICT, conflicting.action)
    }

    @Test
    fun `one business product can retain separate Poynt mappings in two integrations`() {
        val canonical = product("PRD-coffee", sku = "COFFEE")
        val first = reconcile(
            integration = "integration-a",
            snapshots = listOf(snapshot("poynt-a", sku = "COFFEE", price = 125, integration = "integration-a")),
            products = listOf(canonical),
            mappings = listOf(mapping("map-a", "PRD-coffee", "integration-a", "poynt-a")),
            previous = listOf(previousSnapshot("integration-a", "poynt-a", price = 100))
        ).rows.single()
        val second = reconcile(
            integration = "integration-b",
            snapshots = listOf(snapshot("poynt-b", sku = "COFFEE", price = 250, integration = "integration-b")),
            products = listOf(canonical),
            mappings = listOf(mapping("map-b", "PRD-coffee", "integration-b", "poynt-b")),
            previous = listOf(previousSnapshot("integration-b", "poynt-b", price = 200))
        ).rows.single()

        assertEquals("PRD-coffee", first.canonicalProductId)
        assertEquals("PRD-coffee", second.canonicalProductId)
        assertEquals(CommerceCatalogReconciliationAction.UPDATE, first.action)
        assertEquals(CommerceCatalogReconciliationAction.UPDATE, second.action)
        assertEquals(125L, first.proposedAttributes!!.unitPriceMinor)
        assertEquals(250L, second.proposedAttributes!!.unitPriceMinor)
    }

    @Test
    fun `inactive external products are not new and dependencies are reported without changes`() {
        val mapped = reconcile(
            snapshots = listOf(snapshot("coffee", active = false)),
            products = listOf(product("PRD-coffee", sku = "COFFEE")),
            mappings = listOf(mapping("map-coffee", "PRD-coffee", "integration-a", "coffee")),
            dependencies = setOf("PRD-coffee")
        ).rows.single()
        val unmapped = reconcile(snapshots = listOf(snapshot("tea", sku = "TEA", active = false))).rows.single()

        assertEquals(CommerceCatalogReconciliationAction.INACTIVE, mapped.action)
        assertEquals("PRD-coffee", mapped.canonicalProductId)
        assertTrue(mapped.hasDependentBusinessRules)
        assertEquals(CommerceCatalogReconciliationAction.INACTIVE, unmapped.action)
        assertNull(unmapped.canonicalProductId)
    }

    @Test
    fun `only a verified full catalog can mark a mapped external identity missing`() {
        val existing = mapping("map-coffee", "PRD-coffee", "integration-a", "coffee")
        val incremental = reconcile(
            snapshots = emptyList(),
            products = listOf(product("PRD-coffee", sku = "COFFEE"), product("PRD-manual", sku = "MANUAL")),
            mappings = listOf(existing),
            complete = false
        )
        val complete = reconcile(
            snapshots = emptyList(),
            products = listOf(product("PRD-coffee", sku = "COFFEE"), product("PRD-manual", sku = "MANUAL")),
            mappings = listOf(existing),
            complete = true
        )

        assertTrue(incremental.rows.isEmpty())
        assertEquals(CommerceCatalogReconciliationAction.MISSING, complete.rows.single().action)
        assertEquals("PRD-coffee", complete.rows.single().canonicalProductId)
    }

    @Test
    fun `variants retain distinct external identities and repeated planning is deterministic`() {
        val snapshots = listOf(
            snapshot("coffee", sku = "SMALL", variant = "small"),
            snapshot("coffee", sku = "LARGE", variant = "large")
        )
        val products = listOf(product("PRD-small", sku = "SMALL"), product("PRD-large", sku = "LARGE"))
        val first = reconcile(snapshots = snapshots, products = products)
        val second = reconcile(snapshots = snapshots.reversed(), products = products.reversed())

        assertEquals(listOf("large", "small"), first.rows.map { it.externalVariantId })
        assertEquals(first, second)
        assertEquals(listOf(CommerceCatalogReconciliationAction.MATCHED, CommerceCatalogReconciliationAction.MATCHED), first.rows.map { it.action })
    }

    @Test
    fun `ambiguous exact identity and invalid input require manual review`() {
        val ambiguous = reconcile(
            snapshots = listOf(snapshot("coffee")),
            products = listOf(product("PRD-a", sku = "COFFEE"), product("PRD-b", sku = "TEA")),
            mappings = listOf(
                mapping("map-a", "PRD-a", "integration-a", "coffee"),
                mapping("map-b", "PRD-b", "integration-a", "coffee")
            )
        ).rows.single()
        val invalid = reconcile(snapshots = listOf(snapshot("", sku = "COFFEE"))).rows.single()

        assertEquals(CommerceCatalogReconciliationAction.CONFLICT, ambiguous.action)
        assertEquals(CommerceCatalogReconciliationAction.INVALID, invalid.action)
    }

    private fun reconcile(
        integration: String = "integration-a",
        snapshots: List<CommerceProductSnapshotWriteDto>,
        products: List<CommerceCatalogCanonicalProduct> = emptyList(),
        mappings: List<CommerceProductMappingRow> = emptyList(),
        previous: List<CommerceProductSnapshotRow> = emptyList(),
        dependencies: Set<String> = emptySet(),
        complete: Boolean = false
    ) = service.plan(
        CommerceCatalogReconciliationInput(
            organizationId = "org",
            integrationConfigurationId = integration,
            fullCatalogComplete = complete,
            snapshots = snapshots,
            canonicalProducts = products,
            mappings = mappings,
            previousSnapshots = previous,
            dependentProductIds = dependencies
        )
    )

    private fun snapshot(
        externalProductId: String,
        sku: String? = "COFFEE",
        variant: String? = null,
        price: Long = 100,
        active: Boolean = true,
        integration: String = "integration-a"
    ) = CommerceProductSnapshotWriteDto(
        integrationConfigurationId = integration,
        externalProductId = externalProductId,
        externalVariantId = variant,
        externalSku = sku,
        productName = "Coffee",
        currencyCode = "CAD",
        unitPriceMinorSnapshot = price,
        active = active
    )

    private fun previousSnapshot(
        integration: String,
        externalProductId: String,
        variant: String? = null,
        price: Long,
        sku: String? = "COFFEE"
    ) = CommerceProductSnapshotRow(
        organizationId = "org",
        integrationConfigurationId = integration,
        externalProductId = externalProductId,
        externalVariantId = variant,
        externalSku = sku,
        productName = "Coffee",
        currencyCode = "CAD",
        unitPriceMinorSnapshot = price
    )

    private fun product(id: String, sku: String?, active: Boolean = true) =
        CommerceCatalogCanonicalProduct(id, "org", sku, active)

    private fun mapping(
        id: String,
        productId: String?,
        integration: String,
        externalProductId: String,
        variant: String? = null,
        sku: String? = "COFFEE"
    ) = CommerceProductMappingRow(
        mappingId = id,
        organizationId = "org",
        productId = productId,
        integrationConfigurationId = integration,
        externalProductId = externalProductId,
        externalVariantId = variant,
        externalSku = sku,
        active = true
    )
}
