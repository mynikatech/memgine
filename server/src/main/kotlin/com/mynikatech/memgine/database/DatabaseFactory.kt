package com.mynikatech.memgine.database

import com.mynikatech.memgine.config.DatabaseConfig
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.core.kotlin.KotlinPlugin
import org.jdbi.v3.sqlobject.SqlObjectPlugin
import org.jdbi.v3.sqlobject.kotlin.KotlinSqlObjectPlugin

data class DatabaseContext(
    val dataSource: HikariDataSource,
    val jdbi: Jdbi
) : AutoCloseable {
    override fun close() = dataSource.close()
}

object DatabaseFactory {

    fun create(config: DatabaseConfig): DatabaseContext {
        val hikariConfig = HikariConfig().apply {
            jdbcUrl = config.jdbcUrl
            username = config.username
            password = config.password
            driverClassName = "org.postgresql.Driver"

            maximumPoolSize = config.maximumPoolSize
            minimumIdle = 1
            connectionTimeout = 10_000
            validationTimeout = 5_000
            idleTimeout = 600_000
            maxLifetime = 1_800_000
            poolName = "memgine-hikari"

            schema = config.schema
            isAutoCommit = true
        }

        val dataSource = HikariDataSource(hikariConfig)

        val jdbi = Jdbi.create(dataSource)
            .installPlugin(KotlinPlugin())
            .installPlugin(SqlObjectPlugin())
            .installPlugin(KotlinSqlObjectPlugin())

        return DatabaseContext(
            dataSource = dataSource,
            jdbi = jdbi
        )
    }
}