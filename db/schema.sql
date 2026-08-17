CREATE TABLE IF NOT EXISTS eventos (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	visitante_id TEXT NOT NULL,
	tipo TEXT NOT NULL, -- 'vista_seccion' | 'vista_proyecto' | 'tiempo_atencion' | 'clic'
	seccion TEXT,
	proyecto TEXT,
	duracion_segundos INTEGER,
	idioma TEXT,
	dispositivo TEXT,
	pais TEXT,
	origen TEXT,
	creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_eventos_visitante ON eventos(visitante_id);

CREATE TABLE IF NOT EXISTS usuarios_panel (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	nombre TEXT NOT NULL,
	email TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	password_salt TEXT NOT NULL,
	creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs_sistema (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	nivel TEXT NOT NULL, -- 'info' | 'error'
	contexto TEXT NOT NULL, -- 'login' | 'chat' | 'guardar'
	mensaje TEXT NOT NULL,
	creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_creado ON logs_sistema(creado_en);
