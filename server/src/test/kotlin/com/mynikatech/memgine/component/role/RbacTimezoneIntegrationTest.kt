package com.mynikatech.memgine.component.role

import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.sql.SQLException
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Assume.assumeTrue

/**
 * UTC-004 PostgreSQL integration coverage.
 *
 * It is deliberately opt-in: set MEMGINE_TIMEZONE_DEV_INTEGRATION=true and
 * provide a DEV-only JDBC URL/user/password. The guard rejects any database
 * other than memgine_dev and any schema other than memginedev. Every fixture
 * is created through the deployed function (or, for the RBAC fixture, within
 * this connection's transaction) and is rolled back in the finally block.
 */
class RbacTimezoneIntegrationTest {
    @Test
    fun `UTC-002 real session fixture has timezone-invariant valid expired and boundary outcomes`() {
        val userId = requireAuditUserId()

        withDevConnection { connection ->
            assumeTrue(
                "BLOCKED: the DEV runtime role cannot construct rollback-only auth expiry fixtures; no permissions were changed",
                hasTablePrivilege(connection, "authentication_sessions", "UPDATE")
            )
            assumeTrue(
                "BLOCKED: $userId is not an active isolated DEV test identity",
                isActiveUser(connection, userId)
            )

            val outcomes = listOf("valid", "expired", "exact-boundary").associateWith { caseName ->
                val tokenHash = nextId("auth-$caseName").padEnd(64, 'a')
                val sessionId = nextId("session-$caseName")
                createSession(connection, userId, sessionId, tokenHash, "+ INTERVAL '5 minutes'")
                when (caseName) {
                    "expired" -> setSessionTimes(connection, sessionId, "- INTERVAL '10 minutes'", "- INTERVAL '5 minutes'")
                    "exact-boundary" -> setSessionTimes(connection, sessionId, "- INTERVAL '1 microsecond'", "")
                }
                zones.associateWith { zone -> resolvedSessionCount(connection, zone, tokenHash) }
            }

            assertEquals(setOf(1), outcomes.getValue("valid").values.toSet(), "valid session must be valid in every session timezone")
            assertEquals(setOf(0), outcomes.getValue("expired").values.toSet(), "expired session must be expired in every session timezone")
            assertEquals(setOf(0), outcomes.getValue("exact-boundary").values.toSet(), "expiry boundary must be exclusive in every session timezone")
        }
    }

    @Test
    fun `UTC-003 real OTP fixture preserves expiry cooldown and boundary semantics across session zones`() {
        withDevConnection { connection ->
            assumeTrue(
                "BLOCKED: the DEV runtime role cannot construct rollback-only OTP expiry fixtures; no permissions were changed",
                hasTablePrivilege(connection, "otp_challenges", "UPDATE")
            )
            val valid = nextId("otp-valid")
            createOtpChallenge(connection, valid, nextDestination("valid"), "+ INTERVAL '5 minutes'", cooldownSeconds = 0)
            val validOutcomes = zones.associateWith { zone -> consumeOtpThenRollback(connection, zone, valid) }
            assertEquals(setOf(true), validOutcomes.values.toSet(), "valid OTP must be consumable in every session timezone")

            val expired = nextId("otp-expired")
            createOtpChallenge(connection, expired, nextDestination("expired"), "+ INTERVAL '5 minutes'", cooldownSeconds = 0)
            setOtpTimes(connection, expired, "- INTERVAL '10 minutes'", "- INTERVAL '5 minutes'")
            val expiredOutcomes = zones.associateWith { zone -> consumeOtpThenRollback(connection, zone, expired) }
            assertEquals(setOf(false), expiredOutcomes.values.toSet(), "expired OTP must be rejected in every session timezone")

            // CURRENT_TIMESTAMP is transaction-stable. Supplying its UTC-local value is
            // therefore a deterministic exact-expiry fixture without changing server time.
            val boundary = nextId("otp-boundary")
            createOtpChallenge(connection, boundary, nextDestination("boundary"), "+ INTERVAL '5 minutes'", cooldownSeconds = 0)
            setOtpTimes(connection, boundary, "- INTERVAL '1 microsecond'", "")
            val boundaryOutcomes = zones.associateWith { zone -> consumeOtpThenRollback(connection, zone, boundary) }
            assertEquals(setOf(false), boundaryOutcomes.values.toSet(), "OTP expiry boundary must be exclusive in every session timezone")

            val cooldownDestination = nextDestination("cooldown")
            createOtpChallenge(connection, nextId("otp-cooldown-seed"), cooldownDestination, "+ INTERVAL '5 minutes'", cooldownSeconds = 300)
            val cooldownStates = zones.associateWith { zone -> cooldownSqlState(connection, zone, cooldownDestination) }
            assertEquals(setOf("P0001"), cooldownStates.values.toSet(), "OTP cooldown must be timezone-invariant")

            val dstUtcValue = zones.associateWith { zone ->
                connection.createStatement().use { statement ->
                    statement.execute("SET LOCAL TIME ZONE '$zone'")
                    statement.executeQuery(
                        "SELECT (TIMESTAMPTZ '2027-03-14 07:00:00+00' AT TIME ZONE 'UTC')::text"
                    ).use { rows -> check(rows.next()); rows.getString(1) }
                }
            }
            assertEquals(setOf("2027-03-14 07:00:00"), dstUtcValue.values.toSet(), "Canadian DST conversion must not alter the stored UTC-local instant")
        }
    }

