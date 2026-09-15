package com.mynikatech.memgine.config

import io.ktor.server.config.ApplicationConfig
import java.util.Properties

data class AppConfig(
    val server: ServerConfig,
    val database: DatabaseConfig
) {
    companion object {
        fun load(config: ApplicationConfig? = null): AppConfig {
            val localProperties = Properties().apply {
                AppConfig::class.java.classLoader
                    .getResourceAsStream("application-local.properties")
                    ?.use { load(it) }
            }

            fun value(path: String, env: String, default: String? = null): String =
                System.getenv(env)
                    ?: localProperties.getProperty(env)
                    ?: config?.propertyOrNull(path)?.getString()
                    ?: default
                    ?: error("Missing configuration: $env / $path")

            return AppConfig(
                server = ServerConfig(
                    host = value(
                        "ktor.deployment.host",
                        "MEMGINE_SERVER_HOST",
                        "0.0.0.0"
                    ),
                    port = value(
                        "ktor.deployment.port",
                        "MEMGINE_SERVER_PORT",
                        "8080"
                    ).toInt(),
                    enforceHttps = value(
                        "memgine.server.enforceHttps",
                        "MEMGINE_ENFORCE_HTTPS",
                        "false"
                    ).toBoolean()
                ),
                database = DatabaseConfig(
                    jdbcUrl = value(
                        "memgine.database.jdbcUrl",
                        "MEMGINE_DB_URL"
                    ),
                    username = value(
                        "memgine.database.username",
                        "MEMGINE_DB_USER"
                    ),
                    password = value(
                        "memgine.database.password",
                        "MEMGINE_DB_PASSWORD"
                    ),
                    schema = value(
                        "memgine.database.schema",
                        "MEMGINE_DB_SCHEMA",
                        "memginedev"
                    ),
                    maximumPoolSize = value(
                        "memgine.database.maximumPoolSize",
                        "MEMGINE_DB_POOL_SIZE",
                        "10"
                    ).toInt()
                )
            )
        }
    }
}

data class ServerConfig(
    val host: String,
    val port: Int,
    val enforceHttps: Boolean
)

data class DatabaseConfig(
    val jdbcUrl: String,
    val username: String,
    val password: String,
    val schema: String,
    val maximumPoolSize: Int
)