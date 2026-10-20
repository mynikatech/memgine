package com.mynikatech.memgine.lambda.whatsapp

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.SendMessageRequest
import java.util.UUID

@Serializable data class DeliveryAcknowledgementMessage(val acknowledgementEventId:String,val deliveryId:String,val providerMessageId:String)

class DeliveryAcknowledgementQueue(
 private val queueUrl:String=System.getenv("MEMGINE_WHATSAPP_DELIVERY_ACK_QUEUE_URL").orEmpty(),
 private val sqs:SqsClient=SqsClient.create()
) {
 fun enqueue(deliveryId:String,providerMessageId:String) {
  require(queueUrl.isNotBlank()) { "Support acknowledgement queue is not configured" }
  val body=Json.encodeToString(DeliveryAcknowledgementMessage("SACK-${UUID.randomUUID()}",deliveryId,providerMessageId))
  sqs.sendMessage(SendMessageRequest.builder().queueUrl(queueUrl).messageBody(body).build())
 }
}