    @Test
    fun `UTC-004 real platform and organization role fixtures are timezone-invariant`() {
        val userId = requireAuditUserId()
        val organizationId = requireAuditOrganizationId()

        withDevConnection { connection ->
            assumeTrue(
                "BLOCKED: the DEV runtime role cannot create rollback-only RBAC fixtures; no permissions were changed",
                canCreateRbacFixtures(connection)
            )
            assumeTrue("BLOCKED: $userId is not an active isolated DEV test identity", isActiveUser(connection, userId))
            assumeTrue("BLOCKED: $organizationId is not an active isolated DEV test organization", isActiveOrganization(connection, organizationId))

            val fixture = createRbacFixtures(connection, userId, organizationId)
            assertEffectiveAccessForOffsets(connection, fixture, "+ INTERVAL '5 minutes'", expected = true)
            assertEffectiveAccessForOffsets(connection, fixture, "+ INTERVAL '5 minutes'", expected = true, organizationScoped = true)
            assertEffectiveAccessForOffsets(connection, fixture, "+ INTERVAL '1 day'", expected = false)
            assertEffectiveAccessForOffsets(connection, fixture, "+ INTERVAL '1 day'", expected = false, organizationScoped = true)
            assertEffectiveAccessForOffsets(connection, fixture, "- INTERVAL '5 minutes'", expected = false)
            assertEffectiveAccessForOffsets(connection, fixture, "- INTERVAL '5 minutes'", expected = false, organizationScoped = true)
            assertEffectiveAccessForOffsets(connection, fixture, "", expected = false)
            assertEffectiveAccessForOffsets(connection, fixture, "", expected = false, organizationScoped = true)
        }
    }

    @Test
    fun `UTC-004 database session zones preserve an absolute instant and reject unknown identities`() {
        withDevConnection { connection ->
            val results = zones.associateWith { zone ->
                connection.createStatement().use { statement ->
                    statement.execute("SET LOCAL TIME ZONE '$zone'")
                    statement.executeQuery(
                        "SELECT current_setting('TimeZone'), " +
                            "(TIMESTAMPTZ '2027-03-14 07:00:00+00' AT TIME ZONE 'UTC')::text, " +
                            "rbac_has_capability('timezone-audit-unknown', NULL, 'PLATFORM_ADMIN_ACCESS')"
                    ).use { row ->
                        check(row.next())
                        Triple(row.getString(1), row.getString(2), row.getBoolean(3))
                    }
                }
            }

            assertEquals("2027-03-14 07:00:00", results.getValue("UTC").second)
            assertEquals(results.getValue("UTC").second, results.getValue("America/Toronto").second)
            assertEquals(results.getValue("UTC").second, results.getValue("Asia/Kolkata").second)
            results.values.forEach { (_, _, hasCapability) -> assertFalse(hasCapability) }
        }
    }

