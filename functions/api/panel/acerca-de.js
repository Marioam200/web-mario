import { json } from '../_lib.js';
import { verificarSesion } from '../_auth.js';

export async function onRequestGet({ request, env }) {
	const userId = await verificarSesion(request, env);
	if (!userId) return json({ error: 'No autenticado' }, 401);

	return json({
		nombre: 'Panel — Mario Álvarez',
		framework: 'Astro 7.2.1',
		entorno: 'Producción (Cloudflare Pages)',
		url: env.CF_PAGES_URL ?? 'marioalvarez.me',
		baseDatos: 'Cloudflare D1 (web-mario-analitica)',
		repo: `https://github.com/${env.GITHUB_REPO}`,
		commit: env.CF_PAGES_COMMIT_SHA ? env.CF_PAGES_COMMIT_SHA.slice(0, 7) : null,
		rama: env.CF_PAGES_BRANCH ?? null,
	});
}

export async function onRequest() {
	return json({ error: 'Solo GET por ahora' }, 405);
}
