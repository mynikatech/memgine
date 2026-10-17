package com.mynikatech.memgine.component.support

import com.mynikatech.memgine.exception.NotFoundException
import org.jdbi.v3.core.Jdbi
import java.util.UUID

class SupportService(private val jdbi: Jdbi) {
    private fun sql() = jdbi.onDemand(SupportSql::class.java)
    private fun limit(value: Int?) = (value ?: 50).coerceIn(1, 100)
    private fun offset(value: Int?) = (value ?: 0).coerceAtLeast(0)
    fun createCustomer(actor:String, request:CreateSupportRequestDto) = sql().create("SUP-"+UUID.randomUUID(), request.organizationId, actor, request.category, request.issueType, request.subject, request.description)
    fun customerList(actor:String, limit:Int?, offset:Int?) = sql().customerList(actor,limit(limit),offset(offset))
    fun orgList(org:String, actor:String, category:String?, status:String?, priority:String?, limit:Int?, offset:Int?) = sql().orgList(org,actor,category,status,priority,limit(limit),offset(offset))
    fun platformList(actor:String, org:String?, category:String?, status:String?, priority:String?, limit:Int?, offset:Int?) = sql().platformList(actor,org,category,status,priority,limit(limit),offset(offset))
    private fun detail(row:SupportRequestDto?, id:String, actor:String, viewer:String):SupportRequestDetailDto { val request=row?:throw NotFoundException("Support request was not found"); return SupportRequestDetailDto(request,sql().messages(id,actor,viewer),sql().events(id,actor,viewer)) }
    fun customerDetail(actor:String,id:String)=detail(sql().customerDetail(id,actor),id,actor,"CUSTOMER")
    fun orgDetail(org:String,actor:String,id:String)=detail(sql().orgDetail(id,org,actor),id,actor,"ORG_ADMIN")
    fun platformDetail(actor:String,id:String)=detail(sql().platformDetail(id,actor),id,actor,"PLATFORM_ADMIN")
    fun customerMessage(actor:String,id:String,request:AddSupportMessageDto)=sql().addMessage("SMSG-"+UUID.randomUUID(),id,actor,"CUSTOMER","CUSTOMER_REPLY",request.messageBody,false)
    fun orgMessage(actor:String,id:String,request:AddSupportMessageDto,internal:Boolean)=sql().addMessage("SMSG-"+UUID.randomUUID(),id,actor,"ORG_ADMIN",if(internal)"INTERNAL_NOTE" else "BUSINESS_REPLY",request.messageBody,internal)
    fun platformMessage(actor:String,id:String,request:AddSupportMessageDto,recommendation:Boolean)=sql().addMessage("SMSG-"+UUID.randomUUID(),id,actor,"PLATFORM_ADMIN",if(recommendation)"PLATFORM_RECOMMENDATION" else "INTERNAL_NOTE",request.messageBody,true)
    fun platformReply(actor:String,id:String,request:AddSupportMessageDto)=sql().addMessage("SMSG-"+UUID.randomUUID(),id,actor,"PLATFORM_ADMIN","PLATFORM_REPLY",request.messageBody,false)
    fun reopen(actor:String,id:String,request:ReopenSupportRequestDto)=sql().reopen(id,actor,request.reason)
    fun update(org:String,actor:String,id:String,request:UpdateSupportRequestDto)=sql().update(id,org,actor,request.status,request.priority,request.assignedToUserId,request.resolutionSummary,request.versionNo)
}
