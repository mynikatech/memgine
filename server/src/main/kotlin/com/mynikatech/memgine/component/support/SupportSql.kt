package com.mynikatech.memgine.component.support

import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

@RegisterBeanMapper(SupportRequestDto::class)
interface SupportSql {
    @SqlQuery("SELECT * FROM support_customer_create(:id,:organizationId,:customerUserId,:category,:issueType,:subject,:description)") fun create(@Bind("id") id:String,@Bind("organizationId") organizationId:String,@Bind("customerUserId") customerUserId:String,@Bind("category") category:String,@Bind("issueType") issueType:String,@Bind("subject") subject:String,@Bind("description") description:String): SupportRequestCreatedDto
    @SqlQuery("SELECT * FROM support_customer_list(:userId,:limit,:offset)") fun customerList(@Bind("userId") userId:String,@Bind("limit") limit:Int,@Bind("offset") offset:Int):List<SupportRequestDto>
    @SqlQuery("SELECT * FROM support_org_list(:organizationId,:actorId,:category,:status,:priority,:limit,:offset)") fun orgList(@Bind("organizationId") organizationId:String,@Bind("actorId") actorId:String,@Bind("category") category:String?,@Bind("status") status:String?,@Bind("priority") priority:String?,@Bind("limit") limit:Int,@Bind("offset") offset:Int):List<SupportRequestDto>
    @SqlQuery("SELECT * FROM support_platform_list(:actorId,:organizationId,:category,:status,:priority,:limit,:offset)") fun platformList(@Bind("actorId") actorId:String,@Bind("organizationId") organizationId:String?,@Bind("category") category:String?,@Bind("status") status:String?,@Bind("priority") priority:String?,@Bind("limit") limit:Int,@Bind("offset") offset:Int):List<SupportRequestDto>
    @SqlQuery("SELECT * FROM support_customer_detail(:id,:actorId)") fun customerDetail(@Bind("id") id:String,@Bind("actorId") actorId:String):SupportRequestDto?
    @SqlQuery("SELECT * FROM support_org_detail(:id,:organizationId,:actorId)") fun orgDetail(@Bind("id") id:String,@Bind("organizationId") organizationId:String,@Bind("actorId") actorId:String):SupportRequestDto?
    @SqlQuery("SELECT * FROM support_platform_detail(:id,:actorId)") fun platformDetail(@Bind("id") id:String,@Bind("actorId") actorId:String):SupportRequestDto?
    @SqlQuery("SELECT * FROM support_messages(:id,:actorId,:viewer)") @RegisterBeanMapper(SupportMessageDto::class) fun messages(@Bind("id") id:String,@Bind("actorId") actorId:String,@Bind("viewer") viewer:String):List<SupportMessageDto>
    @SqlQuery("SELECT * FROM support_events(:id,:actorId,:viewer)") @RegisterBeanMapper(SupportEventDto::class) fun events(@Bind("id") id:String,@Bind("actorId") actorId:String,@Bind("viewer") viewer:String):List<SupportEventDto>
    @SqlQuery("SELECT support_add_message(:messageId,:id,:actorId,:role,:type,:body,:internal)") fun addMessage(@Bind("messageId") messageId:String,@Bind("id") id:String,@Bind("actorId") actorId:String,@Bind("role") role:String,@Bind("type") type:String,@Bind("body") body:String,@Bind("internal") internal:Boolean):Boolean
    @SqlQuery("SELECT support_customer_reopen(:id,:actorId,:reason)") fun reopen(@Bind("id") id:String,@Bind("actorId") actorId:String,@Bind("reason") reason:String):Boolean
    @SqlQuery("SELECT support_admin_update(:id,:organizationId,:actorId,:status,:priority,:assignedTo,:resolution,:version)") fun update(@Bind("id") id:String,@Bind("organizationId") organizationId:String,@Bind("actorId") actorId:String,@Bind("status") status:String?,@Bind("priority") priority:String?,@Bind("assignedTo") assignedTo:String?,@Bind("resolution") resolution:String?,@Bind("version") version:Int):Boolean
    @SqlQuery("SELECT * FROM support_payment_investigation_detail(:id,:organizationId,:actorId)") @RegisterBeanMapper(PaymentInvestigationDto::class) fun paymentInvestigation(@Bind("id") id:String,@Bind("organizationId") organizationId:String,@Bind("actorId") actorId:String):PaymentInvestigationDto?
    @SqlQuery("SELECT * FROM support_payment_exception_candidates(:id,:organizationId,:actorId)") @RegisterBeanMapper(PaymentExceptionCandidateDto::class) fun paymentExceptionCandidates(@Bind("id") id:String,@Bind("organizationId") organizationId:String,@Bind("actorId") actorId:String):List<PaymentExceptionCandidateDto>
    @SqlQuery("SELECT support_escalate_payment_investigation(:id,:organizationId,:actorId,:reason,:reference,:description)") fun escalatePaymentInvestigation(@Bind("id") id:String,@Bind("organizationId") organizationId:String,@Bind("actorId") actorId:String,@Bind("reason") reason:String,@Bind("reference") reference:String?,@Bind("description") description:String?):String
    @SqlQuery("SELECT support_link_payment_exception(:id,:organizationId,:actorId,:exceptionId)") fun linkPaymentException(@Bind("id") id:String,@Bind("organizationId") organizationId:String,@Bind("actorId") actorId:String,@Bind("exceptionId") exceptionId:String):String
    @SqlQuery("SELECT support_payment_investigation_transition(:id,:organizationId,:actorId,:state,:reason)") fun transitionPaymentInvestigation(@Bind("id") id:String,@Bind("organizationId") organizationId:String,@Bind("actorId") actorId:String,@Bind("state") state:String,@Bind("reason") reason:String):Boolean
}
