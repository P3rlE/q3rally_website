# Q3Rally — Setup Guide

## 1. Sanity-Konto erstellen
1. Gehe zu https://sanity.io und erstelle ein kostenloses Konto
2. Neues Projekt anlegen: "Q3Rally"
3. Dataset: "production"
4. Notiere dir die **Project ID** (sieht aus wie: `abc12345`)

## 2. Node.js auf dem Server installieren
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # sollte v20.x zeigen
```

## 3. Projekt auf den Server kopieren
```bash
# Auf deinem lokalen Rechner:
scp -r q3rally-site/ user@dein-server:/var/www/q3rally-site

# Auf dem Server:
cd /var/www/q3rally-site
npm install
```

## 4. .env Datei anlegen
```bash
cp .env.example .env
nano .env
# Trage deine Sanity Project ID und den API Token ein
```

Den API Token findest du unter: https://sanity.io/manage → dein Projekt → API → Tokens
→ "Add API token" → Name: "Astro Build" → Permissions: "Viewer"

## 5. Ersten Build testen
```bash
npm run build
# Erzeugt den dist/ Ordner mit der fertigen Website
```

## 6. Apache konfigurieren
```apache
# /etc/apache2/sites-available/q3rally.conf
<VirtualHost *:80>
    ServerName www.q3rally.com
    ServerAlias q3rally.com
    DocumentRoot /var/www/q3rally-site/dist

    <Directory /var/www/q3rally-site/dist>
        Options -Indexes
        AllowOverride All
        Require all granted
    </Directory>

    # Webhook PHP separat erreichbar
    Alias /webhook /var/www/q3rally-site/webhook
    <Directory /var/www/q3rally-site/webhook>
        Options -Indexes
        AllowOverride None
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/q3rally-error.log
    CustomLog ${APACHE_LOG_DIR}/q3rally-access.log combined
</VirtualHost>
```

```bash
sudo a2ensite q3rally
sudo a2enmod rewrite
sudo systemctl reload apache2
```

## 7. Sanity Webhook einrichten
1. https://sanity.io/manage → dein Projekt → API → Webhooks
2. "Add webhook":
   - URL: `https://www.q3rally.com/webhook/deploy.php`
   - Trigger on: Publish, Unpublish
   - Secret: (selbst ausgedacht, muss in .env als SANITY_WEBHOOK_SECRET stehen)

## 8. Sanity Studio starten (lokal auf deinem PC)
```bash
cd /var/www/q3rally-site/sanity
npm install
npm run dev
# Studio öffnet sich unter http://localhost:3333
```

Das Studio läuft lokal — Inhalte werden in Sanity Cloud gespeichert,
der Webhook löst dann automatisch einen Rebuild auf dem Server aus.

## Täglicher Workflow
1. Studio öffnen (lokal oder über sanity.io)
2. Neues Auto / Map / News anlegen
3. "Publish" klicken
4. Nach ~30 Sekunden ist die Website aktualisiert ✓
