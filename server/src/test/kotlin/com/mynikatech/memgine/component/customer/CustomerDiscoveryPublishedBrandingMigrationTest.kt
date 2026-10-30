package com.mynikatech.memgine.component.customer

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Source contract checks; PostgreSQL behaviour still needs an isolated database. */
class CustomerDiscoveryPublishedBrandingMigrationTest {
    private val oldSql = Files.readString(
        Path.of("..", "DB", "liquibase", "sql", "146-canonical-customer-discovery-products.sql")
    )
    private val newSql = Files.readString(
        Path.of("..", "DB", "liquibase", "sql", "246-customer-discovery-published-branding-colors.sql")
    )

    @Test
    fun `discovery colours come only from the published release snapshot`() {
        assertTrue(newSql.contains("cer.customer_experience_release_id = o.published_customer_experience_release_id"))
        assertTrue(newSql.contains("cs.status_code = 'PUBLISHED'"))
        assertTrue(newSql.contains("'backgroundColor', c.snapshot_data #> '{organizationBranding,backgroundColor}'"))
        assertTrue(newSql.contains("'textColor', c.snapshot_data #> '{organizationBranding,textColor}'"))
        assertFalse(newSql.contains("organization_branding ob"))
    }

    @Test
    fun `previous discovery filters and fields remain unchanged`() {
        val oldBody = oldSql.substringAfter("WITH candidate AS (")
        val newBody = newSql.substringAfter("WITH candidate AS (")
        val expected = oldBody.replace(
            "'accentColor', c.snapshot_data #> '{organizationBranding,accentColor}'",
            "'accentColor', c.snapshot_data #> '{organizationBranding,accentColor}',\n" +
                "                   'backgroundColor', c.snapshot_data #> '{organizationBranding,backgroundColor}',\n" +
                "                   'textColor', c.snapshot_data #> '{organizationBranding,textColor}'"
        )
        assertEquals(expected.trim(), newBody.trim())
    }
}
