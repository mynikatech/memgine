package com.mynikatech.memgine.component.support

import org.slf4j.LoggerFactory
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class SupportNotificationBackgroundWorker(
    private val worker: SupportNotificationOutboxWorker,
    private val pollIntervalSeconds: Long,
    private val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "support-notification-outbox").apply { isDaemon = true }
    }
) : AutoCloseable {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val workerId = "support-outbox-${UUID.randomUUID()}"

    fun start() {
        executor.scheduleWithFixedDelay({
            try {
                val result = worker.runOnce(workerId, limit = 20)
                if (result.failures > 0) {
                    logger.warn("Support notification outbox batch completed with failures={}", result.failures)
                }
            } catch (ex : Exception) {
                logger.warn("Support notification outbox batch failed", ex)
            }
        }, 0, pollIntervalSeconds, TimeUnit.SECONDS)
    }

   override fun close() {
        executor.shutdown()
        try {
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                executor.shutdownNow()
                if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                    logger.warn("Support notification worker did not terminate")
                }
            }
        } catch (ex: InterruptedException) {
            executor.shutdownNow()
            Thread.currentThread().interrupt()
        }
    }   
}
