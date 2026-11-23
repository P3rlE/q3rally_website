CREATE TABLE request_limits (
    bucket TEXT PRIMARY KEY NOT NULL,
    attempts INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
