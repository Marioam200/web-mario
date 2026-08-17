import { json } from '../_lib.js';
import { verificarPassword, crearCookieSesion, cabeceraCookieSesion, registrarLog } from '../_auth.js';

const MENSAJE_ERROR = 'Credenciales incorrectas';

export async function onRequestPost({ request, env }) {
	if (!env.DB) return json({ error: 'Falta el binding DB' }, 500);
	if (!env.SESSION_SECRET) return json({ error: 'Falta SESSION_SECRET' }, 500);

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Body no es JSON válido' }, 400);
	}

	const { email, password } = body || {};

	if (typeof email !== 'string' || typeof password !== 'string') {
		return json({ error: MENSAJE_ERROR }, 401);
	}

	try {
		const usuario = await env.DB.prepare('SELECT id, nombre, password_hash, password_salt FROM usuarios_panel WHERE email = ?')
			.bind(email)
			.first();

		const esValida = usuario ? await verificarPassword(password, usuario.password_hash, usuario.password_salt) : false;

		if (!usuario || !esValida) {
			await registrarLog(env, 'error', 'login', `Intento fallido: ${email}`);
			return json({ error: MENSAJE_ERROR }, 401);
		}

		await registrarLog(env, 'info', 'login', `Acceso correcto: ${email}`);

		const cookieSesion = await crearCookieSesion(usuario.id, env.SESSION_SECRET);

		return new Response(JSON.stringify({ nombre: usuario.nombre }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Set-Cookie': cabeceraCookieSesion(cookieSesion),
			},
		});
	} catch (error) {
		console.error('Error en el login del panel:', error);
		return json({ error: MENSAJE_ERROR }, 401);
	}
}

export async function onRequest() {
	return json({ error: 'Solo POST por ahora' }, 405);
}
