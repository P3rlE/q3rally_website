CREATE TABLE profile_devices (
    token_hash TEXT PRIMARY KEY NOT NULL,
    code TEXT UNIQUE,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
