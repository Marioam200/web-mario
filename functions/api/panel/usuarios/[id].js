import { json } from '../../_lib.js';
import { verificarSesion } from '../../_auth.js';

export async function onRequestDelete({ request, env, params }) {
	const userId = await verificarSesion(request, env);
	if (!userId) return json({ error: 'No autenticado' }, 401);

	const idABorrar = Number(params.id);
	if (!Number.isInteger(idABorrar)) return json({ error: 'Id no válido' }, 400);

	try {
		const { count } = await env.DB.prepare('SELECT COUNT(*) as count FROM usuarios_panel').first();
		if (count <= 1) {
			return json({ error: 'No puedes eliminar el único usuario que queda' }, 409);
		}

		const resultado = await env.DB.prepare('DELETE FROM usuarios_panel WHERE id = ?').bind(idABorrar).run();
		if (resultado.meta.changes === 0) {
			return json({ error: 'Ese usuario no existe' }, 404);
		}
		return new Response(null, { status: 204 });
	} catch (error) {
		console.error('Error eliminando usuario del panel:', error);
		return json({ error: 'No se pudo eliminar el usuario' }, 500);
	}
}

export async function onRequest() {
	return json({ error: 'Solo DELETE por ahora' }, 405);
}
