package com.mynikatech.memgine.component.payment

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.fail
import liquibase.Contexts
import liquibase.LabelExpression
import liquibase.Liquibase
import liquibase.database.DatabaseFactory
import liquibase.database.jvm.JdbcConnection
import liquibase.resource.DirectoryResourceAccessor
import org.testcontainers.containers.PostgreSQLContainer

/**
 * Opt-in isolated database smoke fixture for refund SQL. It never reads LOCAL,
 * DEV, or RDS settings. Set MEMGINE_REFUND_IT=true on a Docker-capable host to
 * execute the Liquibase bootstrap. The scenario tests are deliberately gated
 * until a disposable fixture can seed all required historical payment entities.
 */
class PaymentRefundPostgresIntegrationTest {
    @Test
    fun `Migration 176 can be applied to a disposable PostgreSQL database`() {
        if (System.getenv("MEMGINE_REFUND_IT") != "true") {
            // The ordinary unit-test task remains Docker-independent. CI or a
            // developer intentionally enables this isolated test when Docker is available.
            return
        }

        PostgreSQLContainer<Nothing>("postgres:16-alpine").use { postgres ->
            postgres.start()
            postgres.createConnection("").use { connection ->
                connection.createStatement().use { statement ->
                    statement.execute("CREATE SCHEMA IF NOT EXISTS memginelocal")
                }
                val database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(JdbcConnection(connection))
                database.defaultSchemaName = "memginelocal"
                Liquibase(
                    "DB/env/local/db.changelog-master.local.yaml",
                    DirectoryResourceAccessor(Path.of("..", "..").toAbsolutePath()),
                    database
                ).use { liquibase ->
                    try {
                        liquibase.update(Contexts(), LabelExpression())
                    } catch (error: Exception) {
                        fail("Disposable PostgreSQL Liquibase bootstrap failed: ${error.javaClass.simpleName}")
                    }
                }
                connection.createStatement().use { statement ->
                    statement.executeQuery("SELECT to_regclass('memginelocal.payment_refunds')").use { rows ->
                        assertTrue(rows.next() && rows.getString(1) != null)
                    }
                }
            }
        }
    }
}
