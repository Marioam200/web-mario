import { json } from '../../_lib.js';
import { verificarSesion, registrarLog } from '../../_auth.js';

const PALABRAS_ESCRITURA = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate'];

export async function onRequestPost({ request, env }) {
	const userId = await verificarSesion(request, env);
	if (!userId) return json({ error: 'No autenticado' }, 401);

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Body no es JSON válido' }, 400);
	}

	const { sql } = body || {};

	if (typeof sql !== 'string' || !sql.trim()) {
		return json({ error: 'Falta el SQL' }, 400);
	}

	const sqlNormalizado = sql.trim().toLowerCase();

	try {
		const { results, meta } = await env.DB.prepare(sql).all();

		const columnas = results.length > 0 ? Object.keys(results[0]) : [];

		if (PALABRAS_ESCRITURA.some((palabra) => sqlNormalizado.startsWith(palabra))) {
			await registrarLog(env, 'info', 'sql', `Ejecutado: ${sql.slice(0, 300)}`);
		}

		return json({
			columnas,
			filas: results,
			meta: {
				cambios: meta.changes ?? 0,
				filas: results.length,
				duracionMs: meta.duration ?? null,
			},
		});
	} catch (error) {
		await registrarLog(env, 'error', 'sql', error.message);
		return json({ error: error.message }, 400);
	}
}

export async function onRequest() {
	return json({ error: 'Solo POST por ahora' }, 405);
}
