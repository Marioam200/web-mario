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
