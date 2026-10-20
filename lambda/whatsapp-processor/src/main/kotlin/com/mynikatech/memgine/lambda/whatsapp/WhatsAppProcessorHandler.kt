package com.mynikatech.memgine.lambda.whatsapp
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.amazonaws.services.lambda.runtime.events.SQSBatchResponse
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory

class WhatsAppProcessorHandler(
 private val sender:MetaWhatsAppSender=MetaWhatsAppSenderFactory.create(),
 private val acknowledgements:DeliveryAcknowledgementQueue=DeliveryAcknowledgementQueue()
) : RequestHandler<SQSEvent,SQSBatchResponse> {
 private val json=Json { ignoreUnknownKeys=true }; private val log=LoggerFactory.getLogger(javaClass)
 override fun handleRequest(event:SQSEvent,context:Context):SQSBatchResponse {
  val failures=mutableListOf<SQSBatchResponse.BatchItemFailure>()
  event.records.forEach { record -> try {
   val sns=json.decodeFromString<SnsEnvelope>(record.body); val notification=json.decodeFromString<NotificationEventTransport>(sns.message)
   if("WHATSAPP" !in notification.channels) return@forEach
   val destination=notification.whatsapp?.address?.trim().takeUnless { it.isNullOrEmpty() || it.length<7 } ?: throw NonRetryableWhatsAppException(400,null,null,null)
   val result=notification.whatsappTemplate?.let { sender.sendTemplate(destination,it) } ?: sender.sendText(destination,notification.message)
   val messageId=result.messageId ?: throw IllegalStateException("Meta response did not contain a message ID")
   notification.deliveryId?.let { deliveryId ->
    try { acknowledgements.enqueue(deliveryId,messageId) } catch(_:Exception) { log.error("WhatsApp acknowledgement enqueue failed after provider acceptance; deliveryId={}",deliveryId) }
   }
  } catch(e:NonRetryableWhatsAppException) { log.warn("WhatsApp notification rejected; status={}, code={}",e.status,e.errorCode) }
    catch(_:Exception) { failures+=SQSBatchResponse.BatchItemFailure(record.messageId) } }
  return SQSBatchResponse(failures)
 }
}
