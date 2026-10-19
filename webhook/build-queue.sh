#!/bin/bash
# build-queue.sh — Führt Astro-Builds mit Queue durch
# Läuft im Hintergrund, gestartet von deploy.php
#
# Logik:
#   - flock verhindert parallele Builds (non-blocking: zweite Instanz beendet sich sofort)
#   - Solange das PENDING-Flag gesetzt ist, wird gebaut
#   - 3 Sekunden Delay damit Sanity alle Daten propagiert hat

LOCK_FILE="/tmp/q3rally-build.lock"
PENDING="/tmp/q3rally-build.pending"
PROJECT="/var/www/q3rally-site"
WEBROOT="/var/www/html/q3rally-new"
LOG="/var/log/q3rally-deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"
}

(
    # Non-blocking lock: wenn ein Build läuft, sofort beenden.
    # Die laufende Instanz sieht das PENDING-Flag und baut nochmal.
    flock -n 9 || { log "Build bereits aktiv — wird nach aktuellem Build nachgeholt"; exit 0; }

    log "Queue-Worker gestartet"

    while [ -f "$PENDING" ]; do
        # Flag löschen BEVOR der Build startet —
        # ein während des Builds eingehender Webhook setzt es neu
        rm -f "$PENDING"

        log "Warte 3s auf Sanity-Propagation..."
        sleep 3

        log "Build gestartet"
        cd "$PROJECT" && npm run build >> "$LOG" 2>&1

        if [ $? -eq 0 ]; then
            cp -r "$PROJECT/dist/"* "$WEBROOT/"
            log "Deploy abgeschlossen ✓"
        else
            log "Build FEHLGESCHLAGEN — dist nicht kopiert"
        fi
    done

    log "Queue-Worker beendet"

) 9>"$LOCK_FILE"

rm -f "$LOCK_FILE"
