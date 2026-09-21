package com.mynikatech.memgine.lambda.whatsapp
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.SQSEvent
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory

class WhatsAppProcessorHandler(private val sender:MetaWhatsAppSender=MetaWhatsAppSenderFactory.create()) : RequestHandler<SQSEvent,Unit> {
 private val json=Json { ignoreUnknownKeys=true }; private val log=LoggerFactory.getLogger(javaClass)
 override fun handleRequest(event:SQSEvent,context:Context) { event.records.forEach { record -> try { val sns=json.decodeFromString<SnsEnvelope>(record.body); val notification=json.decodeFromString<NotificationEventTransport>(sns.message); if("WHATSAPP" !in notification.channels) return@forEach; val destination=notification.whatsapp?.address?.trim().takeUnless { it.isNullOrEmpty() || it.length<7 } ?: throw IllegalArgumentException("WHATSAPP notification has no valid destination"); val template=notification.whatsappTemplate; log.info("Processing WhatsApp notification: eventType={}, correlationId={}, template={}",notification.eventType,notification.correlationId,template?.name); val result=if(template != null) sender.sendTemplate(destination,template) else sender.sendText(destination,notification.message); log.info("WhatsApp notification delivered: eventType={}, correlationId={}, messageId={}",notification.eventType,notification.correlationId,result.messageId) } catch(e:NonRetryableWhatsAppException) { log.warn("Non-retryable WhatsApp provider response: status={}, code={}, type={}, message={}",e.status,e.errorCode,e.errorType,e.providerMessage) } } }
}
