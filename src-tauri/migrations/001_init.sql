-- 个人词典
CREATE TABLE IF NOT EXISTS dictionary (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    word          TEXT NOT NULL UNIQUE,
    pronunciation TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    usage_count   INTEGER DEFAULT 0
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_dictionary_word ON dictionary(word);

-- 简单纠错规则
CREATE TABLE IF NOT EXISTS correction_rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern     TEXT NOT NULL,
    replacement TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