    @Test
    fun `UTC-002 and UTC-003 session and OTP functions reject unknown records in every database session zone`() {
        withDevConnection { connection ->
            val outcomes = zones.associateWith { zone ->
                connection.createStatement().use { statement ->
                    statement.execute("SET LOCAL TIME ZONE '$zone'")
                    val sessionRows = statement.executeQuery(
                        "SELECT count(*) FROM auth_resolve_session('timezone-audit-no-session')"
                    ).use { rows -> check(rows.next()); rows.getInt(1) }
                    val otpConsumed = statement.executeQuery(
                        "SELECT otp_consume_challenge('timezone-audit-no-otp', 'LOGIN')"
                    ).use { rows -> check(rows.next()); rows.getBoolean(1) }
                    sessionRows to otpConsumed
                }
            }
            outcomes.values.forEach { (sessionRows, otpConsumed) ->
                assertEquals(0, sessionRows)
                assertFalse(otpConsumed)
            }
        }
    }

    @Test
    fun `UTC-004 effective access and capability stay identical across session zones for an isolated fixture`() {
        val userId = System.getenv("MEMGINE_TIMEZONE_TEST_USER_ID").orEmpty()
        assumeTrue(
            "Set MEMGINE_TIMEZONE_TEST_USER_ID to a pre-provisioned isolated DEV test identity",
            userId.startsWith("tz-audit-")
        )

        withDevConnection { connection ->
            val results = zones.associateWith { zone -> effectiveAccess(connection, zone, userId) }
            assertEquals(results.getValue("UTC"), results.getValue("America/Toronto"))
            assertEquals(results.getValue("UTC"), results.getValue("Asia/Kolkata"))
        }
    }

    @Test
    fun `UTC-004 SQL contract includes both platform and organization effective date predicates`() {
        val sql = Files.readString(Path.of("..", "DB", "liquibase", "sql", "061-core-authentication-otp.sql"))
        val rbac = Files.readString(Path.of("..", "DB", "liquibase", "sql", "059-mvp-rbac-foundation.sql"))

        assertTrue(sql.contains("pur.effective_from <= CURRENT_TIMESTAMP"))
        assertTrue(sql.contains("our.effective_from <= CURRENT_TIMESTAMP"))
        assertTrue(sql.contains("pur.effective_to IS NULL OR pur.effective_to > CURRENT_TIMESTAMP"))
        assertTrue(sql.contains("our.effective_to IS NULL OR our.effective_to > CURRENT_TIMESTAMP"))
        assertTrue(rbac.contains("CREATE OR REPLACE FUNCTION \"\${schemaName}\".rbac_has_capability"))
        assertTrue(rbac.contains("rbac_effective_capabilities"))
    }

    private fun createSession(
        connection: Connection,
        userId: String,
        sessionId: String,
        tokenHash: String,
        expiryOffset: String
    ) {
        connection.prepareStatement(
            "SELECT auth_create_session(?, ?, ?, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') $expiryOffset, NULL, 'timezone-audit')"
        ).use { statement ->
            statement.setString(1, sessionId)
            statement.setString(2, userId)
            statement.setString(3, tokenHash)
            statement.executeQuery().use { rows -> check(rows.next()); check(rows.getBoolean(1)) }
        }
    }

    private fun setSessionTimes(connection: Connection, sessionId: String, issuedOffset: String, expiryOffset: String) {
        connection.prepareStatement(
            "UPDATE authentication_sessions SET issued_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') $issuedOffset, " +
                "expires_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') $expiryOffset WHERE session_id = ?"
        ).use { statement -> statement.setString(1, sessionId); check(statement.executeUpdate() == 1) }
    }

