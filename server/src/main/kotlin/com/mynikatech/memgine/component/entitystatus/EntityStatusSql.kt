package com.mynikatech.memgine.component.entitystatus

import org.jdbi.v3.sqlobject.statement.SqlQuery

interface EntityStatusSql {

    @SqlQuery(
        """
        SELECT get_entity_status_data()::text
        """
    )
    fun getEntityStatusData(): String
}