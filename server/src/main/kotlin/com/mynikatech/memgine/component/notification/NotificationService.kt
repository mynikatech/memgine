package com.mynikatech.memgine.component.notification
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.NotificationDto
import java.util.UUID
class NotificationService(private val sql:NotificationSql) {
 fun createNotification(organizationId:String?,recipientId:String,eventType:String,title:String,message:String,context:String?=null):Boolean {
  if (recipientId.isBlank() || eventType.isBlank() || eventType.length>100 || title.isBlank() || title.length>200 || message.isBlank()) throw BadRequestException("Invalid notification")
  return sql.create(UUID.randomUUID().toString(),organizationId,recipientId,eventType,title,message,context)
 }
 fun list(recipientId:String):List<NotificationDto> = sql.list(recipientId)
 fun unreadCount(recipientId:String):Int = sql.unread(recipientId)
 fun markRead(id:String,recipientId:String) { if (!sql.markRead(id,recipientId)) throw NotFoundException("Notification was not found") }
 fun markAllRead(recipientId:String):Int = sql.markAllRead(recipientId)
}
