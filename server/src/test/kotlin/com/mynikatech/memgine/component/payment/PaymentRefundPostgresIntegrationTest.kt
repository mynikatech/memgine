package com.mynikatech.memgine.component.payment

import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import liquibase.Contexts
import liquibase.LabelExpression
import liquibase.Liquibase
import liquibase.database.DatabaseFactory
import liquibase.database.jvm.JdbcConnection
import liquibase.resource.DirectoryResourceAccessor
import org.postgresql.util.PSQLException

class PaymentRefundPostgresIntegrationTest {
    @Test
    fun `migration 179 functions execute against an explicitly configured isolated database`() = withFixture { fixture ->
        fixture.readyRefundWithNoAttempts()
        fixture.verifyConfirmReplayAndStaleSnapshot()
        fixture.rejectsConflictsAmbiguityTerminalAndNonAdmin()
        fixture.concurrentConfirmationAndAuditProtections()
    }

    private fun withFixture(block: (Fixture) -> Unit) {
        val config = IsolatedDatabaseConfig.fromEnvironment()
        DriverManager.getConnection(config.jdbcUrl, config.user, config.password).use { owner ->
            verifyIsolatedDatabase(owner, config)
            owner.exec("DROP SCHEMA IF EXISTS $SCHEMA CASCADE")
            owner.exec("CREATE SCHEMA $SCHEMA")
            owner.exec("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memgine_app_dev') THEN CREATE ROLE memgine_app_dev NOLOGIN; END IF; END $$")
            owner.exec("DO $$ BEGIN EXECUTE format('GRANT memgine_app_dev TO %I', current_user); END $$")
            val database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(JdbcConnection(owner))
            database.defaultSchemaName = SCHEMA
            Liquibase(
                "DB/env/local/db.changelog-master.local.yaml",
                DirectoryResourceAccessor(Path.of("..", "..").toAbsolutePath()),
                database
            ).use { it.update(Contexts(), LabelExpression()) }
            assertTrue(owner.boolean("SELECT EXISTS (SELECT 1 FROM $SCHEMA.databasechangelog WHERE id='179-poynt-collect-refund-reference-recovery')"))
            try {
                block(Fixture(config, owner))
            } finally {
                owner.exec("DROP SCHEMA IF EXISTS $SCHEMA CASCADE")
            }
        }
    }

    private class Fixture(private val config: IsolatedDatabaseConfig, private val owner: Connection) {
        private var next = 0
        private val organization = "ORG_REFUND_IT"
        private val platformAdmin = "USR_PLATFORM_IT"
        private val nonAdmin = "USR_NONADMIN_IT"

        init {
            user(platformAdmin)
            user(nonAdmin)
            owner.exec("""INSERT INTO $SCHEMA.organization(organization_id,organization_code,organization_name,organization_type_id,organization_status_id,created_by,updated_by,is_deleted,version_no) VALUES('$organization','$organization','Refund test','organization-type-business','entity-status-organization-active','$platformAdmin','$platformAdmin',false,1)""")
            owner.exec("""INSERT INTO $SCHEMA.platform_user_role(platform_user_role_id,user_id,role_id,status_id,created_by,updated_by,is_deleted,effective_from) VALUES('PUR_IT','$platformAdmin','role-platform-admin','entity-status-platfrm-user-role-active','$platformAdmin','$platformAdmin',false,CURRENT_TIMESTAMP)""")
        }

        fun readyRefundWithNoAttempts() {
            val refund = ready("READY", 100)
            app().use { db ->
                db.query("""SELECT "executionStatus" FROM $SCHEMA.payment_refund_poynt_collect_execution_status('$organization','$refund','$platformAdmin')""") {
                    assertTrue(next())
                    assertEquals("READY", getString(1))
                }
            }
        }

