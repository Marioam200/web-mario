import { GoogleGenerativeAI } from '@google/generative-ai';
import { leerArchivoJson, json } from './_lib.js';
import { generarCvPdf } from './_generar-cv.js';

const MODEL_NAME = 'gemini-flash-latest';
const IDIOMAS = { en: 'inglés (en)', es: 'español (es)' };

function limpiarJsonModelo(texto) {
	const sinFences = texto
		.trim()
		.replace(/^```(?:json)?/i, '')
		.replace(/```$/, '')
		.trim();
	return JSON.parse(sinFences);
}

async function traducirCv(env, cv, destino) {
	const apiKey = env.GEMINI_API_KEY;
	if (!apiKey) return cv;

	try {
		const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL_NAME });

		const prompt = `Traduce el siguiente CV en formato JSON del idioma "${cv.lang}" a "${IDIOMAS[destino]}".

Reglas estrictas:
- Devuelve EXCLUSIVAMENTE JSON válido, con exactamente el mismo esquema: mismas claves, mismos arrays, mismo orden de campos.
- No traduzcas nombres propios, marcas, URLs, ni tecnologías (Python, SQL, R, Power BI, Machine Learning, UPV, RFEC, UCI, Cofidis, etc.). Los campos "email", "phone", "site" y "github" se copian tal cual.
- Traduce la prosa: profile, bullets, meta descriptivo (org/dates puede traducirse si es texto, no si son fechas/nombres propios), competencias, certificaciones, deporte y descripciones de proyectos.
- Cambia el campo "lang" a "${destino}".
- No añadas texto antes ni después del JSON. No uses bloques de código markdown.

JSON original:
${JSON.stringify(cv)}`;

		const resultado = await model.generateContent(prompt);
		const texto = resultado.response.text();
		const traducido = limpiarJsonModelo(texto);

		if (!traducido || typeof traducido !== 'object' || !traducido.contact || !Array.isArray(traducido.experience)) {
			throw new Error('Traducción con esquema inesperado');
		}

		return traducido;
	} catch (error) {
		console.error('No se pudo traducir el CV, se usa el original:', error);
		return cv;
	}
}

export async function onRequestGet({ request, env }) {
	if (!env.GITHUB_TOKEN) {
		return json({ ok: false, error: 'Falta GITHUB_TOKEN' }, 500);
	}

	const url = new URL(request.url);
	const langParam = url.searchParams.get('lang');
	const lang = langParam === 'en' || langParam === 'es' ? langParam : 'es';
	const rama = url.searchParams.get('rama') || env.GITHUB_BRANCH || 'panel-test';
	const sinCache = url.searchParams.has('nocache');

	const cache = caches.default;
	const cacheKey = new Request(`${url.origin}${url.pathname}?lang=${lang}&rama=${encodeURIComponent(rama)}`, {
		method: 'GET',
	});

	if (!sinCache) {
		const enCache = await cache.match(cacheKey);
		if (enCache) return enCache;
	}

	let cv;
	try {
		const resultado = await leerArchivoJson(env, 'cv.json', rama);
		cv = resultado.contenido;
	} catch (error) {
		return json({ ok: false, error: 'No se pudo leer cv.json desde GitHub' }, 500);
	}

	const cvFinal = cv.lang === lang ? cv : await traducirCv(env, cv, lang);

	let pdfBytes;
	try {
		pdfBytes = await generarCvPdf(cvFinal);
	} catch (error) {
		console.error('Error generando el PDF del CV:', error);
		return json({ ok: false, error: 'No se pudo generar el PDF' }, 500);
	}

	const nombreArchivo = `cv-mario-alvarez-${lang}.pdf`;
	const response = new Response(pdfBytes, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="${nombreArchivo}"`,
			'Cache-Control': 'public, max-age=3600',
		},
	});

	if (!sinCache) {
		await cache.put(cacheKey, response.clone());
	}

	return response;
}

export async function onRequest() {
	return json({ ok: false, error: 'Solo GET por ahora' }, 405);
}
