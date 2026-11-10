-- Alerta Trujillo production schema - private to the FastAPI backend.

-- Emergency contact references: https://www.gob.pe/547-telefonos-de-emergencia

CREATE SCHEMA IF NOT EXISTS alerta_trujillo;

SET search_path TO alerta_trujillo, public;

CREATE TABLE IF NOT EXISTS accounts (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(40) NOT NULL, 
	email VARCHAR(254) NOT NULL, 
	password_hash TEXT NOT NULL, 
	role VARCHAR(12) NOT NULL, 
	district VARCHAR(40), 
	document_type VARCHAR(10), 
	document_hash VARCHAR(64), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (role IN ('citizen', 'moderator', 'manager')), 
	CHECK (document_type IS NULL OR document_type IN ('dni', 'pasaporte', 'ce')), 
	UNIQUE (email), 
	UNIQUE (document_hash)
);

CREATE TABLE IF NOT EXISTS contacts (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(80) NOT NULL, 
	description VARCHAR(160) NOT NULL, 
	phone VARCHAR(20) NOT NULL, 
	kind VARCHAR(12) NOT NULL, 
	position INTEGER NOT NULL, 
	verified_at DATE, 
	updated_by VARCHAR(36), 
	PRIMARY KEY (id), 
	FOREIGN KEY(updated_by) REFERENCES accounts (id)
);

CREATE TABLE IF NOT EXISTS login_sessions (
	token_hash VARCHAR(64) NOT NULL, 
	account_id VARCHAR(36) NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (token_hash), 
	FOREIGN KEY(account_id) REFERENCES accounts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
	id VARCHAR(36) NOT NULL, 
	author_id VARCHAR(36) NOT NULL, 
	category VARCHAR(20) NOT NULL, 
	district VARCHAR(40) NOT NULL, 
	location VARCHAR(120) NOT NULL, 
	description VARCHAR(300) NOT NULL, 
	latitude FLOAT NOT NULL, 
	longitude FLOAT NOT NULL, 
	occurred_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	status VARCHAR(12) NOT NULL, 
	risk VARCHAR(8), 
	public_summary VARCHAR(200), 
	show_photo BOOLEAN NOT NULL, 
	published_at TIMESTAMP WITH TIME ZONE, 
	decided_at TIMESTAMP WITH TIME ZONE, 
	sample BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (status IN ('pending', 'rejected', 'community', 'verified', 'discarded')), 
	CHECK (risk IN ('low', 'medium', 'high')), 
	CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180), 
	FOREIGN KEY(author_id) REFERENCES accounts (id)
);

CREATE TABLE IF NOT EXISTS knowledge_items (
	id VARCHAR(36) NOT NULL, 
	title VARCHAR(120) NOT NULL, 
	category VARCHAR(20) NOT NULL, 
	kind VARCHAR(10) NOT NULL, 
	audience VARCHAR(10) NOT NULL, 
	body TEXT NOT NULL, 
	problem TEXT, 
	action TEXT, 
	result TEXT, 
	limits TEXT, 
	report_id VARCHAR(36), 
	owner_id VARCHAR(36) NOT NULL, 
	backup_id VARCHAR(36), 
	status VARCHAR(10) NOT NULL, 
	version INTEGER NOT NULL, 
	review_due DATE, 
	last_editor_id VARCHAR(36) NOT NULL, 
	approved_by VARCHAR(36), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (status IN ('draft', 'review', 'current', 'obsolete')), 
	CHECK (audience IN ('public', 'internal')), 
	FOREIGN KEY(report_id) REFERENCES reports (id) ON DELETE SET NULL, 
	FOREIGN KEY(owner_id) REFERENCES accounts (id), 
	FOREIGN KEY(backup_id) REFERENCES accounts (id), 
	FOREIGN KEY(last_editor_id) REFERENCES accounts (id), 
	FOREIGN KEY(approved_by) REFERENCES accounts (id)
);