        fun verifyConfirmReplayAndStaleSnapshot() {
            val success = recovery("SUCCESS", 175)
            app().use { db ->
                verify(db, success, "REF_SUCCESS")
                confirm(db, success)
                val version = owner.int("SELECT version_no FROM $SCHEMA.payment_refunds WHERE payment_refund_id='${success.refund}'")
                val eventCount = events(success.refund)
                confirm(db, success)
                assertEquals(version, owner.int("SELECT version_no FROM $SCHEMA.payment_refunds WHERE payment_refund_id='${success.refund}'"))
                assertEquals(eventCount, events(success.refund))
                assertEquals(1, owner.int("SELECT count(*) FROM $SCHEMA.payment_refund_poynt_collect_recovery_audits WHERE payment_refund_id='${success.refund}' AND event_type='CONFIRMATION'"))
            }

            val stale = recovery("STALE", 176)
            app().use { db ->
                verify(db, stale, "REF_STALE")
                owner.exec("UPDATE $SCHEMA.payment_refunds SET version_no=version_no+1 WHERE payment_refund_id='${stale.refund}'")
                assertFailsWith<PSQLException> { confirm(db, stale) }
                assertEquals("UNKNOWN_REQUIRES_RECONCILIATION", owner.text("SELECT execution_status FROM $SCHEMA.payment_refunds WHERE payment_refund_id='${stale.refund}'"))
                assertEquals(0, events(stale.refund))
            }
        }

        fun rejectsConflictsAmbiguityTerminalAndNonAdmin() {
            val one = recovery("CONFLICT_A", 178)
            val two = recovery("CONFLICT_B", 179)
            app().use { db ->
                verify(db, one, "REF_CONFLICT")
                assertFailsWith<PSQLException> { verify(db, two, "REF_CONFLICT") }
            }
            val equal = recovery("EQUAL_A", 200)
            recovery("EQUAL_B", 200)
            app().use { db ->
                assertFailsWith<PSQLException> { verify(db, equal, "REF_EQUAL") }
                verify(db, equal, "REF_EQUAL", equal.attempt)
            }
            val partialA = recovery("PARTIAL_A", 201)
            val partialB = recovery("PARTIAL_B", 202)
            app().use { db ->
                verify(db, partialA, "REF_PARTIAL_A")
                verify(db, partialB, "REF_PARTIAL_B")
            }
            val terminal = recovery("TERMINAL", 203)
            app().use { db ->
                verify(db, terminal, "REF_TERMINAL")
                owner.exec("UPDATE $SCHEMA.payment_refunds SET execution_status='FAILED' WHERE payment_refund_id='${terminal.refund}'")
                owner.exec("UPDATE $SCHEMA.payment_refund_attempts SET status='FAILED' WHERE payment_refund_attempt_id='${terminal.attempt}'")
                assertFailsWith<PSQLException> { confirm(db, terminal) }
            }
            val unauthorized = recovery("UNAUTHORIZED", 204)
            app().use { db -> assertFailsWith<PSQLException> { verify(db, unauthorized, "REF_UNAUTHORIZED", actor = nonAdmin) } }
        }

        fun concurrentConfirmationAndAuditProtections() {
            val concurrent = recovery("CONCURRENT", 205)
            app().use { verify(it, concurrent, "REF_CONCURRENT") }
            val gate = CountDownLatch(1)
            val executor = Executors.newFixedThreadPool(2)
            try {
                val work = (1..2).map {
                    executor.submit<Boolean> {
                        app().use { db -> gate.await(10, TimeUnit.SECONDS); confirm(db, concurrent); true }
                    }
                }
                gate.countDown()
                assertTrue(work.all { it.get(20, TimeUnit.SECONDS) })
            } finally {
                executor.shutdownNow()
            }
            assertEquals(1, owner.int("SELECT count(*) FROM $SCHEMA.payment_refund_events WHERE payment_refund_id='${concurrent.refund}' AND event_type='REFERENCE_RECOVERY_SUCCEEDED'"))

            val audit = recovery("AUDIT", 206)
            app().use { db ->
                assertFailsWith<PSQLException> {
                    db.exec("""INSERT INTO $SCHEMA.payment_refund_poynt_collect_recovery_audits(payment_refund_poynt_collect_recovery_audit_id,organization_id,payment_refund_id,payment_refund_attempt_id,provider_refund_reference,event_type,recovery_outcome,attestation,actor_user_id,event_identity) VALUES('FAB','$organization','${audit.refund}','${audit.attempt}','FAB','VERIFICATION','VERIFIED','fabricated evidence','$platformAdmin','FAB')""")
                }
                verify(db, audit, "REF_AUDIT")
            }
            assertFailsWith<PSQLException> { owner.exec("UPDATE $SCHEMA.payment_refund_poynt_collect_recovery_audits SET attestation='changed' WHERE payment_refund_id='${audit.refund}'") }
            assertFailsWith<PSQLException> { owner.exec("DELETE FROM $SCHEMA.payment_refund_poynt_collect_recovery_audits WHERE payment_refund_id='${audit.refund}'") }
        }

