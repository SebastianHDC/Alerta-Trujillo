-- Alerta Trujillo - modulos del portal (usuarios y roles, base de conocimiento multimedia).
-- Requiere la migracion 20261110210000_alerta_trujillo_schema.sql.

SET search_path TO alerta_trujillo, public;

-- M2: funcion en el equipo y cuentas activas/desactivadas.
ALTER TABLE alerta_trujillo.accounts ADD COLUMN IF NOT EXISTS function VARCHAR(20);
ALTER TABLE alerta_trujillo.accounts ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE alerta_trujillo.accounts DROP CONSTRAINT IF EXISTS ck_accounts_function;
ALTER TABLE alerta_trujillo.accounts ADD CONSTRAINT ck_accounts_function CHECK (
	function IS NULL OR function IN ('coordinacion', 'conocimiento', 'participacion', 'validacion', 'desarrollo', 'analisis')
);

-- M3: nuevos tipos de recurso (documento, procedimiento, video) y archivos adjuntos o enlaces.
ALTER TABLE alerta_trujillo.knowledge_items ALTER COLUMN kind TYPE VARCHAR(20);
ALTER TABLE alerta_trujillo.knowledge_items ADD COLUMN IF NOT EXISTS resource_url VARCHAR(500);
ALTER TABLE alerta_trujillo.knowledge_items ADD COLUMN IF NOT EXISTS attachment VARCHAR(80);
ALTER TABLE alerta_trujillo.knowledge_items ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(80);
ALTER TABLE alerta_trujillo.knowledge_items ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(120);

ALTER TABLE alerta_trujillo.knowledge_items DROP CONSTRAINT IF EXISTS ck_knowledge_items_kind;
ALTER TABLE alerta_trujillo.knowledge_items ADD CONSTRAINT ck_knowledge_items_kind CHECK (
	kind IN ('documento', 'procedimiento', 'guia', 'manual', 'video', 'faq', 'leccion')
);
ALTER TABLE alerta_trujillo.knowledge_items DROP CONSTRAINT IF EXISTS ck_knowledge_items_resource_url;
ALTER TABLE alerta_trujillo.knowledge_items ADD CONSTRAINT ck_knowledge_items_resource_url CHECK (
	resource_url IS NULL OR resource_url LIKE 'https://%'
);

CREATE INDEX IF NOT EXISTS ix_knowledge_items_owner_id ON alerta_trujillo.knowledge_items (owner_id);
CREATE INDEX IF NOT EXISTS ix_reports_created_at ON alerta_trujillo.reports (created_at);
