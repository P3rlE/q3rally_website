# Q3Rally web profiles

The Astro garage calls the same-origin PHP endpoint at /api/profile.php.
The existing Apache /api/ alias serves that endpoint. Keep the profile
database outside the site's DocumentRoot and its public aliases.

## Server preparation

Install the PHP 8.3 SQLite extension and msmtp. Create the private
database directory as the Apache user and run the initializer from the
website checkout.

```sh
sudo apt install msmtp
sudo install -d -o www-data -g www-data -m 0700 /var/lib/q3rally-profile
sudo -u www-data php /var/www/q3rally-site/profile-service/init-db.php /var/lib/q3rally-profile
```

Install the SMTP configuration from the template. Put the mailbox
password on one line in the private password file using sudoedit.
These commands prepare a new configuration. Preserve the existing
configuration and password on subsequent deployments.

```sh
sudo install -d -o root -g www-data -m 0750 /etc/q3rally-profile
sudo install -o root -g www-data -m 0640 /var/www/q3rally-site/profile-service/msmtprc.example /etc/q3rally-profile/msmtprc
sudo touch /etc/q3rally-profile/smtp-password
sudo chown root:www-data /etc/q3rally-profile/smtp-password
sudo chmod 0640 /etc/q3rally-profile/smtp-password
sudoedit /etc/q3rally-profile/smtp-password
```

The default public origin is https://www.q3rally.com. Set
Q3RALLY_PROFILE_ORIGIN to the exact origin for a separate test deployment.
The profile cookie requires HTTPS. The defaults for the private state
and mail configuration can be overridden with Q3RALLY_PROFILE_DIR and
Q3RALLY_SMTP_CONFIG.

## Smoke test

Build and serve the site over HTTPS. Visit /garage/ and create an account
with an inbox you control. Follow the confirmation link and enter the
registration password. Sign in, save a setup and sign out. Sign back in
to check that the saved setup is restored. The database is owned by
www-data. Include it in the server backup.

The browser session serves the website only. Game device linking is a
separate flow.
