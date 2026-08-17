import { json } from './_lib.js';

const IDIOMAS_VALIDOS = new Set(['es', 'en']);
const DISPOSITIVOS_VALIDOS = new Set(['movil', 'escritorio']);

function esEventoValido(evento) {
	return (
		evento &&
		typeof evento === 'object' &&
		typeof evento.tipo === 'string' &&
		evento.tipo.trim() !== '' &&
		(evento.seccion === undefined || typeof evento.seccion === 'string') &&
		(evento.proyecto === undefined || typeof evento.proyecto === 'string') &&
		(evento.duracionSegundos === undefined || typeof evento.duracionSegundos === 'number')
	);
}

function esBodyValido(body) {
	return (
		body &&
		typeof body === 'object' &&
		typeof body.visitanteId === 'string' &&
		body.visitanteId.trim() !== '' &&
		IDIOMAS_VALIDOS.has(body.idioma) &&
		DISPOSITIVOS_VALIDOS.has(body.dispositivo) &&
		Array.isArray(body.eventos) &&
		body.eventos.length > 0 &&
		body.eventos.every(esEventoValido)
	);
}

export async function onRequestPost({ request, env }) {
	if (!env.DB) {
		return json({ ok: false, error: 'Falta el binding DB' }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Body no es JSON válido' }, 400);
	}

	if (!esBodyValido(body)) {
		return json({ ok: false, error: 'Formato de body inesperado' }, 400);
	}

	const { visitanteId, idioma, dispositivo, eventos } = body;

	const pais = request.cf?.country ?? null;
	const origen = request.headers.get('Referer');

	const insertar = env.DB.prepare(
		`INSERT INTO eventos (visitante_id, tipo, seccion, proyecto, duracion_segundos, idioma, dispositivo, pais, origen)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	);

	try {
		for (const evento of eventos) {
			await insertar
				.bind(
					visitanteId,
					evento.tipo,
					evento.seccion ?? null,
					evento.proyecto ?? null,
					evento.duracionSegundos ?? null,
					idioma,
					dispositivo,
					pais,
					origen,
				)
				.run();
		}
	} catch (error) {
		console.error('No se pudieron guardar los eventos de analítica:', error);
		return json({ ok: false, error: 'No se pudo guardar en la base de datos' }, 500);
	}

	return new Response(null, { status: 204 });
}

export async function onRequest() {
	return json({ ok: false, error: 'Solo POST por ahora' }, 405);
}
