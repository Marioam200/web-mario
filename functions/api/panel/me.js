import { json } from '../_lib.js';
import { verificarSesion } from '../_auth.js';

export async function onRequestGet({ request, env }) {
	const userId = await verificarSesion(request, env);
	if (!userId) return json({ autenticado: false });

	try {
		const usuario = await env.DB.prepare('SELECT nombre FROM usuarios_panel WHERE id = ?').bind(userId).first();
		if (!usuario) return json({ autenticado: false });
		return json({ autenticado: true, nombre: usuario.nombre });
	} catch (error) {
		console.error('Error comprobando la sesión del panel:', error);
		return json({ autenticado: false });
	}
}

export async function onRequest() {
	return json({ error: 'Solo GET por ahora' }, 405);
}
