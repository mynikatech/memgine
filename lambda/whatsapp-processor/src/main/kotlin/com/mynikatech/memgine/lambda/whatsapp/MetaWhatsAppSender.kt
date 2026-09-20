package com.mynikatech.memgine.lambda.whatsapp
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

data class MetaSendResult(val messageId:String?)
class MetaWhatsAppSender(
 private val token:String,
 private val phoneNumberId:String=System.getenv("META_PHONE_NUMBER_ID") ?: error("META_PHONE_NUMBER_ID is required"),
 private val version:String=System.getenv("META_GRAPH_API_VERSION") ?: DEFAULT_GRAPH_API_VERSION,
 private val client:OkHttpClient=OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(20,TimeUnit.SECONDS).writeTimeout(20,TimeUnit.SECONDS).build()
) {
 fun sendTemplate(to:String, template:WhatsAppTemplateTransport):MetaSendResult = send(to, templatePayload(to,template))
 fun sendText(to:String, text:String):MetaSendResult = send(to, buildJsonObject { put("messaging_product","whatsapp"); put("to",to); put("type","text"); put("text",buildJsonObject { put("body",text) }) })
 private fun send(to:String,payload:JsonObject):MetaSendResult { val request=Request.Builder().url("https://graph.facebook.com/$version/$phoneNumberId/messages").header("Authorization","Bearer $token").post(Json.encodeToString(payload).toRequestBody("application/json".toMediaType())).build(); client.newCall(request).execute().use { response -> val status=response.code; val body=response.body?.string().orEmpty(); if(status !in 200..299) { if(status in setOf(400,401,403,404)) throw NonRetryableWhatsAppException(status); throw IllegalStateException("Meta WhatsApp delivery failed with HTTP $status") }; return MetaSendResult(runCatching { Json.parseToJsonElement(body).jsonObject["messages"]?.jsonArray?.firstOrNull()?.jsonObject?.get("id")?.jsonPrimitive?.content }.getOrNull()) } }
 private fun templatePayload(to:String,t:WhatsAppTemplateTransport)=buildJsonObject { put("messaging_product","whatsapp");put("to",to);put("type","template");put("template",buildJsonObject { put("name",t.name);put("language",buildJsonObject { put("code",t.languageCode) });put("components",buildJsonArray { add(buildJsonObject { put("type","body");put("parameters",buildJsonArray { t.parameters.forEach { p->add(buildJsonObject { put("type","text");put("text",p) }) } }) }); t.buttonParameter?.let { button->add(buildJsonObject { put("type","button");put("sub_type","url");put("index","0");put("parameters",buildJsonArray { add(buildJsonObject { put("type","text");put("text",button) }) }) }) } }) }) }
 companion object { const val DEFAULT_GRAPH_API_VERSION="v22.0" }
}
