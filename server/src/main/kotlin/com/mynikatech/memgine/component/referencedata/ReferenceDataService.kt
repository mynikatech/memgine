package com.mynikatech.memgine.component.referencedata

import kotlinx.serialization.json.Json

class ReferenceDataService(
    private val sql: ReferenceDataSql,
    private val cache: ReferenceDataCache,
    private val json: Json = Json {
        ignoreUnknownKeys = true
    }
) {

    fun get(): ReferenceDataSnapshot =
        cache.get()

    fun refresh(): ReferenceDataSnapshot {
        val raw = sql.getReferenceData()

        val newSnapshot =
            json.decodeFromString<ReferenceDataSnapshot>(raw)

        cache.replace(newSnapshot)

        return newSnapshot
    }
}