-- KI-30: Log each import operation for audit trail
-- Creates ki_import_log if not exists, then inserts a record

CREATE TABLE IF NOT EXISTS ki_import_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    source TEXT NOT NULL,
    file_name TEXT,
    client_id INTEGER,
    imported_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ki_import_log (
    tenant_id, source, file_name, client_id,
    imported_count, skipped_count, error_count, details
)
VALUES (
    $tenant_id, $source, $file_name, $client_id,
    $imported_count, $skipped_count, $error_count, $details
);
