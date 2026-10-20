#!/bin/bash
# build-queue.sh — Führt Astro-Builds mit Queue durch
# Läuft im Hintergrund, gestartet von deploy.php
#
# Logik:
#   - flock verhindert parallele Builds; wartende Worker prüfen danach das Pending-Flag
#   - Solange das PENDING-Flag gesetzt ist, wird gebaut
#   - 3 Sekunden Delay damit Sanity alle Daten propagiert hat

LOCK_FILE="/tmp/q3rally-build.lock"
PENDING="/tmp/q3rally-build.pending"
PROJECT="/var/www/q3rally-site"
LOG="/var/log/q3rally-deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"
}

(
    # Warten statt vorzeitig beenden: kein Pending-Flag am Worker-Ende verlieren.
    flock 9 || exit 1

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
            log "Deploy abgeschlossen ✓ — Website direkt in $PROJECT/dist aktualisiert"
        else
            log "Build FEHLGESCHLAGEN — siehe Ausgabe oben"
        fi
    done

    log "Queue-Worker beendet"

) 9>"$LOCK_FILE"

# Lock-Datei behalten: alle Worker müssen dieselbe Datei (denselben Inode) sperren.
