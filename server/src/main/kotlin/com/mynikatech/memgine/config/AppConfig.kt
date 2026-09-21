package com.mynikatech.memgine.config

import io.ktor.server.config.ApplicationConfig
import java.util.Properties

data class AppConfig(
    val server: ServerConfig,
    val database: DatabaseConfig,
    val authentication: AuthenticationConfig,
    val otp: OtpConfig
) {
    companion object {
        fun load(config: ApplicationConfig? = null): AppConfig {
            val localProperties = Properties().apply {
                AppConfig::class.java.classLoader
                    .getResourceAsStream("application-local.properties")
                    ?.use { load(it) }
            }

            fun optionalValue(path: String, env: String): String? =
                System.getenv(env)
                    ?: localProperties.getProperty(env)
                    ?: config?.propertyOrNull(path)?.getString()

            fun value(
                path: String,
                env: String,
                default: String? = null
            ): String =
                optionalValue(path, env)
                    ?: default
                    ?: error("Missing configuration: $env / $path")

            fun booleanValue(
                path: String,
                env: String,
                default: Boolean? = null
            ): Boolean {
                val rawValue = optionalValue(path, env)
                    ?: default?.toString()
                    ?: error("Missing configuration: $env / $path")

                return rawValue.toBooleanStrictOrNull()
                    ?: error("Invalid boolean configuration: $env=$rawValue")
            }

            val environment = value(
                "memgine.server.environment",
                "MEMGINE_ENVIRONMENT"
            ).lowercase()

            val enforceHttps = booleanValue(
                "memgine.server.enforceHttps",
                "MEMGINE_ENFORCE_HTTPS"
            )

            val otpProvider = value(
                "memgine.otp.provider",
                "MEMGINE_OTP_PROVIDER"
            ).uppercase()

            if (
                otpProvider == "DEV" &&
                environment !in setOf("local", "dev", "development")
            ) {
                error(
                    "DevOtpProvider cannot be used outside local/development environments"
                )
            }

            val otpPepper = value(
                "memgine.otp.pepper",
                "MEMGINE_OTP_PEPPER"
            )

            val allowedRegions = value(
                "memgine.otp.allowedRegions",
                "MEMGINE_OTP_ALLOWED_REGIONS"
            )
                .split(',')
                .map(String::trim)
                .filter(String::isNotEmpty)
                .map(String::uppercase)
                .toSet()

            require(allowedRegions.isNotEmpty()) {
                "MEMGINE_OTP_ALLOWED_REGIONS must contain at least one region"
            }

            val awsRegion = optionalValue(
                "memgine.otp.awsRegion",
                "MEMGINE_OTP_AWS_REGION"
            ).orEmpty()

            val awsConfigurationSet = optionalValue(
                "memgine.otp.awsConfigurationSet",
                "MEMGINE_OTP_AWS_CONFIGURATION_SET"
            ).orEmpty()

            val awsOriginationIdentity = optionalValue(
                "memgine.otp.awsOriginationIdentity",
                "MEMGINE_OTP_AWS_ORIGINATION_IDENTITY"
            ).orEmpty()
            val notificationEventsTopicArn = optionalValue("memgine.otp.notificationEventsTopicArn", "MEMGINE_NOTIFICATION_EVENTS_TOPIC_ARN").orEmpty()
            val whatsappTemplateName = optionalValue("memgine.otp.whatsappTemplateName", "MEMGINE_OTP_WHATSAPP_TEMPLATE_NAME").orEmpty()
            val whatsappTemplateLanguage = optionalValue("memgine.otp.whatsappTemplateLanguage", "MEMGINE_OTP_WHATSAPP_TEMPLATE_LANGUAGE") ?: "en"

            if (otpProvider == "AWS_END_USER_MESSAGING_SMS") {
                require(awsRegion.isNotBlank()) {
                    "MEMGINE_OTP_AWS_REGION is required when AWS SMS provider is enabled"
                }

                require(awsOriginationIdentity.isNotBlank()) {
                    "MEMGINE_OTP_AWS_ORIGINATION_IDENTITY is required when AWS SMS provider is enabled"
                }
            }

            return AppConfig(
                server = ServerConfig(
                    host = value(
                        "ktor.deployment.host",
                        "MEMGINE_SERVER_HOST"
                    ),
                    port = value(
                        "ktor.deployment.port",
                        "MEMGINE_SERVER_PORT"
                    ).toInt(),
                    enforceHttps = enforceHttps,
                    environment = environment,
                    corsAllowedHosts = value(
                        "memgine.server.corsAllowedHosts",
                        "MEMGINE_CORS_ALLOWED_HOSTS"
                    )
                        .split(',')
                        .map(String::trim)
                        .filter(String::isNotEmpty)
                        .toSet()
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
                        "MEMGINE_DB_SCHEMA"
                    ),
                    maximumPoolSize = value(
                        "memgine.database.maximumPoolSize",
                        "MEMGINE_DB_POOL_SIZE",
                        "10"
                    ).toInt()
                ),

                authentication = AuthenticationConfig(
                    sessionDurationMinutes = value(
                        "memgine.authentication.sessionDurationMinutes",
                        "MEMGINE_AUTH_SESSION_MINUTES",
                        "480"
                    ).toLong(),
                    customerSessionDurationDays = value(
                        "memgine.authentication.customerSessionDurationDays",
                        "MEMGINE_CUSTOMER_SESSION_DAYS",
                        "30"
                    ).toLong(),
                    posDeviceCookieName = value("memgine.authentication.posDeviceCookieName", "MEMGINE_POS_DEVICE_COOKIE_NAME", "memgine_pos_device"),
                    posDeviceCookieDays = value("memgine.authentication.posDeviceCookieDays", "MEMGINE_POS_DEVICE_COOKIE_DAYS", "365").toLong(),
                    posPinMaxAttempts = value("memgine.authentication.posPinMaxAttempts", "MEMGINE_POS_PIN_MAX_ATTEMPTS", "5").toInt(),
                    posPinLockMinutes = value("memgine.authentication.posPinLockMinutes", "MEMGINE_POS_PIN_LOCK_MINUTES", "15").toLong(),
                    cookieName = value(
                        "memgine.authentication.cookieName",
                        "MEMGINE_AUTH_COOKIE_NAME",
                        "memgine_session"
                    ),
                    secureCookie = enforceHttps,
                    passwordMinimumLength = value(
                        "memgine.authentication.passwordMinimumLength",
                        "MEMGINE_AUTH_PASSWORD_MIN_LENGTH",
                        "12"
                    ).toInt()
                ),

                otp = OtpConfig(
                    provider = otpProvider,
                    pepper = otpPepper,
                    ttlSeconds = value(
                        "memgine.otp.ttlSeconds",
                        "MEMGINE_OTP_TTL_SECONDS",
                        "300"
                    ).toLong(),
                    cooldownSeconds = value(
                        "memgine.otp.cooldownSeconds",
                        "MEMGINE_OTP_COOLDOWN_SECONDS",
                        "60"
                    ).toInt(),
                    maxAttempts = value(
                        "memgine.otp.maxAttempts",
                        "MEMGINE_OTP_MAX_ATTEMPTS",
                        "5"
                    ).toInt(),
                    allowedRegions = allowedRegions,
                    awsRegion = awsRegion,
                    awsConfigurationSet = awsConfigurationSet,
                    awsOriginationIdentity = awsOriginationIdentity,
                    notificationEventsTopicArn = notificationEventsTopicArn,
                    whatsappTemplateName = whatsappTemplateName,
                    whatsappTemplateLanguage = whatsappTemplateLanguage
                )
            )
        }
    }
}

data class ServerConfig(
    val host: String,
    val port: Int,
    val enforceHttps: Boolean,
    val environment: String,
    val corsAllowedHosts: Set<String>
)

data class AuthenticationConfig(
    val sessionDurationMinutes: Long,
    val customerSessionDurationDays: Long,
    val posDeviceCookieName: String,
    val posDeviceCookieDays: Long,
    val posPinMaxAttempts: Int,
    val posPinLockMinutes: Long,
    val cookieName: String,
    val secureCookie: Boolean,
    val passwordMinimumLength: Int
)

data class OtpConfig(
    val provider: String,
    val pepper: String,
    val ttlSeconds: Long,
    val cooldownSeconds: Int,
    val maxAttempts: Int,
    val allowedRegions: Set<String>,
    val awsRegion: String,
    val awsConfigurationSet: String,
    val awsOriginationIdentity: String,
    val notificationEventsTopicArn: String,
    val whatsappTemplateName: String,
    val whatsappTemplateLanguage: String
)

data class DatabaseConfig(
    val jdbcUrl: String,
    val username: String,
    val password: String,
    val schema: String,
    val maximumPoolSize: Int
)
