const API = 'https://api.github.com';
const ARCHIVO_PRUEBA = 'experiencia.json';
const PERMITIDOS = ['experiencia.json', 'sobre-mi.json', 'inicio.json'];

function toB64(str) {
	const b = new TextEncoder().encode(str);
	let s = '';
	for (const x of b) s += String.fromCharCode(x);
	return btoa(s);
}

function fromB64(b64) {
	const bin = atob(b64.replace(/\s/g, ''));
	const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

function gh(env, path, init = {}) {
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

function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export async function onRequestGet({ env }) {
	const token = env.GITHUB_TOKEN;
	const repo = env.GITHUB_REPO;
	const rama = env.GITHUB_BRANCH || 'panel-test';

	if (!token) {
		return json({ ok: false, error: 'Falta GITHUB_TOKEN' }, 500);
	}

	try {
		let response = await gh(env, `/repos/${repo}/contents/src/data/${ARCHIVO_PRUEBA}?ref=${rama}`);

		if (response.status === 404) {
			response = await gh(env, `/repos/${repo}/contents/src/data/${ARCHIVO_PRUEBA}?ref=main`);
		}

		if (!response.ok) {
			return json(
				{ ok: false, error: `GitHub respondió ${response.status} ${response.statusText}` },
				response.status,
			);
		}

		const file = await response.json();
		const contenido = JSON.parse(fromB64(file.content));

		return json({ ok: true, sha: file.sha, contenido });
	} catch (error) {
		return json({ ok: false, error: 'No se pudo contactar con GitHub' }, 500);
	}
}

export async function onRequestPost({ request, env }) {
	const token = env.GITHUB_TOKEN;
	const repo = env.GITHUB_REPO;
	const rama = env.GITHUB_BRANCH || 'panel-test';

	if (!token) {
		return json({ ok: false, error: 'Falta GITHUB_TOKEN' }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Body no es JSON válido' }, 400);
	}

	const { archivo, contenido } = body || {};

	if (!PERMITIDOS.includes(archivo)) {
		return json({ ok: false, error: 'archivo no permitido' }, 400);
	}

	if (typeof contenido !== 'object' || contenido === null || Array.isArray(contenido)) {
		return json({ ok: false, error: 'contenido no es un objeto' }, 400);
	}

	try {
		const refResponse = await gh(env, `/repos/${repo}/git/ref/heads/${rama}`);

		if (refResponse.status === 404) {
			const mainRefResponse = await gh(env, `/repos/${repo}/git/ref/heads/main`);

			if (!mainRefResponse.ok) {
				return json(
					{ ok: false, error: `No se pudo leer main: ${mainRefResponse.status} ${mainRefResponse.statusText}` },
					mainRefResponse.status,
				);
			}

			const mainRef = await mainRefResponse.json();

			const createRefResponse = await gh(env, `/repos/${repo}/git/refs`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ref: `refs/heads/${rama}`, sha: mainRef.object.sha }),
			});

			if (!createRefResponse.ok) {
				return json(
					{
						ok: false,
						error: `No se pudo crear la rama: ${createRefResponse.status} ${createRefResponse.statusText}`,
					},
					createRefResponse.status,
				);
			}
		} else if (!refResponse.ok) {
			return json(
				{ ok: false, error: `GitHub respondió ${refResponse.status} ${refResponse.statusText}` },
				refResponse.status,
			);
		}

		const fileResponse = await gh(env, `/repos/${repo}/contents/src/data/${archivo}?ref=${rama}`);

		let shaActual;
		if (fileResponse.ok) {
			const file = await fileResponse.json();
			shaActual = file.sha;
		} else if (fileResponse.status !== 404) {
			return json(
				{ ok: false, error: `GitHub respondió ${fileResponse.status} ${fileResponse.statusText}` },
				fileResponse.status,
			);
		}

		const putResponse = await gh(env, `/repos/${repo}/contents/src/data/${archivo}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				message: `panel: actualiza ${archivo}`,
				content: toB64(JSON.stringify(contenido, null, 2) + '\n'),
				branch: rama,
				...(shaActual ? { sha: shaActual } : {}),
			}),
		});

		if (!putResponse.ok) {
			return json(
				{ ok: false, error: `No se pudo escribir: ${putResponse.status} ${putResponse.statusText}` },
				putResponse.status,
			);
		}

		const putData = await putResponse.json();

		return json({ ok: true, rama, commit: putData.commit?.html_url });
	} catch (error) {
		return json({ ok: false, error: 'No se pudo contactar con GitHub' }, 500);
	}
}

export async function onRequest() {
	return json({ ok: false, error: 'Solo GET/POST por ahora' }, 405);
}
