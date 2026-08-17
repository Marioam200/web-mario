import { json } from './_lib.js';

function leerCookie(request, nombre) {
	const cabecera = request.headers.get('Cookie');
	if (!cabecera) return null;

	const match = cabecera.match(new RegExp(`(?:^|;\\s*)${nombre}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : null;
}

function cabecerasBorrarCookies() {
	const headers = new Headers();
	headers.append('Set-Cookie', 'visitante_id=; Max-Age=0; Path=/; SameSite=Lax; Secure');
	headers.append('Set-Cookie', 'consentimiento_cookies=; Max-Age=0; Path=/; SameSite=Lax; Secure');
	return headers;
}

export async function onRequestPost({ request, env }) {
	if (!env.DB) {
		return json({ ok: false, error: 'Falta el binding DB' }, 500);
	}

	const visitanteId = leerCookie(request, 'visitante_id');

	if (visitanteId) {
		try {
			await env.DB.prepare('DELETE FROM eventos WHERE visitante_id = ?').bind(visitanteId).run();
		} catch (error) {
			console.error('No se pudieron borrar los eventos del visitante:', error);
			return json({ ok: false, error: 'No se pudo borrar de la base de datos' }, 500);
		}
	}

	return new Response(null, { status: 204, headers: cabecerasBorrarCookies() });
}

export async function onRequest() {
	return json({ ok: false, error: 'Solo POST por ahora' }, 405);
}
