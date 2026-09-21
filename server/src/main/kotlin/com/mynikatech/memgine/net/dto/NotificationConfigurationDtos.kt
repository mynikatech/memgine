package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class NotificationConfigurationDto(
    val id: String, val organizationId: String, val configurationName: String,
    val emailEnabled: Boolean, val smsEnabled: Boolean,
    val whatsappEnabled: Boolean, val pushEnabled: Boolean,
    val inAppEnabled: Boolean, val otpDeliveryChannel: String, val notificationStatusId: String,
    val createdAt: String, val createdBy: String, val updatedAt: String? = null,
    val updatedBy: String? = null, val isDeleted: Boolean, val versionNo: Int
)

@Serializable
data class NotificationConfigurationResultDto(val configuration: NotificationConfigurationDto?)

@Serializable
data class NotificationConfigurationWriteDto(
    val configurationName: String, val emailEnabled: Boolean,
    val smsEnabled: Boolean, val whatsappEnabled: Boolean,
    val pushEnabled: Boolean, val inAppEnabled: Boolean, val otpDeliveryChannel: String,
    val notificationStatusId: String, val versionNo: Int
)
