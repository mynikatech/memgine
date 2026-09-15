package com.mynikatech.memgine.component.entitystatus

import java.util.concurrent.atomic.AtomicReference

class EntityStatusCache {

    private val snapshot =
        AtomicReference<EntityStatusSnapshot?>(null)

    fun replace(value: EntityStatusSnapshot) {
        snapshot.set(value)
    }

    fun get(): EntityStatusSnapshot =
        snapshot.get()
            ?: error("Entity status cache has not been initialized")
}