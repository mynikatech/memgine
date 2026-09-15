package com.mynikatech.memgine.component.referencedata

import java.util.concurrent.atomic.AtomicReference

class ReferenceDataCache {

    private val snapshot =
        AtomicReference<ReferenceDataSnapshot?>(null)

    fun replace(value: ReferenceDataSnapshot) {
        snapshot.set(value)
    }

    fun get(): ReferenceDataSnapshot =
        snapshot.get()
            ?: error("Reference data cache has not been initialized")
}