    private fun resolvedSessionCount(connection: Connection, zone: String, tokenHash: String): Int =
        connection.createStatement().use { statement ->
            statement.execute("SET LOCAL TIME ZONE '$zone'")
            statement.executeQuery("SELECT count(*) FROM auth_resolve_session('${tokenHash.replace("'", "''")}')")
                .use { rows -> check(rows.next()); rows.getInt(1) }
        }

    private fun createOtpChallenge(
        connection: Connection,
        challengeId: String,
        destination: String,
        expiryOffset: String,
        cooldownSeconds: Int
    ) {
        connection.prepareStatement(
            "SELECT otp_create_challenge(?, ?, 'CA', 'LOGIN', 'SMS', 'TIMEZONE_AUDIT', ?, ?, '{}'::jsonb, " +
                "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') $expiryOffset, 3, ?)"
        ).use { statement ->
            statement.setString(1, challengeId)
            statement.setString(2, destination)
            statement.setString(3, "a".repeat(64))
            statement.setString(4, "timezone-audit-salt")
            statement.setInt(5, cooldownSeconds)
            statement.executeQuery().use { rows -> check(rows.next()) }
        }
    }

    private fun setOtpTimes(connection: Connection, challengeId: String, createdOffset: String, expiryOffset: String) {
        connection.prepareStatement(
            "UPDATE otp_challenges SET created_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') $createdOffset, " +
                "expires_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') $expiryOffset WHERE otp_challenge_id = ?"
        ).use { statement -> statement.setString(1, challengeId); check(statement.executeUpdate() == 1) }
    }

