package com.vaultdrop.mobile.domain

/**
 * Règle de placement d'une ressource (`sync_status`), partagée entre files et
 * folders. Placement = présence device / serveur, pas un marqueur de push.
 *
 * - `local` : copie physique SAF uniquement, pas encore connue du serveur.
 * - `cloud` : connue du serveur uniquement (pas de copie physique, uri NULL).
 * - `local-cloud` : copie physique **et** connue du serveur.
 */
object SyncPlacement {

    const val LOCAL = "local"
    const val CLOUD = "cloud"
    const val LOCAL_CLOUD = "local-cloud"

    /**
     * Placement d'une ressource après confirmation serveur (snapshot `GET /files`
     * ou op outbox `create_resource`/`move_resource` appliquée) : `local-cloud`
     * si une copie physique existe encore, sinon `cloud`.
     */
    fun confirmed(hasLocalUri: Boolean): String =
        if (hasLocalUri) LOCAL_CLOUD else CLOUD
}