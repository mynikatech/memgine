package com.mynikatech.memgine.component.entitystatus

import kotlinx.serialization.json.Json

class EntityStatusService(
    private val sql: EntityStatusSql,
    private val cache: EntityStatusCache,
    private val json: Json = Json {
        ignoreUnknownKeys = true
    }
) {

    fun get(): EntityStatusSnapshot =
        cache.get()

    fun refresh(): EntityStatusSnapshot {
        val raw = sql.getEntityStatusData()

        val newSnapshot =
            json.decodeFromString<EntityStatusSnapshot>(raw)

        cache.replace(newSnapshot)

        return newSnapshot
    }
}