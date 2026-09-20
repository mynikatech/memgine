package com.mynikatech.memgine.component.notification
import com.mynikatech.memgine.net.dto.NotificationDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
interface NotificationSql {
 @SqlQuery("SELECT create_in_app_notification(:id,:organizationId,:recipientId,:eventType,:title,:message,CAST(:context AS jsonb))") fun create(@Bind("id")id:String,@Bind("organizationId")organizationId:String?,@Bind("recipientId")recipientId:String,@Bind("eventType")eventType:String,@Bind("title")title:String,@Bind("message")message:String,@Bind("context")context:String?):Boolean
 @SqlQuery("SELECT * FROM get_my_notifications(:recipientId)") fun list(@Bind("recipientId")recipientId:String):List<NotificationDto>
 @SqlQuery("SELECT get_my_unread_notification_count(:recipientId)") fun unread(@Bind("recipientId")recipientId:String):Int
 @SqlQuery("SELECT mark_my_notification_read(:id,:recipientId)") fun markRead(@Bind("id")id:String,@Bind("recipientId")recipientId:String):Boolean
 @SqlQuery("SELECT mark_my_notifications_read(:recipientId)") fun markAllRead(@Bind("recipientId")recipientId:String):Int
}
