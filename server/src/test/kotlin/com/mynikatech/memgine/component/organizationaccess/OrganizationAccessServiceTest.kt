package com.mynikatech.memgine.component.organizationaccess

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.postgresql.util.PSQLException
import org.postgresql.util.ServerErrorMessage

class OrganizationAccessServiceTest {
    private val sql = RecordingSql()
    private var pinCall: List<String>? = null
    private val service = OrganizationAccessService(sql, { org, staff, pin, actor ->
        pinCall = listOf(org, staff, pin, actor)
        true
    })

    @Test
    fun `listing access returns database projection`() {
        assertEquals("[]", service.list("org-a", "admin").toString())
        assertEquals(listOf("org-a", "admin"), sql.listCall)
    }

    @Test
    fun `staff promotion grants admin without changing staff identity`() {
        assertTrue(service.setOrgAdmin("org-a", "ou-staff", true, "admin"))
        assertEquals(listOf("org-a", "ou-staff", "true", "admin"), sql.orgAdminCall)
        assertEquals("staff-existing", sql.staffId("org-a", "ou-staff", "admin"))
    }

    @Test
    fun `admin removal delegates only admin role mutation`() {
        assertTrue(service.setOrgAdmin("org-a", "ou-admin-staff", false, "admin"))
        assertEquals(listOf("org-a", "ou-admin-staff", "false", "admin"), sql.orgAdminCall)
        assertFalse(sql.counterOperatorCalled)
    }

    @Test
    fun `counter operator enable and disable preserve organization user identity`() {
        assertEquals("staff-existing", service.setCounterOperator(
            "org-a", "ou-staff", SetCounterOperatorRequest(true, primaryStoreId = "store-a"), "admin"
        ))
        assertEquals("ou-staff", sql.counterOrganizationUserId)
        service.setCounterOperator("org-a", "ou-staff", SetCounterOperatorRequest(false), "admin")
        assertEquals("ou-staff", sql.counterOrganizationUserId)
    }

    @Test
    fun `pin reset resolves staff from organization user`() {
        assertTrue(service.setPin("org-a", "ou-staff", "1234", "admin"))
        assertEquals(listOf("org-a", "staff-existing", "1234", "admin"), pinCall)
    }

    @Test
    fun `duplicate additional stores are rejected`() {
        assertFailsWith<BadRequestException> {
            service.setStores("org-a", "ou-staff", SetStaffStoresRequest("store-a", listOf("store-b", "store-b")), "admin")
        }
    }

    @Test
    fun `final active admin protection is returned as domain conflict`() {
        sql.failure = postgres("P0001", "The last active organization administrator cannot be removed")
        assertFailsWith<ConflictException> {
            service.setOrgAdmin("org-a", "ou-last-admin", false, "admin")
        }
    }

    @Test
    fun `cross organization authorization rejection is preserved`() {
        sql.failure = postgres("42501", "Organization access administration is not permitted")
        assertFailsWith<ForbiddenException> {
            service.setMembership("org-b", "ou-other-org", false, "admin-a")
        }
    }

    private fun postgres(state: String, message: String) =
        PSQLException(ServerErrorMessage("SERROR\u0000C$state\u0000M$message\u0000\u0000"))

    private class RecordingSql : OrganizationAccessSql {
        var orgAdminCall: List<String>? = null
        var listCall: List<String>? = null
        var counterOrganizationUserId: String? = null
        var counterOperatorCalled = false
        var failure: PSQLException? = null

        override fun list(org: String, actor: String): String {
            failure?.let { throw it }
            listCall = listOf(org, actor)
            return "[]"
        }
        override fun setOrgAdmin(org: String, organizationUserId: String, enabled: Boolean, actor: String): Boolean {
            failure?.let { throw it }
            orgAdminCall = listOf(org, organizationUserId, enabled.toString(), actor)
            return true
        }
        override fun setMembership(org: String, organizationUserId: String, active: Boolean, actor: String): Boolean {
            failure?.let { throw it }
            return true
        }
        override fun setCounterOperator(org: String, organizationUserId: String, payload: String, actor: String): String? {
            counterOperatorCalled = true
            counterOrganizationUserId = organizationUserId
            return "staff-existing"
        }
        override fun setStores(org: String, organizationUserId: String, primaryStoreId: String?, additionalStoreIds: String, actor: String) = true
        override fun staffId(org: String, organizationUserId: String, actor: String) = "staff-existing"
    }
}
