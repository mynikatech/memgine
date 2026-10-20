package com.mynikatech.memgine.component.support

import com.mynikatech.memgine.component.notification.ExternalNotificationPublisher
import com.mynikatech.memgine.component.notification.NotificationChannel
import com.mynikatech.memgine.component.notification.NotificationDestination
import com.mynikatech.memgine.component.notification.NotificationEvent
import com.mynikatech.memgine.component.notification.NotificationTemplate
import com.mynikatech.memgine.component.notification.SnsExternalNotificationPublisher
import com.mynikatech.memgine.config.SupportNotificationConfig
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import java.time.OffsetDateTime
import java.util.UUID

/** Not currently scheduled by Routing.kt. LIVE must be explicitly gated by deployment configuration. */
data class SupportNotificationDeliveryMode(val liveEnabled: Boolean = false, val production: Boolean = false) {
    companion object { fun fromConfig(config: SupportNotificationConfig): SupportNotificationDeliveryMode =
        SupportNotificationDeliveryMode(config.allowLiveInDev, config.environment in setOf("prod", "production")) }
    fun forRecipient(requested: String): String = when {
        production -> if (requested == "MOCK") "MOCK" else "LIVE"
        requested == "LIVE" && liveEnabled -> "LIVE"
        else -> "MOCK"
    }
}

data class SupportOutboxRow(
    val outboxEventId: String, val supportRequestId: String, val organizationId: String?,
    val eventType: String, val payload: String, val attemptCount: Int, val leaseToken: String
)

data class SupportNotificationRecipient(
    val recipientUserId: String, val email: String?, val phone: String?, val isCustomer: Boolean,
    val recipientName: String, val recipientKind: String, val ticketNumber: String,
    val organizationName: String, val recipientDeliveryMode: String,
    val whatsappOptedIn: Boolean, val emailOptedIn: Boolean
)

data class SupportPublishClaim(val deliveryId: String, val publishState: String)
data class SupportDeliverySnapshot(
    val deliveryId: String, val destination: String?, val templateName: String?,
    val templateParametersJson: String?, val channel: String
)

@RegisterBeanMapper(SupportOutboxRow::class)
@RegisterBeanMapper(SupportNotificationRecipient::class)
@RegisterBeanMapper(SupportPublishClaim::class)
@RegisterBeanMapper(SupportDeliverySnapshot::class)
interface SupportNotificationOutboxSql {
    @SqlQuery("SELECT * FROM support_notification_claim_outbox(:workerId,:limit)")
    fun claim(@Bind("workerId") workerId: String, @Bind("limit") limit: Int): List<SupportOutboxRow>

    @SqlQuery("SELECT * FROM support_notification_recipients(:outboxEventId)")
    fun recipients(@Bind("outboxEventId") id: String): List<SupportNotificationRecipient>

    @SqlQuery("SELECT support_notification_create_delivery(:deliveryId,:outboxEventId,:recipientUserId,:channel,:mode,:destination,:template,CAST(:templateParametersJson AS jsonb))")
    fun createDelivery(
        @Bind("deliveryId") id: String, @Bind("outboxEventId") eventId: String,
        @Bind("recipientUserId") recipientId: String, @Bind("channel") channel: String,
        @Bind("mode") mode: String, @Bind("destination") destination: String?,
        @Bind("template") template: String?, @Bind("templateParametersJson") parametersJson: String?
    ): Boolean

    @SqlQuery("SELECT * FROM support_notification_claim_delivery_publish(:outboxEventId,:recipientUserId,:channel,:token,:outboxLeaseToken)")
    fun claimPublish(@Bind("outboxEventId") eventId: String,@Bind("recipientUserId") recipientId: String,
                     @Bind("channel") channel: String,@Bind("token") token: String,
                     @Bind("outboxLeaseToken") outboxLeaseToken: String): List<SupportPublishClaim>

    @SqlQuery("SELECT * FROM support_notification_delivery_snapshot(:deliveryId)")
    fun snapshot(@Bind("deliveryId") deliveryId: String): List<SupportDeliverySnapshot>

    @SqlQuery("SELECT support_notification_finish_delivery_publish(:deliveryId,:token,:confirmed,:snsMessageId)")
    fun finishPublish(@Bind("deliveryId") deliveryId: String,@Bind("token") token: String,
                      @Bind("confirmed") confirmed: Boolean, @Bind("snsMessageId") snsMessageId: String?): Boolean

    @SqlQuery("SELECT support_notification_complete_outbox(:outboxEventId,:success,:retryAt,:token)")
    fun complete(@Bind("outboxEventId") id: String,@Bind("success") success: Boolean,
                 @Bind("retryAt") retryAt: OffsetDateTime?,@Bind("token") token: String): Boolean

    @SqlQuery("SELECT support_notification_record_whatsapp_status(:eventId,:messageId,:status,:timestamp,:error,:fingerprint)")
    fun recordWhatsAppStatus(@Bind("eventId") eventId:String,@Bind("messageId") messageId:String,
                             @Bind("status") status:String,@Bind("timestamp") timestamp:OffsetDateTime?,
                             @Bind("error") error:String?,@Bind("fingerprint") fingerprint:String):Boolean

    @SqlQuery("SELECT support_notification_ack_delivery(:deliveryId,:providerMessageId,:providerCorrelationId)")
    fun acknowledge(@Bind("deliveryId") id:String,@Bind("providerMessageId") providerId:String,
                    @Bind("providerCorrelationId") correlationId:String?):Boolean
}

