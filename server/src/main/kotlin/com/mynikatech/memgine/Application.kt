package com.mynikatech.memgine

import com.mynikatech.memgine.component.asset.BrandingAssetService
import com.mynikatech.memgine.component.asset.AssetStorageService
import com.mynikatech.memgine.component.asset.LocalAssetStorageService
import com.mynikatech.memgine.component.asset.S3AssetStorageService
import com.mynikatech.memgine.component.entitystatus.EntityStatusCache
import com.mynikatech.memgine.component.notification.SnsExternalNotificationPublisher
import com.mynikatech.memgine.component.notification.UnavailableExternalNotificationPublisher
import com.mynikatech.memgine.component.support.SupportNotificationBackgroundWorker
import com.mynikatech.memgine.component.support.SupportNotificationDeliveryMode
import com.mynikatech.memgine.component.support.SupportNotificationOutboxWorker
import com.mynikatech.memgine.component.entitystatus.EntityStatusService
import com.mynikatech.memgine.component.entitystatus.EntityStatusSql
import com.mynikatech.memgine.component.referencedata.ReferenceDataCache
import com.mynikatech.memgine.component.referencedata.ReferenceDataService
import com.mynikatech.memgine.component.referencedata.ReferenceDataSql
import com.mynikatech.memgine.config.AppConfig
import com.mynikatech.memgine.database.DatabaseFactory
import com.mynikatech.memgine.plugins.configureCors
import com.mynikatech.memgine.plugins.configureMonitoring
import com.mynikatech.memgine.plugins.configureRouting
import com.mynikatech.memgine.plugins.configureSecurity
import com.mynikatech.memgine.plugins.configureSerialization
import com.mynikatech.memgine.plugins.configureStatusPages
import io.ktor.server.application.Application
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import java.nio.file.Paths

fun main() {
    val config = AppConfig.load()

    embeddedServer(
        factory = Netty,
        host = config.server.host,
        port = config.server.port,
        module = Application::module
    ).start(wait = true)
}

fun Application.module() {
    val config = AppConfig.load(environment.config)
    val database = DatabaseFactory.create(config.database)
    var supportNotificationScheduler: SupportNotificationBackgroundWorker? = null
    monitor.subscribe(io.ktor.server.application.ApplicationStopped) {
        supportNotificationScheduler?.close()
        database.close()
    }

    configureSerialization()
    configureMonitoring()
    configureSecurity(config.server)
    configureStatusPages()
    configureCors(config.server)

    val referenceDataSql =
        database.jdbi.onDemand(ReferenceDataSql::class.java)

    val referenceDataCache =
        ReferenceDataCache()

    val referenceDataService =
        ReferenceDataService(
            referenceDataSql,
            referenceDataCache
        )

    val entityStatusSql =
        database.jdbi.onDemand(EntityStatusSql::class.java)

    val entityStatusCache =
        EntityStatusCache()

    val entityStatusService =
        EntityStatusService(
            entityStatusSql,
            entityStatusCache
        )

    // Populate server caches from PostgreSQL during startup.
    referenceDataService.refresh()
    entityStatusService.refresh()

    val assetStorageService: AssetStorageService =
        when (config.assets.provider) {
            "LOCAL" -> LocalAssetStorageService(
                rootDirectory = Paths.get("server-data", "uploads")
            )
            "S3" -> S3AssetStorageService(
                bucket = config.assets.appDataBucket,
                region = config.assets.awsRegion
            )
            else -> error("Unsupported asset storage provider")
        }

    val brandingAssetService =
        BrandingAssetService(
            assetStorageService
        )

    if (config.supportNotifications.workerEnabled) {
        if (config.supportNotifications.allowLiveInDev ||
            config.supportNotifications.environment in setOf("prod", "production")
        ) {
            require(config.otp.notificationEventsTopicArn.isNotBlank()) {
                "MEMGINE_NOTIFICATION_EVENTS_TOPIC_ARN is required for LIVE support notifications"
            }
        }

        val publisher = config.otp.notificationEventsTopicArn
            .takeIf { it.isNotBlank() }
            ?.let(::SnsExternalNotificationPublisher)
            ?: UnavailableExternalNotificationPublisher()
        val worker = SupportNotificationOutboxWorker(
            database.jdbi,
            publisher,
            SupportNotificationDeliveryMode.fromConfig(config.supportNotifications),
            config.supportNotifications
        )
        supportNotificationScheduler = SupportNotificationBackgroundWorker(
            worker,
            config.supportNotifications.pollIntervalSeconds
        ).also { it.start() }
    }

    configureRouting(
        database,
        referenceDataService,
        entityStatusService,
        brandingAssetService,
        config
    )
}
