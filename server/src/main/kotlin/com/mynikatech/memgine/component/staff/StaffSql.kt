package com.mynikatech.memgine.component.staff

import com.mynikatech.memgine.net.dto.StaffDto
import com.mynikatech.memgine.net.dto.StaffStoreAssignmentDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface StaffSql {
    @SqlQuery("SELECT * FROM get_organization_staff(:organizationId)")
    fun list(
        @Bind("organizationId") organizationId: String
    ): List<StaffDto>

    @SqlQuery(
        "SELECT * FROM get_organization_staff_member(:organizationId, :staffId)"
    )
    fun get(
        @Bind("organizationId") organizationId: String,
        @Bind("staffId") staffId: String
    ): StaffDto?

    @SqlQuery("""
        SELECT *
        FROM create_staff(
            :organizationId,
            :staffId,
            :organizationUserId,
            :staffCode,
            :roleCode,
            :designation,
            :storeId,
            CAST(:joiningDate AS date),
            CAST(:relievingDate AS date),
            :staffStatusId,
            :actorUserId
        )
    """)
    fun create(
        @Bind("organizationId") organizationId: String,
        @Bind("staffId") staffId: String,
        @Bind("organizationUserId") organizationUserId: String,
        @Bind("staffCode") staffCode: String,
        @Bind("roleCode") roleCode: String,
        @Bind("designation") designation: String?,
        @Bind("storeId") storeId: String?,
        @Bind("joiningDate") joiningDate: String,
        @Bind("relievingDate") relievingDate: String?,
        @Bind("staffStatusId") staffStatusId: String,
        @Bind("actorUserId") actorUserId: String
    ): StaffDto

    @SqlQuery("""
        SELECT *
        FROM update_staff(
            :organizationId,
            :staffId,
            :staffCode,
            :roleCode,
            :designation,
            :storeId,
            CAST(:joiningDate AS date),
            CAST(:relievingDate AS date),
            :staffStatusId,
            :actorUserId
        )
    """)
    fun update(
        @Bind("organizationId") organizationId: String,
        @Bind("staffId") staffId: String,
        @Bind("staffCode") staffCode: String,
        @Bind("roleCode") roleCode: String,
        @Bind("designation") designation: String?,
        @Bind("storeId") storeId: String?,
        @Bind("joiningDate") joiningDate: String,
        @Bind("relievingDate") relievingDate: String?,
        @Bind("staffStatusId") staffStatusId: String,
        @Bind("actorUserId") actorUserId: String
    ): StaffDto

    @SqlQuery(
        "SELECT delete_staff(:organizationId, :staffId, :actorUserId)"
    )
    fun delete(
        @Bind("organizationId") organizationId: String,
        @Bind("staffId") staffId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery(
        "SELECT * FROM get_staff_store_assignments(:organizationId)"
    )
    fun listAssignments(
        @Bind("organizationId") organizationId: String
    ): List<StaffStoreAssignmentDto>

    @SqlQuery("""
        SELECT
            a.staff_store_assignment_id AS id,
            :organizationId AS organization_id,
            a.staff_id,
            a.store_id,
            a.status_id AS assignment_status_id,
            a.effective_date::text AS effective_date,
            a.end_date::text AS end_date,
            a.created_at::text AS created_at,
            a.created_by,
            a.updated_at::text AS updated_at,
            a.updated_by,
            a.is_deleted,
            a.version_no
        FROM create_staff_store_assignment(
            :organizationId,
            :assignmentId,
            :staffId,
            :storeId,
            :assignmentStatusId,
            CAST(:effectiveDate AS date),
            CAST(:endDate AS date),
            :actorUserId
        ) a
    """)
    fun createAssignment(
        @Bind("organizationId") organizationId: String,
        @Bind("assignmentId") assignmentId: String,
        @Bind("staffId") staffId: String,
        @Bind("storeId") storeId: String,
        @Bind("assignmentStatusId") assignmentStatusId: String,
        @Bind("effectiveDate") effectiveDate: String,
        @Bind("endDate") endDate: String?,
        @Bind("actorUserId") actorUserId: String
    ): StaffStoreAssignmentDto

    @SqlQuery("""
        SELECT
            a.staff_store_assignment_id AS id,
            :organizationId AS organization_id,
            a.staff_id,
            a.store_id,
            a.status_id AS assignment_status_id,
            a.effective_date::text AS effective_date,
            a.end_date::text AS end_date,
            a.created_at::text AS created_at,
            a.created_by,
            a.updated_at::text AS updated_at,
            a.updated_by,
            a.is_deleted,
            a.version_no
        FROM update_staff_store_assignment(
            :organizationId,
            :assignmentId,
            :storeId,
            :assignmentStatusId,
            CAST(:effectiveDate AS date),
            CAST(:endDate AS date),
            :actorUserId
        ) a
    """)
    fun updateAssignment(
        @Bind("organizationId") organizationId: String,
        @Bind("assignmentId") assignmentId: String,
        @Bind("storeId") storeId: String,
        @Bind("assignmentStatusId") assignmentStatusId: String,
        @Bind("effectiveDate") effectiveDate: String,
        @Bind("endDate") endDate: String?,
        @Bind("actorUserId") actorUserId: String
    ): StaffStoreAssignmentDto

    @SqlQuery("""
        SELECT delete_staff_store_assignment(
            :organizationId,
            :assignmentId,
            :actorUserId
        )
    """)
    fun deleteAssignment(
        @Bind("organizationId") organizationId: String,
        @Bind("assignmentId") assignmentId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean
}