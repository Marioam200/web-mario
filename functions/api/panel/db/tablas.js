import { json } from '../../_lib.js';
import { verificarSesion } from '../../_auth.js';

export async function onRequestGet({ request, env }) {
	const userId = await verificarSesion(request, env);
	if (!userId) return json({ error: 'No autenticado' }, 401);

	try {
		const { results } = await env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
		).all();

		const tablas = results.map((fila) => fila.name);
		return json({ tablas });
	} catch (error) {
		console.error('Error listando tablas de la base de datos:', error);
		return json({ error: 'No se pudo leer la base de datos' }, 500);
	}
}

export async function onRequest() {
	return json({ error: 'Solo GET por ahora' }, 405);
}
