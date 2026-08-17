import { json } from '../_lib.js';
import { verificarSesion } from '../_auth.js';

const LIMITE_FILAS = 200;

export async function onRequestGet({ request, env }) {
	const userId = await verificarSesion(request, env);
	if (!userId) return json({ error: 'No autenticado' }, 401);

	const url = new URL(request.url);
	const buscar = url.searchParams.get('buscar');

	try {
		let consulta;
		if (buscar && buscar.trim()) {
			const patron = `%${buscar.trim()}%`;
			consulta = env.DB.prepare(
				'SELECT nivel, contexto, mensaje, creado_en FROM logs_sistema WHERE mensaje LIKE ? OR contexto LIKE ? ORDER BY creado_en DESC LIMIT ?',
			).bind(patron, patron, LIMITE_FILAS);
		} else {
			consulta = env.DB.prepare('SELECT nivel, contexto, mensaje, creado_en FROM logs_sistema ORDER BY creado_en DESC LIMIT ?').bind(
				LIMITE_FILAS,
			);
		}

		const { results } = await consulta.all();
		const logs = results.map((fila) => ({
			nivel: fila.nivel,
			contexto: fila.contexto,
			mensaje: fila.mensaje,
			creadoEn: fila.creado_en,
		}));

		return json({ logs });
	} catch (error) {
		console.error('Error leyendo logs del panel:', error);
		return json({ error: 'No se pudo leer la base de datos' }, 500);
	}
}

export async function onRequest() {
	return json({ error: 'Solo GET por ahora' }, 405);
}