    private fun consumeOtpThenRollback(connection: Connection, zone: String, challengeId: String): Boolean {
        val savepoint = "otp_consume_${nextId("savepoint").replace('-', '_')}"
        connection.createStatement().use { statement ->
            statement.execute("SAVEPOINT $savepoint")
            return try {
                statement.execute("SET LOCAL TIME ZONE '$zone'")
                statement.executeQuery(
                    "SELECT otp_consume_challenge('${challengeId.replace("'", "''")}', 'LOGIN')"
                ).use { rows -> check(rows.next()); rows.getBoolean(1) }
            } finally {
                statement.execute("ROLLBACK TO SAVEPOINT $savepoint")
            }
        }
    }

    private fun cooldownSqlState(connection: Connection, zone: String, destination: String): String? {
        val savepoint = "otp_cooldown_${nextId("savepoint").replace('-', '_')}"
        return try {
            connection.createStatement().use {
                it.execute("SAVEPOINT $savepoint")
                it.execute("SET LOCAL TIME ZONE '$zone'")
            }
            connection.prepareStatement(
                "SELECT otp_create_challenge(?, ?, 'CA', 'LOGIN', 'SMS', 'TIMEZONE_AUDIT', ?, ?, '{}'::jsonb, " +
                    "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '5 minutes', 3, 300)"
            ).use { statement ->
                statement.setString(1, nextId("otp-cooldown-repeat"))
                statement.setString(2, destination)
                statement.setString(3, "b".repeat(64))
                statement.setString(4, "timezone-audit-salt")
                statement.executeQuery()
            }
            null
        } catch (error: SQLException) {
            error.sqlState
        } finally {
            connection.createStatement().use { it.execute("ROLLBACK TO SAVEPOINT $savepoint") }
        }
    }

    private data class RbacFixture(
        val userId: String,
        val organizationId: String,
        val platformAssignmentId: String,
        val organizationAssignmentId: String
    )

    private fun createRbacFixtures(connection: Connection, userId: String, organizationId: String): RbacFixture {
        val organizationUserId = nextId("tzou")
        val platformAssignmentId = nextId("tzpur")
        val organizationAssignmentId = nextId("tzour")
        connection.prepareStatement(
            "INSERT INTO organization_user (organization_user_id, organization_id, user_id, organization_user_type_id, " +
                "organization_user_status_id, created_by, updated_by) VALUES (?, ?, ?, 'organization-user-type-admin', " +
                "'entity-status-org-user-active', ?, ?)"
        ).use { statement ->
            statement.setString(1, organizationUserId)
            statement.setString(2, organizationId)
            statement.setString(3, userId)
            statement.setString(4, userId)
            statement.setString(5, userId)
            statement.executeUpdate()
        }
        connection.prepareStatement(
            "INSERT INTO platform_user_role (platform_user_role_id, user_id, role_id, status_id, created_at, created_by, updated_at, updated_by, effective_from) " +
                "VALUES (?, ?, 'role-platform-admin', 'entity-status-platfrm-user-role-active', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', ?, CURRENT_TIMESTAMP AT TIME ZONE 'UTC', ?, " +
                "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '5 minutes')"
        ).use { statement ->
            statement.setString(1, platformAssignmentId)
            statement.setString(2, userId)
            statement.setString(3, userId)
            statement.setString(4, userId)
            statement.executeUpdate()
        }
        connection.prepareStatement(
            "INSERT INTO organization_user_roles (organization_user_role_id, organization_user_id, role_id, assignment_status_id, created_by, updated_by, effective_from) " +
                "VALUES (?, ?, 'role-admin', 'entity-status-org-user-role-active', ?, ?, " +
                "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '5 minutes')"
        ).use { statement ->
            statement.setString(1, organizationAssignmentId)
            statement.setString(2, organizationUserId)
            statement.setString(3, userId)
            statement.setString(4, userId)
            statement.executeUpdate()
        }
        return RbacFixture(userId, organizationId, platformAssignmentId, organizationAssignmentId)
    }

    private fun assertEffectiveAccessForOffsets(
        connection: Connection,
        fixture: RbacFixture,
        offset: String,
        expected: Boolean,
        organizationScoped: Boolean = false
    ) {
        val table = if (organizationScoped) "organization_user_roles" else "platform_user_role"
        val idColumn = if (organizationScoped) "organization_user_role_id" else "platform_user_role_id"
        val assignmentId = if (organizationScoped) fixture.organizationAssignmentId else fixture.platformAssignmentId
        connection.prepareStatement(
            "UPDATE $table SET effective_from = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') $offset, " +
                "effective_to = NULL WHERE $idColumn = ?"
        ).use { statement -> statement.setString(1, assignmentId); check(statement.executeUpdate() == 1) }
        val capability = if (organizationScoped) "ORG_ADMIN_ACCESS" else "PLATFORM_ADMIN_ACCESS"
        val organization = if (organizationScoped) "'${fixture.organizationId.replace("'", "''")}'" else "NULL"
        val outcomes = zones.associateWith { zone ->
            connection.createStatement().use { statement ->
                statement.execute("SET LOCAL TIME ZONE '$zone'")
                statement.executeQuery(
                    "SELECT rbac_has_capability('${fixture.userId.replace("'", "''")}', $organization, '$capability')"
                ).use { rows -> check(rows.next()); rows.getBoolean(1) }
            }
        }
        assertEquals(setOf(expected), outcomes.values.toSet(), "$capability $offset must be timezone-invariant")
    }

    private fun canCreateRbacFixtures(connection: Connection): Boolean =
        connection.createStatement().use { statement ->
            statement.executeQuery(
                "SELECT has_table_privilege(current_user, 'memginedev.organization_user', 'INSERT') " +
                    "AND has_table_privilege(current_user, 'memginedev.organization_user_roles', 'INSERT') " +
                    "AND has_table_privilege(current_user, 'memginedev.platform_user_role', 'INSERT') " +
                    "AND has_table_privilege(current_user, 'memginedev.platform_user_role', 'UPDATE') " +
                    "AND has_table_privilege(current_user, 'memginedev.organization_user_roles', 'UPDATE')"
            ).use { rows -> check(rows.next()); rows.getBoolean(1) }
        }

    private fun hasTablePrivilege(connection: Connection, table: String, privilege: String): Boolean =
        connection.prepareStatement("SELECT has_table_privilege(current_user, ?, ?)").use { statement ->
            statement.setString(1, "memginedev.$table")
            statement.setString(2, privilege)
            statement.executeQuery().use { rows -> check(rows.next()); rows.getBoolean(1) }
        }

    private fun isActiveUser(connection: Connection, userId: String): Boolean =
        connection.prepareStatement(
            "SELECT EXISTS (SELECT 1 FROM \"user\" WHERE user_id = ? AND NOT is_deleted AND user_status_id = 'entity-status-user-active')"
        ).use { statement ->
            statement.setString(1, userId)
            statement.executeQuery().use { rows -> check(rows.next()); rows.getBoolean(1) }
        }

    private fun isActiveOrganization(connection: Connection, organizationId: String): Boolean =
        connection.prepareStatement(
            "SELECT EXISTS (SELECT 1 FROM organization WHERE organization_id = ? AND NOT is_deleted AND organization_status_id = 'entity-status-org-active')"
        ).use { statement ->
            statement.setString(1, organizationId)
            statement.executeQuery().use { rows -> check(rows.next()); rows.getBoolean(1) }
        }

    private fun requireAuditUserId(): String = requireAuditIdentity("MEMGINE_TIMEZONE_TEST_USER_ID")

    private fun requireAuditOrganizationId(): String = requireAuditIdentity("MEMGINE_TIMEZONE_TEST_ORGANIZATION_ID")

    private fun requireAuditIdentity(name: String): String {
        val value = System.getenv(name).orEmpty()
        assumeTrue("Set $name to an isolated DEV tz-audit-* fixture identity", value.startsWith("tz-audit-"))
        return value
    }

    private fun nextId(prefix: String): String = "$prefix-${UUID.randomUUID()}".take(64)

    private fun nextDestination(label: String): String = "tz-audit-$label-${UUID.randomUUID()}@example.invalid"

    private fun effectiveAccess(connection: Connection, zone: String, userId: String): List<String> =
        connection.createStatement().use { statement ->
            statement.execute("SET LOCAL TIME ZONE '$zone'")
            statement.executeQuery(
                "SELECT organization_id, role_code, capability_code " +
                    "FROM auth_effective_access('${userId.replace("'", "''")}') " +
                    "ORDER BY organization_id NULLS FIRST, role_code, capability_code"
            ).use { rows ->
                buildList {
                    while (rows.next()) add("${rows.getString(1)}|${rows.getString(2)}|${rows.getString(3)}")
                }
            }
        }

    private fun withDevConnection(block: (Connection) -> Unit) {
        assumeTrue(
            "Set MEMGINE_TIMEZONE_DEV_INTEGRATION=true to opt in to the DEV read-only integration checks",
            System.getenv("MEMGINE_TIMEZONE_DEV_INTEGRATION") == "true"
        )
        val url = requireEnvironment("MEMGINE_TIMEZONE_DEV_JDBC_URL")
        assumeTrue(
            "Refusing a timezone integration connection that is not routed through the configured DEV SSM tunnel",
            url.matches(Regex("jdbc:postgresql://127\\.0\\.0\\.1:15432/memgine_dev(?:[?].*)?"))
        )
        val user = requireEnvironment("MEMGINE_TIMEZONE_DEV_DB_USER")
        val password = requireEnvironment("MEMGINE_TIMEZONE_DEV_DB_PASSWORD")

        DriverManager.getConnection(url, user, password).use { connection ->
            connection.autoCommit = false
            connection.createStatement().use { statement ->
                statement.execute("SET LOCAL search_path TO memginedev, pg_catalog")
                statement.executeQuery("SELECT current_database(), current_schema(), current_user")
                    .use { row ->
                        check(row.next())
                        check(row.getString(1) == "memgine_dev") { "Refusing non-DEV database" }
                        check(row.getString(2) == "memginedev") { "Refusing unexpected schema" }
                        check(row.getString(3) == "memgine_app_dev") { "Refusing a non-runtime DEV database role" }
                    }
            }
            try {
                block(connection)
            } finally {
                connection.rollback()
            }
        }
    }

    private fun requireEnvironment(name: String): String = System.getenv(name)
        ?.takeIf { it.isNotBlank() }
        ?: error("$name is required after explicitly enabling the DEV integration test")

    private companion object {
        val zones = listOf("UTC", "America/Toronto", "Asia/Kolkata")
    }
}
