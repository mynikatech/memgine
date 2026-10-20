package com.mynikatech.memgine.lambda.whatsapp

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.amazonaws.services.lambda.runtime.events.SQSBatchResponse
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

class DeliveryAcknowledgementProcessorHandler(
 private val acknowledgements:DeliveryAcknowledgementClient=DeliveryAcknowledgementClient()
) : RequestHandler<SQSEvent,SQSBatchResponse> {
 override fun handleRequest(event:SQSEvent,context:Context):SQSBatchResponse {
  val failures=mutableListOf<SQSBatchResponse.BatchItemFailure>()
  event.records.forEach { record -> try {
   val ack=Json.decodeFromString<DeliveryAcknowledgementMessage>(record.body)
   require(ack.acknowledgementEventId.isNotBlank() && ack.deliveryId.isNotBlank() && ack.providerMessageId.isNotBlank())
   acknowledgements.acknowledge(ack.deliveryId,ack.providerMessageId)
  } catch(_:IllegalArgumentException) { } catch(_:Exception) { failures+=SQSBatchResponse.BatchItemFailure(record.messageId) } }
  return SQSBatchResponse(failures)
 }
}
