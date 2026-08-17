import { json } from '../_lib.js';

export async function onRequestPost() {
	const headers = new Headers();
	headers.append('Set-Cookie', 'sesion_panel=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
	return new Response(null, { status: 204, headers });
}

export async function onRequest() {
	return json({ error: 'Solo POST por ahora' }, 405);
}
