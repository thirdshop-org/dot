package com.vaultdrop.mobile.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class SyncPlacementTest {

    @Test
    fun confirmation_avec_copie_physique_promote_local_cloud() {
        assertEquals(SyncPlacement.LOCAL_CLOUD, SyncPlacement.confirmed(hasLocalUri = true))
    }

    @Test
    fun confirmation_sans_copie_physique_passe_a_cloud() {
        assertEquals(SyncPlacement.CLOUD, SyncPlacement.confirmed(hasLocalUri = false))
    }

    @Test
    fun confirmation_ne_revient_jamais_a_local() {
        for (hasUri in listOf(true, false)) {
            assertEquals(false, SyncPlacement.confirmed(hasUri) == SyncPlacement.LOCAL)
        }
    }
}