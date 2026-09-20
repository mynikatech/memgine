package com.mynikatech.memgine.lambda.email

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ResendEmailSender(
    private val apiKey: String = System.getenv("RESEND_API_KEY") ?: error("RESEND_API_KEY is required"),
    private val from: String = System.getenv("RESEND_FROM_EMAIL") ?: error("RESEND_FROM_EMAIL is required"),
    private val client: OkHttpClient = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).writeTimeout(20, TimeUnit.SECONDS).build()
) : EmailSender {
    override fun send(to: String, subject: String, html: String) {
        val body = Json.encodeToString(ResendRequest(from, listOf(to), subject, html))
        val request = Request.Builder().url("https://api.resend.com/emails")
            .header("Authorization", "Bearer $apiKey")
            .post(body.toRequestBody("application/json".toMediaType())).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("Resend delivery failed with HTTP ${response.code}")
        }
    }
}