/** Approved template contract: customer 3 body parameters, business 3, platform 2. */
internal fun supportTemplate(recipient: SupportNotificationRecipient, config: SupportNotificationConfig): NotificationTemplate {
    val who = recipient.recipientName.ifBlank { "Memgine user" }
    val ticket = recipient.ticketNumber.ifBlank { throw IllegalStateException("Missing support ticket number") }
    val org = recipient.organizationName.ifBlank { "Memgine Support" }
    return when (recipient.recipientKind) {
        "CUSTOMER" -> NotificationTemplate(config.customerTemplate, config.templateLanguage, listOf(who,ticket,org))
        "BUSINESS_ADMIN", "BUSINESS_OWNER" -> NotificationTemplate(config.businessTemplate, config.templateLanguage, listOf(who,ticket,org))
        "PLATFORM_ADMIN" -> NotificationTemplate(config.platformTemplate, config.templateLanguage, listOf(who,ticket))
        else -> error("Unsupported support recipient kind")
    }
}

class SupportNotificationOutboxWorker(
    private val jdbi:Jdbi,
    private val publisher:ExternalNotificationPublisher,
    private val deliveryMode:SupportNotificationDeliveryMode,
    private val config: SupportNotificationConfig
) {
    private val json = Json
    private fun sql() = jdbi.onDemand(SupportNotificationOutboxSql::class.java)

    /** One bounded batch, external-only. Ambiguous SNS outcome is never automatically resent. */
    fun runOnce(workerId:String,limit:Int=20):SupportNotificationRunResult {
        // Never mistake a no-op publisher for successful external acceptance.
        require(!(deliveryMode.liveEnabled || deliveryMode.production) || publisher is SnsExternalNotificationPublisher) {
            "LIVE support delivery requires the SNS publisher"
        }
        check(config.workerEnabled) { "Support notification worker is disabled" }
        val claimed=sql().claim(workerId,limit)
        var prepared=0
        var failed=0
        for (row in claimed) {
            try {
                val recipients=sql().recipients(row.outboxEventId)
                for (recipient in recipients) {
                    val options=buildList {
                        if (recipient.whatsappOptedIn && !recipient.phone.isNullOrBlank()) add(NotificationChannel.WHATSAPP)
                        if (recipient.isCustomer && recipient.emailOptedIn && !recipient.email.isNullOrBlank()) add(NotificationChannel.EMAIL)
                    }
                    for (channel in options) {
                        val isWa=channel==NotificationChannel.WHATSAPP
                        val template=if(isWa) supportTemplate(recipient, config) else null
                        val destination=if(isWa) recipient.phone else recipient.email
                        val mode=deliveryMode.forRecipient(recipient.recipientDeliveryMode)
                        // Do not create a LIVE delivery that would become permanently pending
                        // solely because the recipient has not opted in.
                        if(mode == "LIVE" && !supportLiveConsentVerified(recipient, channel)) continue
                        sql().createDelivery("SND-${UUID.randomUUID()}",row.outboxEventId,
                            recipient.recipientUserId,channel.name,mode,destination,
                            template?.name,template?.parameters?.let { json.encodeToString(it) })
                        prepared++
                        if(mode != "LIVE") continue
                        val token="SNP-${UUID.randomUUID()}"
                        for(claim in sql().claimPublish(row.outboxEventId,recipient.recipientUserId,channel.name,token,row.leaseToken)) {
                            val snapshot=sql().snapshot(claim.deliveryId).single()
                            val params=snapshot.templateParametersJson?.let { json.decodeFromString<List<String>>(it) }.orEmpty()
                            val approvedTemplate=if(isWa) NotificationTemplate(
                                requireNotNull(snapshot.templateName),config.templateLanguage,params
                            ) else null
                            try {
                                val snsId = (publisher as SnsExternalNotificationPublisher).publishWithReceipt(NotificationEvent(
                                    eventType=row.eventType,organizationId=row.organizationId,
                                    recipientUserId=recipient.recipientUserId,channels=setOf(channel),
                                    title="Support request update",message="There is an update to your Memgine support request.",
                                    context=row.supportRequestId,
                                    whatsapp=if(isWa) snapshot.destination?.let(::NotificationDestination) else null,
                                    whatsappTemplate=approvedTemplate,
                                    email=if(!isWa) snapshot.destination?.let(::NotificationDestination) else null,
                                    correlationId=row.outboxEventId,deliveryId=claim.deliveryId
                                ),setOf(channel))
                                check(sql().finishPublish(claim.deliveryId,token,true,snsId)) { "Publish lease lost after SNS accepted" }
                            } catch(ex:Exception) {
                                // Publish outcome may be ambiguous. Never blindly publish twice.
                                sql().finishPublish(claim.deliveryId,token,false,null)
                                throw ex
                            }
                        }
                    }
                }
                check(sql().complete(row.outboxEventId,true,null,row.leaseToken)) { "Outbox lease lost" }
            } catch(ex:Exception) {
                failed++
                // Do not mask original failure if this worker lost ownership.
                runCatching { sql().complete(row.outboxEventId,false,OffsetDateTime.now().plusMinutes(5),row.leaseToken) }
            }
        }
        return SupportNotificationRunResult(claimed.size,prepared,failed)
    }

    private fun supportLiveConsentVerified(recipient:SupportNotificationRecipient,channel:NotificationChannel): Boolean =
        when(channel) {
            NotificationChannel.WHATSAPP -> recipient.whatsappOptedIn
            NotificationChannel.EMAIL -> recipient.isCustomer && recipient.emailOptedIn
            else -> false
        }
}

data class SupportNotificationRunResult(val claimed:Int,val deliveriesCreated:Int,val failures:Int)
