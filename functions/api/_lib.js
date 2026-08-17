export const API = 'https://api.github.com';

export function toB64(str) {
	const b = new TextEncoder().encode(str);
	let s = '';
	for (const x of b) s += String.fromCharCode(x);
	return btoa(s);
}

export function fromB64(b64) {
	const bin = atob(b64.replace(/\s/g, ''));
	const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

export function gh(env, path, init = {}) {
	return fetch(API + path, {
		...init,
		headers: {
			Authorization: `Bearer ${env.GITHUB_TOKEN}`,
			Accept: 'application/vnd.github+json',
			'User-Agent': 'web-mario-panel',
			...(init.headers || {}),
		},
	});
}

export function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * Lee src/data/<archivo> de GitHub en `ramaPreferida`, cayendo a "main" si esa
 * rama todavía no existe (404). Lanza si GitHub responde con cualquier otro error.
 * @returns {Promise<{ sha: string, contenido: any }>}
 */
export async function leerArchivoJson(env, archivo, ramaPreferida) {
	const repo = env.GITHUB_REPO;

	let response = await gh(env, `/repos/${repo}/contents/src/data/${archivo}?ref=${ramaPreferida}`);

	if (response.status === 404) {
		response = await gh(env, `/repos/${repo}/contents/src/data/${archivo}?ref=main`);
	}

	if (!response.ok) {
		throw new Error(`GitHub respondió ${response.status} ${response.statusText} al leer ${archivo}`);
	}

	const file = await response.json();
	const contenido = JSON.parse(fromB64(file.content));

	return { sha: file.sha, contenido };
}
