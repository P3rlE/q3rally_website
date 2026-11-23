

CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    verified_at INTEGER
);

CREATE TABLE email_verifications (
    account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL
);

CREATE TABLE profiles (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE garage_setups (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vehicle TEXT NOT NULL,
    paint TEXT NOT NULL,
    wheels TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, vehicle)
);