        private data class Recovery(val refund: String, val attempt: String, val verification: String)

        private fun recovery(label: String, amount: Int): Recovery {
            val payment = id("PAY_$label")
            val refund = id("REF_$label")
            val attempt = id("ATT_$label")
            owner.exec("""INSERT INTO $SCHEMA.payment_intents(payment_intent_id,organization_id,payment_provider_config_id,authorization_mode,membership_plan_id,customer_user_id,amount,currency_code,status,idempotency_key,provider_reference_id,created_by,updated_by) VALUES('$payment','$organization','PPC_IT','CUSTOMER_SESSION','PLAN_IT','$platformAdmin',10.00,'CAD','SUCCEEDED','$payment','CAPTURE_SHARED','$platformAdmin','$platformAdmin')""")
            owner.exec("""INSERT INTO $SCHEMA.payment_refunds(payment_refund_id,organization_id,payment_intent_id,original_provider_code,original_provider_transaction_reference,original_provider_config_id,original_integration_configuration_id,original_channel,captured_amount_minor,currency_code,refund_amount_minor,reason_code,idempotency_key,requested_by,approval_status,execution_status) VALUES('$refund','$organization','$payment','POYNT_COLLECT','CAPTURE_SHARED','PPC_IT','IC_IT','CUSTOMER_MEMBERSHIP',1000,'CAD',$amount,'DUPLICATE_PAYMENT','$refund','$platformAdmin','APPROVED','UNKNOWN_REQUIRES_RECONCILIATION')""")
            owner.exec("INSERT INTO $SCHEMA.payment_refund_attempts(payment_refund_attempt_id,payment_refund_id,provider_code,idempotency_reference,status) VALUES('$attempt','$refund','POYNT_COLLECT','$attempt','UNKNOWN_REQUIRES_RECONCILIATION')")
            owner.exec("""INSERT INTO $SCHEMA.poynt_collect_verified_captures(payment_intent_id,organization_id,provider_transaction_id,amount_minor,currency_code,merchant_business_id,merchant_store_id) VALUES('$payment','$organization','CAPTURE_SHARED',1000,'CAD','BUSINESS_IT','STORE_IT')""")
            return Recovery(refund, attempt, id("VER_$label"))
        }

        private fun ready(label: String, amount: Int): String {
            val payment = id("PAY_$label")
            val refund = id("REF_$label")
            owner.exec("""INSERT INTO $SCHEMA.payment_intents(payment_intent_id,organization_id,payment_provider_config_id,authorization_mode,membership_plan_id,customer_user_id,amount,currency_code,status,idempotency_key,provider_reference_id,created_by,updated_by) VALUES('$payment','$organization','PPC_IT','CUSTOMER_SESSION','PLAN_IT','$platformAdmin',10.00,'CAD','SUCCEEDED','$payment','CAPTURE_READY','$platformAdmin','$platformAdmin')""")
            owner.exec("""INSERT INTO $SCHEMA.payment_refunds(payment_refund_id,organization_id,payment_intent_id,original_provider_code,original_provider_transaction_reference,original_provider_config_id,original_integration_configuration_id,original_channel,captured_amount_minor,currency_code,refund_amount_minor,reason_code,idempotency_key,requested_by) VALUES('$refund','$organization','$payment','POYNT_COLLECT','CAPTURE_READY','PPC_IT','IC_IT','CUSTOMER_MEMBERSHIP',1000,'CAD',$amount,'DUPLICATE_PAYMENT','$refund','$platformAdmin')""")
            return refund
        }

