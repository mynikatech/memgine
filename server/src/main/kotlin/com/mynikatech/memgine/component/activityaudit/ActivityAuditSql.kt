package com.mynikatech.memgine.component.activityaudit

import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlUpdate
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface ActivityAuditSql {
    @SqlQuery("SELECT EXISTS(SELECT 1 FROM organization WHERE organization_id = :organizationId AND is_deleted = false)")
    fun organizationExists(@Bind("organizationId") organizationId: String): Boolean

    @SqlUpdate("""
        INSERT INTO activity_audit_events (
            id, event_type, actor_user_id, actor_role, organization_id, store_id, staff_id,
            customer_user_id, membership_product_id, subscription_id, transaction_id,
            platform, source, metadata, deduplication_key
        ) VALUES (
            :id, :eventType, :actorUserId, :actorRole, :organizationId, :storeId, :staffId,
            :customerUserId, :membershipProductId, :subscriptionId, :transactionId,
            :platform, :source, CAST(:metadata AS jsonb), :deduplicationKey
        ) ON CONFLICT (deduplication_key) WHERE deduplication_key IS NOT NULL DO NOTHING
    """)
    fun insert(
        @Bind("id") id: String,
        @Bind("eventType") eventType: String,
        @Bind("actorUserId") actorUserId: String?,
        @Bind("actorRole") actorRole: String?,
        @Bind("organizationId") organizationId: String?,
        @Bind("storeId") storeId: String?,
        @Bind("staffId") staffId: String?,
        @Bind("customerUserId") customerUserId: String?,
        @Bind("membershipProductId") membershipProductId: String?,
        @Bind("subscriptionId") subscriptionId: String?,
        @Bind("transactionId") transactionId: String?,
        @Bind("platform") platform: String,
        @Bind("source") source: String,
        @Bind("metadata") metadata: String,
        @Bind("deduplicationKey") deduplicationKey: String?
    ): Int
}
