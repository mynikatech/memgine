package com.mynikatech.memgine.config

import io.ktor.server.config.ApplicationConfig
import java.util.Properties

const val DEFAULT_POYNT_CLOUD_BASE_URL = "https://services.poynt.net"
const val DEFAULT_POYNT_JWT_AUDIENCE = "https://services.poynt.net"

data class AppConfig(
    val server: ServerConfig,
    val database: DatabaseConfig,
    val authentication: AuthenticationConfig,
    val otp: OtpConfig,
    val payment: PaymentConfig,
    val poynt: PoyntCommerceConfig,
    val assets: AssetStorageConfig
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

            val assetStorageProvider = value(
                "memgine.assets.storageProvider",
                "MEMGINE_ASSET_STORAGE_PROVIDER",
                "LOCAL"
            ).uppercase()

            require(assetStorageProvider in setOf("LOCAL", "S3")) {
                "MEMGINE_ASSET_STORAGE_PROVIDER must be LOCAL or S3"
            }

            val appDataBucket = optionalValue(
                "memgine.assets.appDataBucket",
                "MEMGINE_APP_DATA_BUCKET"
            ).orEmpty()

            val assetAwsRegion = optionalValue(
                "memgine.assets.awsRegion",
                "MEMGINE_AWS_REGION"
            ).orEmpty()

            if (assetStorageProvider == "S3") {
                require(appDataBucket.isNotBlank()) {
                    "MEMGINE_APP_DATA_BUCKET is required for S3 asset storage"
                }
                require(assetAwsRegion.isNotBlank()) {
                    "MEMGINE_AWS_REGION is required for S3 asset storage"
                }
            }

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

            val awsCanadaOriginationIdentity = optionalValue(
                "memgine.otp.awsCanadaOriginationIdentity",
                "MEMGINE_OTP_AWS_ORIGINATION_IDENTITY_CA"
            ).orEmpty()
            val allowLiveSms = booleanValue("memgine.otp.allowLiveSms", "MEMGINE_ALLOW_LIVE_SMS", false)
            val notificationEventsTopicArn = optionalValue("memgine.otp.notificationEventsTopicArn", "MEMGINE_NOTIFICATION_EVENTS_TOPIC_ARN").orEmpty()
            val whatsappTemplateName = optionalValue("memgine.otp.whatsappTemplateName", "MEMGINE_OTP_WHATSAPP_TEMPLATE_NAME").orEmpty()
            val whatsappTemplateLanguage = optionalValue("memgine.otp.whatsappTemplateLanguage", "MEMGINE_OTP_WHATSAPP_TEMPLATE_LANGUAGE") ?: "en"

            if (environment == "prod" || allowLiveSms) {
                require(awsRegion.isNotBlank()) {
                    "MEMGINE_OTP_AWS_REGION is required when live SMS is enabled"
                }
            }

            if (environment == "prod") {
                require(awsCanadaOriginationIdentity.isNotBlank()) {
                    "MEMGINE_OTP_AWS_ORIGINATION_IDENTITY_CA is required in production for Canadian live SMS"
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
                    corsAllowedHosts = (
                        System.getenv("MEMGINE_ALLOWED_ORIGINS")
                            ?: localProperties.getProperty("MEMGINE_ALLOWED_ORIGINS")
                            ?: System.getenv("MEMGINE_CORS_ALLOWED_HOSTS")
                            ?: localProperties.getProperty("MEMGINE_CORS_ALLOWED_HOSTS")
                            ?: config?.propertyOrNull("memgine.server.allowedOrigins")?.getString()
                            ?: value(
                                "memgine.server.corsAllowedHosts",
                                "MEMGINE_CORS_ALLOWED_HOSTS"
                            )
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
                    environment = environment,
                    passwordMinimumLength = value(
                        "memgine.authentication.passwordMinimumLength",
                        "MEMGINE_AUTH_PASSWORD_MIN_LENGTH",
                        "12"
                    ).toInt()
                ),

                otp = OtpConfig(
                    environment = environment,
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
                    awsCanadaOriginationIdentity = awsCanadaOriginationIdentity,
                    allowLiveSms = allowLiveSms,
                    notificationEventsTopicArn = notificationEventsTopicArn,
                    whatsappTemplateName = whatsappTemplateName,
                    whatsappTemplateLanguage = whatsappTemplateLanguage
                ),

                payment = PaymentConfig(
                    providerCode = value("memgine.payment.provider", "MEMGINE_PAYMENT_PROVIDER", "TEST").uppercase(),
                    stripeSecretKey = optionalValue("memgine.payment.stripeSecretKey", "STRIPE_SECRET_KEY").orEmpty(),
                    stripeWebhookSecret = optionalValue("memgine.payment.stripeWebhookSecret", "STRIPE_WEBHOOK_SECRET").orEmpty(),
                    webBaseUrl = value("memgine.payment.webBaseUrl", "MEMGINE_WEB_BASE_URL", "").trim().trimEnd('/'),
                    monerisClientId = optionalValue("memgine.payment.monerisClientId", "MONERIS_CLIENT_ID").orEmpty(),
                    monerisClientSecret = optionalValue("memgine.payment.monerisClientSecret", "MONERIS_CLIENT_SECRET").orEmpty(),
                    monerisMerchantId = optionalValue("memgine.payment.monerisMerchantId", "MONERIS_MERCHANT_ID").orEmpty(),
                    monerisBaseUrl = value("memgine.payment.monerisBaseUrl", "MONERIS_BASE_URL", "https://api.sb.moneris.io").trim().trimEnd('/'),
                    monerisApiVersion = value("memgine.payment.monerisApiVersion", "MONERIS_API_VERSION", "2026-08-14").trim(),
                    monerisHostedTokenizationProfileId = optionalValue("memgine.payment.monerisHostedTokenizationProfileId", "MONERIS_HOSTED_TOKENIZATION_PROFILE_ID").orEmpty(),
                    monerisHostedTokenizationUrl = value("memgine.payment.monerisHostedTokenizationUrl", "MONERIS_HOSTED_TOKENIZATION_URL", "https://esqa.moneris.com/HPPtoken/index.php").trim()
                ),

                poynt = PoyntCommerceConfig(
                    cloudBaseUrl = value("memgine.poynt.cloudBaseUrl", "MEMGINE_POYNT_CLOUD_BASE_URL", DEFAULT_POYNT_CLOUD_BASE_URL).trim().trimEnd('/'),
                    secretsRegion = optionalValue("memgine.poynt.secretsRegion", "MEMGINE_POYNT_SECRETS_REGION") ?: assetAwsRegion,
                    apiVersion = value("memgine.poynt.apiVersion", "MEMGINE_POYNT_API_VERSION", "1.2").trim(),
                    jwtAudience = value("memgine.poynt.jwtAudience", "MEMGINE_POYNT_JWT_AUDIENCE", DEFAULT_POYNT_JWT_AUDIENCE).trim(),
                    paymentBridgeCallbackUrl = optionalValue("memgine.poynt.paymentBridgeCallbackUrl", "MEMGINE_POYNT_PAYMENT_BRIDGE_CALLBACK_URL").orEmpty(),
                    paymentBridgeCallbackHeaderName = value("memgine.poynt.paymentBridgeCallbackHeaderName", "MEMGINE_POYNT_PAYMENT_BRIDGE_CALLBACK_HEADER_NAME", "X-Memgine-Poynt-Callback").trim(),
                    paymentBridgeCallbackHeaderValue = optionalValue("memgine.poynt.paymentBridgeCallbackHeaderValue", "MEMGINE_POYNT_PAYMENT_BRIDGE_CALLBACK_HEADER_VALUE").orEmpty(),
                    paymentBridgeTtlSeconds = value("memgine.poynt.paymentBridgeTtlSeconds", "MEMGINE_POYNT_PAYMENT_BRIDGE_TTL_SECONDS", "45").toLong()
                ),

                assets = AssetStorageConfig(
                    provider = assetStorageProvider,
                    appDataBucket = appDataBucket,
                    awsRegion = assetAwsRegion
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
    val passwordMinimumLength: Int,
    val environment: String
)

data class OtpConfig(
    val environment: String,
    val provider: String,
    val pepper: String,
    val ttlSeconds: Long,
    val cooldownSeconds: Int,
    val maxAttempts: Int,
    val allowedRegions: Set<String>,
    val awsRegion: String,
    val awsConfigurationSet: String,
    val awsCanadaOriginationIdentity: String,
    val allowLiveSms: Boolean,
    val notificationEventsTopicArn: String,
    val whatsappTemplateName: String,
    val whatsappTemplateLanguage: String
)

data class PoyntCommerceConfig(
    val cloudBaseUrl: String,
    val secretsRegion: String,
    val apiVersion: String,
    val jwtAudience: String,
    val paymentBridgeCallbackUrl: String,
    val paymentBridgeCallbackHeaderName: String,
    val paymentBridgeCallbackHeaderValue: String,
    val paymentBridgeTtlSeconds: Long
)

data class PaymentConfig(
    val providerCode: String,
    val stripeSecretKey: String,
    val stripeWebhookSecret: String,
    val webBaseUrl: String,
    val monerisClientId: String,
    val monerisClientSecret: String,
    val monerisMerchantId: String,
    val monerisBaseUrl: String,
    val monerisApiVersion: String,
    val monerisHostedTokenizationProfileId: String,
    val monerisHostedTokenizationUrl: String
)

data class AssetStorageConfig(
    val provider: String,
    val appDataBucket: String,
    val awsRegion: String
)

data class DatabaseConfig(
    val jdbcUrl: String,
    val username: String,
    val password: String,
    val schema: String,
    val maximumPoolSize: Int
)
