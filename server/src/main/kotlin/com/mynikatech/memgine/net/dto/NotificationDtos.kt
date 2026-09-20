package com.mynikatech.memgine.net.dto
import kotlinx.serialization.Serializable
@Serializable data class NotificationDto(val id:String,val organizationId:String?=null,val eventType:String,val title:String,val message:String,val context:String?=null,val createdAt:String,val readAt:String?=null)
@Serializable data class NotificationUnreadCountDto(val count:Int)