CREATE TABLE IF NOT EXISTS notifications (
	id VARCHAR(36) NOT NULL, 
	account_id VARCHAR(36) NOT NULL, 
	kind VARCHAR(20) NOT NULL, 
	text VARCHAR(200) NOT NULL, 
	report_id VARCHAR(36), 
	read BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(account_id) REFERENCES accounts (id) ON DELETE CASCADE, 
	FOREIGN KEY(report_id) REFERENCES reports (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS report_evidence (
	id VARCHAR(36) NOT NULL, 
	report_id VARCHAR(36) NOT NULL, 
	kind VARCHAR(8) NOT NULL, 
	stored_name VARCHAR(80) NOT NULL, 
	content_type VARCHAR(40) NOT NULL, 
	size INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (kind IN ('photo', 'video')), 
	FOREIGN KEY(report_id) REFERENCES reports (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report_votes (
	report_id VARCHAR(36) NOT NULL, 
	account_id VARCHAR(36) NOT NULL, 
	answer VARCHAR(8) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (report_id, account_id), 
	CHECK (answer IN ('yes', 'no', 'unsure')), 
	FOREIGN KEY(report_id) REFERENCES reports (id), 
	FOREIGN KEY(account_id) REFERENCES accounts (id)
);

CREATE TABLE IF NOT EXISTS knowledge_uses (
	id VARCHAR(36) NOT NULL, 
	item_id VARCHAR(36) NOT NULL, 
	account_id VARCHAR(36) NOT NULL, 
	report_id VARCHAR(36), 
	version INTEGER NOT NULL, 
	useful BOOLEAN NOT NULL, 
	note VARCHAR(300) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(item_id) REFERENCES knowledge_items (id) ON DELETE CASCADE, 
	FOREIGN KEY(account_id) REFERENCES accounts (id), 
	FOREIGN KEY(report_id) REFERENCES reports (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS knowledge_versions (
	id VARCHAR(36) NOT NULL, 
	item_id VARCHAR(36) NOT NULL, 
	version INTEGER NOT NULL, 
	snapshot JSON NOT NULL, 
	change_note VARCHAR(200) NOT NULL, 
	editor_id VARCHAR(36) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (item_id, version), 
	FOREIGN KEY(item_id) REFERENCES knowledge_items (id) ON DELETE CASCADE, 
	FOREIGN KEY(editor_id) REFERENCES accounts (id)
);

CREATE TABLE IF NOT EXISTS report_reviews (
	id VARCHAR(36) NOT NULL, 
	report_id VARCHAR(36) NOT NULL, 
	reviewer_id VARCHAR(36) NOT NULL, 
	stage VARCHAR(10) NOT NULL, 
	decision VARCHAR(12) NOT NULL, 
	note VARCHAR(300) NOT NULL, 
	checklist JSON NOT NULL, 
	knowledge_item_id VARCHAR(36), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (stage IN ('screening', 'final')), 
	FOREIGN KEY(report_id) REFERENCES reports (id), 
	FOREIGN KEY(reviewer_id) REFERENCES accounts (id), 
	FOREIGN KEY(knowledge_item_id) REFERENCES knowledge_items (id)
);

CREATE INDEX IF NOT EXISTS ix_login_sessions_account_id ON login_sessions (account_id);

CREATE INDEX IF NOT EXISTS ix_login_sessions_expires_at ON login_sessions (expires_at);

CREATE INDEX IF NOT EXISTS ix_reports_author_id ON reports (author_id);

CREATE INDEX IF NOT EXISTS ix_reports_occurred_at ON reports (occurred_at);

CREATE INDEX IF NOT EXISTS ix_reports_status ON reports (status);

CREATE INDEX IF NOT EXISTS ix_notifications_account_id ON notifications (account_id);

CREATE INDEX IF NOT EXISTS ix_report_evidence_report_id ON report_evidence (report_id);

CREATE INDEX IF NOT EXISTS ix_knowledge_uses_item_id ON knowledge_uses (item_id);

CREATE INDEX IF NOT EXISTS ix_knowledge_versions_item_id ON knowledge_versions (item_id);

CREATE INDEX IF NOT EXISTS ix_report_reviews_report_id ON report_reviews (report_id);

ALTER TABLE alerta_trujillo.accounts ADD COLUMN IF NOT EXISTS district VARCHAR(40);

ALTER TABLE alerta_trujillo.accounts ADD COLUMN IF NOT EXISTS document_type VARCHAR(10);

ALTER TABLE alerta_trujillo.accounts ADD COLUMN IF NOT EXISTS document_hash VARCHAR(64);

ALTER TABLE alerta_trujillo.accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE alerta_trujillo.accounts SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;

ALTER TABLE alerta_trujillo.accounts ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE alerta_trujillo.accounts ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE alerta_trujillo.accounts DROP CONSTRAINT IF EXISTS ck_accounts_role;

ALTER TABLE alerta_trujillo.accounts ADD CONSTRAINT ck_accounts_role CHECK (role IN ('citizen', 'moderator', 'manager'));

ALTER TABLE alerta_trujillo.accounts DROP CONSTRAINT IF EXISTS ck_accounts_document_type;

ALTER TABLE alerta_trujillo.accounts ADD CONSTRAINT ck_accounts_document_type CHECK (document_type IS NULL OR document_type IN ('dni', 'pasaporte', 'ce'));

CREATE UNIQUE INDEX IF NOT EXISTS accounts_document_hash_key ON alerta_trujillo.accounts (document_hash);

ALTER TABLE alerta_trujillo.reports ADD COLUMN IF NOT EXISTS show_photo BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE alerta_trujillo.reports ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE alerta_trujillo.reports ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

ALTER TABLE alerta_trujillo.reports DROP CONSTRAINT IF EXISTS ck_reports_status;

UPDATE alerta_trujillo.reports SET status = 'community' WHERE status = 'published';

ALTER TABLE alerta_trujillo.reports ADD CONSTRAINT ck_reports_status CHECK (status IN ('pending', 'rejected', 'community', 'verified', 'discarded'));

UPDATE alerta_trujillo.reports SET published_at = created_at WHERE published_at IS NULL AND status IN ('community', 'verified', 'discarded');

UPDATE alerta_trujillo.reports SET decided_at = created_at WHERE decided_at IS NULL AND status IN ('rejected', 'verified', 'discarded');

ALTER TABLE alerta_trujillo.reports ALTER COLUMN description TYPE VARCHAR(300);

ALTER TABLE alerta_trujillo.report_votes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE alerta_trujillo.report_votes SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;

ALTER TABLE alerta_trujillo.report_votes ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE alerta_trujillo.report_votes ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE alerta_trujillo.report_reviews ADD COLUMN IF NOT EXISTS id VARCHAR(36);

UPDATE alerta_trujillo.report_reviews SET id = gen_random_uuid()::text WHERE id IS NULL;

ALTER TABLE alerta_trujillo.report_reviews ALTER COLUMN id SET NOT NULL;

ALTER TABLE alerta_trujillo.report_reviews ADD COLUMN IF NOT EXISTS stage VARCHAR(10);

UPDATE alerta_trujillo.report_reviews SET stage = CASE WHEN decision IN ('verified', 'discarded') THEN 'final' ELSE 'screening' END WHERE stage IS NULL;

ALTER TABLE alerta_trujillo.report_reviews ALTER COLUMN stage SET NOT NULL;

ALTER TABLE alerta_trujillo.report_reviews ADD COLUMN IF NOT EXISTS checklist JSON;

UPDATE alerta_trujillo.report_reviews SET checklist = '[]'::json WHERE checklist IS NULL;

ALTER TABLE alerta_trujillo.report_reviews ALTER COLUMN checklist SET NOT NULL;

ALTER TABLE alerta_trujillo.report_reviews ALTER COLUMN checklist SET DEFAULT '[]'::json;

ALTER TABLE alerta_trujillo.report_reviews ADD COLUMN IF NOT EXISTS knowledge_item_id VARCHAR(36);

UPDATE alerta_trujillo.report_reviews SET decision = CASE decision WHEN 'published' THEN 'publish' WHEN 'rejected' THEN 'reject' ELSE decision END WHERE decision IN ('published', 'rejected');

ALTER TABLE alerta_trujillo.report_reviews DROP CONSTRAINT IF EXISTS report_reviews_pkey;

ALTER TABLE alerta_trujillo.report_reviews ADD CONSTRAINT report_reviews_pkey PRIMARY KEY (id);

ALTER TABLE alerta_trujillo.report_reviews DROP CONSTRAINT IF EXISTS ck_report_reviews_stage;

ALTER TABLE alerta_trujillo.report_reviews ADD CONSTRAINT ck_report_reviews_stage CHECK (stage IN ('screening', 'final'));

ALTER TABLE alerta_trujillo.report_reviews DROP CONSTRAINT IF EXISTS report_reviews_knowledge_item_id_fkey;

ALTER TABLE alerta_trujillo.report_reviews ADD CONSTRAINT report_reviews_knowledge_item_id_fkey FOREIGN KEY (knowledge_item_id) REFERENCES alerta_trujillo.knowledge_items (id);

CREATE INDEX IF NOT EXISTS ix_report_reviews_report_id ON alerta_trujillo.report_reviews (report_id);

ALTER TABLE alerta_trujillo.accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE alerta_trujillo.contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE alerta_trujillo.login_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE alerta_trujillo.reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE alerta_trujillo.knowledge_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE alerta_trujillo.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE alerta_trujillo.report_evidence ENABLE ROW LEVEL SECURITY;

ALTER TABLE alerta_trujillo.report_votes ENABLE ROW LEVEL SECURITY;

ALTER TABLE alerta_trujillo.knowledge_uses ENABLE ROW LEVEL SECURITY;

ALTER TABLE alerta_trujillo.knowledge_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE alerta_trujillo.report_reviews ENABLE ROW LEVEL SECURITY;

INSERT INTO alerta_trujillo.contacts (id, name, description, phone, kind, position, verified_at, updated_by) SELECT '00000000-0000-4000-8000-000000000105', 'PNP - Central de emergencias', 'Policia Nacional del Peru.', '105', 'police', 0, CURRENT_DATE, NULL WHERE NOT EXISTS (SELECT 1 FROM alerta_trujillo.contacts WHERE phone = '105' AND kind = 'police') ON CONFLICT (id) DO NOTHING;

INSERT INTO alerta_trujillo.contacts (id, name, description, phone, kind, position, verified_at, updated_by) SELECT '00000000-0000-4000-8000-000000000116', 'Bomberos', 'Cuerpo General de Bomberos Voluntarios del Peru.', '116', 'fire', 1, CURRENT_DATE, NULL WHERE NOT EXISTS (SELECT 1 FROM alerta_trujillo.contacts WHERE phone = '116' AND kind = 'fire') ON CONFLICT (id) DO NOTHING;

INSERT INTO alerta_trujillo.contacts (id, name, description, phone, kind, position, verified_at, updated_by) SELECT '00000000-0000-4000-8000-000000000106', 'SAMU - Ambulancia', 'Sistema de Atencion Medica Movil de Urgencia.', '106', 'health', 2, CURRENT_DATE, NULL WHERE NOT EXISTS (SELECT 1 FROM alerta_trujillo.contacts WHERE phone = '106' AND kind = 'health') ON CONFLICT (id) DO NOTHING;

RESET search_path;