const ARCHIVO_PRUEBA = 'src/data/experiencia.json';

function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export async function onRequestGet({ env }) {
	const token = env.GITHUB_TOKEN;
	const repo = env.GITHUB_REPO;

	if (!token) {
		return json({ ok: false, error: 'Falta GITHUB_TOKEN' }, 500);
	}

	try {
		const response = await fetch(
			`https://api.github.com/repos/${repo}/contents/${ARCHIVO_PRUEBA}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github+json',
					'User-Agent': 'web-mario-panel',
				},
			},
		);

		if (!response.ok) {
			return json(
				{ ok: false, error: `GitHub respondió ${response.status} ${response.statusText}` },
				response.status,
			);
		}

		const data = await response.json();

		return json({
			ok: true,
			mensaje: 'Conectado a GitHub, puedo leer experiencia.json',
			sha: data.sha,
		});
	} catch (error) {
		return json({ ok: false, error: 'No se pudo contactar con GitHub' }, 500);
	}
}

export async function onRequest() {
	return json({ ok: false, error: 'Solo GET por ahora' }, 405);
}