        private fun verify(db: Connection, c: Recovery, reference: String, requestId: String? = null, actor: String = platformAdmin) {
            db.exec("SELECT * FROM $SCHEMA.platform_payment_refund_record_poynt_collect_reference_verification('${c.verification}','$organization','${c.refund}','${c.attempt}','$reference',${requestId?.let { "'$it'" } ?: "NULL"},'Provider evidence was independently reviewed.','$actor')")
        }

        private fun confirm(db: Connection, c: Recovery) {
            db.exec("SELECT * FROM $SCHEMA.platform_payment_refund_confirm_poynt_collect_reference('$organization','${c.refund}','${c.attempt}','${c.verification}','$platformAdmin')")
        }

        private fun user(id: String) {
            owner.exec("""INSERT INTO $SCHEMA."user"(user_id,user_code,first_name,last_name,primary_email,created_by,updated_by,is_deleted,version_no) VALUES('$id','$id','Test','User','${id.lowercase()}@example.test','$id','$id',false,1)""")
        }

        private fun id(prefix: String) = "${prefix}_${++next}"
        private fun app(): Connection = DriverManager.getConnection(config.jdbcUrl, config.user, config.password)
            .also { it.exec("SET ROLE memgine_app_dev") }
        private fun events(refund: String) = owner.int("SELECT count(*) FROM $SCHEMA.payment_refund_events WHERE payment_refund_id='$refund'")
    }

    private companion object { const val SCHEMA = "memginelocal" }
}

private data class IsolatedDatabaseConfig(val jdbcUrl: String, val user: String, val password: String) {
    companion object {
        private const val EXPECTED_DATABASE = "memgine_refund_it"

        fun fromEnvironment(): IsolatedDatabaseConfig {
            val url = System.getenv("MEMGINE_REFUND_IT_JDBC_URL")
                ?: error("MEMGINE_REFUND_IT_JDBC_URL is required for PostgreSQL refund integration tests")
            val user = System.getenv("MEMGINE_REFUND_IT_DB_USER")
                ?: error("MEMGINE_REFUND_IT_DB_USER is required for PostgreSQL refund integration tests")
            val password = System.getenv("MEMGINE_REFUND_IT_DB_PASSWORD")
                ?: error("MEMGINE_REFUND_IT_DB_PASSWORD is required for PostgreSQL refund integration tests")
            require(url.startsWith("jdbc:postgresql://") && url.substringBefore('?').endsWith("/$EXPECTED_DATABASE")) {
                "MEMGINE_REFUND_IT_JDBC_URL must name only the isolated $EXPECTED_DATABASE database"
            }
            return IsolatedDatabaseConfig(url, user, password)
        }
    }
}

private fun verifyIsolatedDatabase(connection: Connection, config: IsolatedDatabaseConfig) {
    connection.query("SELECT current_database(), current_setting('server_version_num')::integer") {
        check(next())
        check(getString(1) == "memgine_refund_it") { "Refusing to run against a non-test PostgreSQL database" }
        check(getInt(2) >= 150000) { "PostgreSQL 15 or newer is required for the isolated refund test database" }
    }
    check(config.jdbcUrl.substringBefore('?').endsWith("/memgine_refund_it"))
}

private fun Connection.exec(sql: String) { createStatement().use { it.execute(sql) } }
private fun Connection.boolean(sql: String): Boolean = createStatement().use { it.executeQuery(sql).use { rows -> rows.next() && rows.getBoolean(1) } }
private fun Connection.int(sql: String): Int = createStatement().use { it.executeQuery(sql).use { rows -> check(rows.next()); rows.getInt(1) } }
private fun Connection.text(sql: String): String? = createStatement().use { it.executeQuery(sql).use { rows -> check(rows.next()); rows.getString(1) } }
private inline fun Connection.query(sql: String, block: java.sql.ResultSet.() -> Unit) { createStatement().use { it.executeQuery(sql).use(block) } }
