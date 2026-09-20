package com.mynikatech.memgine.lambda.email

import kotlinx.serialization.Serializable

@Serializable data class ResendRequest(val from: String, val to: List<String>, val subject: String, val html: String)
