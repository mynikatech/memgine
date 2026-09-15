package com.mynikatech.memgine.component.referencedata

import org.jdbi.v3.sqlobject.statement.SqlQuery

interface ReferenceDataSql {

    @SqlQuery(
        """
        SELECT get_reference_data()::text
        """
    )
    fun getReferenceData(): String
}