package com.mynikatech.memgine.component.auth

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Static contract checks; the account-deletion migration is never applied by tests. */
class CustomerAccountDeletionMigrationTest {
    private val sql by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "152-customer-account-deletion.sql"))
    }

    private val deletionPreviewSql by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "153-customer-account-deletion-preview.sql"))
    }

    @Test
    fun `deletion anonymizes the identity and leaves its old phone reusable`() {
        assertTrue(sql.contains("auth_delete_customer_account"))
        assertTrue(sql.contains("primary_phone = v_deleted_phone"))
        assertTrue(sql.contains("primary_email = v_deleted_email"))
        assertTrue(sql.contains("md5(p_user_id)"))
        assertFalse(sql.contains("lower(p_user_id)"))
        assertTrue(sql.contains("display_name = 'Deleted account'"))
        assertTrue(sql.contains("user_status_id = 'entity-status-user-inactive'"))
        assertTrue(sql.contains("is_deleted = TRUE"))
        assertTrue(sql.contains("password_enabled = FALSE"))
        assertTrue(sql.contains("password_hash = NULL"))
        assertTrue(sql.contains("NOT u.is_deleted"))
    }

    @Test
    fun `deletion revokes every active session and retains historical relationship keys`() {
        assertTrue(sql.contains("UPDATE \"\${schemaName}\".authentication_sessions"))
        assertTrue(sql.contains("WHERE s.user_id = p_user_id"))
        assertTrue(sql.contains("revoked_at = COALESCE(s.revoked_at, CURRENT_TIMESTAMP)"))
        assertTrue(sql.contains("UPDATE \"\${schemaName}\".organization_user ou"))
        assertTrue(sql.contains("organization_user_type_id = 'organization-user-type-customer'"))
        assertTrue(sql.contains("DELETE FROM \"\${schemaName}\".customer_preference"))
        assertTrue(sql.contains("DELETE FROM \"\${schemaName}\".notifications"))
        assertFalse(sql.contains("DELETE FROM \"\${schemaName}\".subscriptions"))
        assertFalse(sql.contains("DELETE FROM \"\${schemaName}\".payment_intents"))
        assertFalse(sql.contains("DELETE FROM \"\${schemaName}\".redemption_transaction"))
    }

    @Test
    fun `deletion rejects active platform organization and staff accounts`() {
        assertTrue(sql.contains("FROM \"\${schemaName}\".platform_user_role pur"))
        assertTrue(sql.contains("ou.organization_user_type_id <> 'organization-user-type-customer'"))
        assertFalse(sql.contains("role-owner', 'role-admin', 'role-staff'"))
        assertTrue(sql.contains("FROM \"\${schemaName}\".staff s"))
        assertTrue(sql.contains("USING ERRCODE = '42501'"))
    }

    @Test
    fun `deletion captures the original phone before anonymizing OTP data`() {
        assertTrue(sql.contains("v_original_phone varchar(20)"))
        assertTrue(sql.contains("INTO v_original_phone"))
        assertTrue(sql.contains("WHERE o.destination = v_original_phone"))
        assertTrue(sql.contains("UPDATE \"\${schemaName}\".business_otp_context"))
        assertTrue(sql.contains("normalized_phone = v_deleted_phone"))
    }

    @Test
    fun `function has constrained definer privileges`() {
        assertTrue(sql.contains("SECURITY DEFINER"))
        assertTrue(sql.contains("SET search_path = pg_catalog, \"\${schemaName}\""))
        assertTrue(sql.contains("REVOKE ALL ON FUNCTION"))
        assertTrue(sql.contains("TO \"\${appRole}\""))
    }

    @Test
    fun `account deletion is routed through the authenticated account endpoint`() {
        val routes = Files.readString(
            Path.of("..", "server", "src", "main", "kotlin", "com", "mynikatech", "memgine", "component", "auth", "AuthenticationRoutes.kt")
        )
        val gate = Files.readString(
            Path.of("..", "server", "src", "main", "kotlin", "com", "mynikatech", "memgine", "security", "AuthenticationGate.kt")
        )
        assertTrue(routes.contains("delete(\"/customer/account\")"))
        assertTrue(routes.contains("get(\"/customer/account/deletion-preview\")"))
        assertTrue(routes.contains("service.customerAccountDeletionPreview(call.authenticatedPrincipal())"))
        assertTrue(routes.contains("call.receive<DeleteCustomerAccountRequest>()"))
        assertTrue(gate.contains("path.endsWith(\"/customer/account\")"))
        assertTrue(gate.contains("path.endsWith(\"/customer/account/deletion-preview\")"))
    }

    @Test
    fun `deletion preview uses active and unexpired subscription semantics`() {
        assertTrue(deletionPreviewSql.contains("auth_customer_account_deletion_preview"))
        assertTrue(deletionPreviewSql.contains("ss.status_code = 'ACTIVE'"))
        assertTrue(deletionPreviewSql.contains("s.start_date <= CURRENT_DATE"))
        assertTrue(deletionPreviewSql.contains("s.end_date >= CURRENT_DATE"))
        assertTrue(deletionPreviewSql.contains("NOT s.is_deleted"))
        assertTrue(deletionPreviewSql.contains("REVOKE ALL ON FUNCTION"))
    }

    @Test
    fun `customer login discloses account absence only after OTP verification`() {
        val service = Files.readString(
            Path.of("..", "server", "src", "main", "kotlin", "com", "mynikatech", "memgine", "component", "auth", "AuthenticationService.kt")
        )
        assertTrue(service.contains("fun requestCustomerLoginOtp"))
        assertTrue(service.contains("requestLoginOtp(request)"))
        assertTrue(service.contains("CUSTOMER_ACCOUNT_NOT_FOUND"))
        assertTrue(service.contains("otpService.verify(request.challengeId, request.otp, OtpPurpose.LOGIN)"))
    }

    @Test
    fun `customer account UI exposes join and active membership acknowledgement`() {
        val login = Files.readString(Path.of("..", "frontend", "app", "customer-login.tsx"))
        val profile = Files.readString(Path.of("..", "frontend", "app", "customer", "profile.tsx"))
        assertTrue(login.contains("CUSTOMER_ACCOUNT_NOT_FOUND"))
        assertTrue(login.contains("router.push(APP_ROUTES.register as never)"))
        assertTrue(profile.contains("ACTIVE_SUBSCRIPTIONS_ACK_REQUIRED"))
        assertTrue(profile.contains("profile-delete-account-active-subscriptions-acknowledgement"))
        assertTrue(profile.contains("deleteCustomerAccount(acknowledgeActiveSubscriptions)"))
    }
}
