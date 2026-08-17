import { GoogleGenerativeAI } from '@google/generative-ai';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Astro empaqueta este archivo en dist/ durante el build, así que import.meta.url
// deja de apuntar a src/lib/. Usamos process.cwd() (raíz del proyecto, que es
// desde donde se ejecuta `astro dev` / `astro build`) para localizar la caché.
const CACHE_PATH = path.join(process.cwd(), 'src', 'data', 'descripciones-cache.json');

const GITHUB_USER = 'Marioam200';
const MODEL_NAME = 'gemini-flash-latest';
const FALLBACK_DESCRIPTION = {
	es: 'Proyecto de análisis y ciencia de datos.',
	en: 'Data analysis and data science project.',
};
// Margen prudente por debajo del límite del free tier de Gemini (15 req/min).
const RATE_LIMIT_DELAY_MS = 4500;

// Compartido a nivel de módulo (no dentro de obtenerDescripciones) para que el retraso entre
// llamadas a Gemini se respete entre TODAS las llamadas del build, sin importar el idioma:
// si /proyectos y /en/proyectos se generan en el mismo proceso de `astro build`, la segunda
// llamada a obtenerDescripciones() debe seguir esperando su turno igual que la primera.
let seHaLlamadoAGeminiEnEsteProceso = false;

function leerCache() {
	if (!existsSync(CACHE_PATH)) return {};
	try {
		return JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
	} catch (error) {
		console.error('No se pudo leer la caché de descripciones, se regenerará:', error);
		return {};
	}
}

function guardarCache(cache) {
	try {
		writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8');
	} catch (error) {
		console.error('No se pudo escribir la caché de descripciones:', error);
	}
}

function esperar(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Las entradas antiguas de la caché solo tienen { name, updated_at, description } (siempre en
// español). Las tratamos como si esa description fuera la versión "es", sin migrar el archivo.
function normalizarEntrada(entrada) {
	if (!entrada) return undefined;
	if (entrada.es !== undefined || entrada.en !== undefined) return entrada;
	return { name: entrada.name, updated_at: entrada.updated_at, es: entrada.description };
}

// Se reutiliza entre todas las llamadas del mismo proceso de build (inicio ES/EN, proyectos
// ES/EN) para no pedir el README del mismo repo varias veces y agotar el límite de la API de
// GitHub.
const cacheReadmes = new Map();

async function obtenerReadme(repoName) {
	if (cacheReadmes.has(repoName)) return cacheReadmes.get(repoName);

	const headers = { Accept: 'application/vnd.github.raw' };
	if (process.env.GITHUB_API_TOKEN) {
		headers.Authorization = `Bearer ${process.env.GITHUB_API_TOKEN}`;
	}

	let resultado;
	try {
		const response = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${repoName}/readme`, { headers });

		if (response.status === 404) {
			// Confirmado: este repo no tiene README.
			resultado = { ok: true, texto: null };
		} else if (!response.ok) {
			// Fallo temporal (límite de peticiones, error de GitHub...): no confirma que no
			// haya README, así que no debe tratarse igual que un 404.
			console.error(`No se pudo obtener el README de "${repoName}": HTTP ${response.status}`);
			resultado = { ok: false, texto: null };
		} else {
			const texto = (await response.text()).trim();
			resultado = { ok: true, texto: texto || null };
		}
	} catch (error) {
		console.error(`No se pudo obtener el README de "${repoName}":`, error);
		resultado = { ok: false, texto: null };
	}

	cacheReadmes.set(repoName, resultado);
	return resultado;
}

function construirPrompt(lang, repoName, readme) {
	const readmeRecortado = readme.slice(0, 6000);

	if (lang === 'en') {
		return `You are an assistant that writes short descriptions for a developer portfolio.
Based on the following README of the repository "${repoName}", write a description in English of 1 or 2 sentences that simply explains what the project does and what technologies it uses.

Tone: professional but approachable, humble and honest. Don't exaggerate or promise more than what the project really is.
Don't use grandiose or marketing words (for example: "advanced", "reliable", "optimal", "strategic", "algorithmic fairness", "robust", "innovative") unless the README clearly justifies it with concrete evidence.
If based on the README this looks like an academic assignment, a class exercise, or a learning/practice project, say so naturally instead of selling it as something more ambitious.
Reply only with the description text, no markdown, no quotes and no prefixes.

README:
"""
${readmeRecortado}
"""`;
	}

	return `Eres un asistente que redacta descripciones breves para un portfolio de desarrollador.
A partir del siguiente README del repositorio "${repoName}", escribe una descripción en español de 1 o 2 frases que explique con sencillez qué hace el proyecto y qué tecnologías usa.

Tono: profesional pero cercano, humilde y honesto. Sin exagerar ni prometer más de lo que el proyecto realmente es.
No uses palabras grandilocuentes o de marketing (por ejemplo: "avanzada", "confiabilidad", "óptima", "estratégica", "equidad algorítmica", "robusto", "innovador") salvo que el README lo justifique claramente con evidencia concreta.
Si por el README parece un trabajo académico, un ejercicio de clase o un proyecto de aprendizaje/práctica, dilo con naturalidad en vez de venderlo como algo más ambicioso.
Responde solo con el texto de la descripción, sin markdown, sin comillas y sin prefijos.

README:
"""
${readmeRecortado}
"""`;
}

async function generarDescripcion(model, repoName, readme, lang) {
	const resultado = await model.generateContent(construirPrompt(lang, repoName, readme));
	return resultado.response.text().trim() || null;
}

/**
 * Devuelve un mapa { [nombreRepo]: descripcion } en el idioma pedido para la lista de repos dada,
 * reutilizando la caché en disco cuando el `updated_at` del repo no ha cambiado. Solo genera con
 * Gemini el idioma que falte o esté desactualizado; si el otro idioma ya está cacheado y sigue
 * vigente, se conserva tal cual en la caché.
 * @param {Array<{ name: string, updated_at: string }>} repos
 * @param {'es' | 'en'} [lang]
 * @returns {Promise<Record<string, string>>}
 */
export async function obtenerDescripciones(repos, lang = 'es') {
	const cache = leerCache();
	const apiKey = process.env.GEMINI_API_KEY;

	if (!apiKey) {
		console.warn('GEMINI_API_KEY no está definida: se usarán descripciones de la caché o el texto de reserva.');
	}

	const model = apiKey ? new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL_NAME }) : null;
	const otroLang = lang === 'es' ? 'en' : 'es';

	const descripciones = {};

	for (const repo of repos) {
		const entradaCache = normalizarEntrada(cache[repo.name]);
		const entradaVigente = entradaCache && entradaCache.updated_at === repo.updated_at ? entradaCache : undefined;
		const textoCacheado = entradaVigente?.[lang];

		if (textoCacheado) {
			descripciones[repo.name] = textoCacheado;
			continue;
		}

		if (!model) {
			descripciones[repo.name] = FALLBACK_DESCRIPTION[lang];
			continue;
		}

		const readme = await obtenerReadme(repo.name);

		let descripcion = FALLBACK_DESCRIPTION[lang];
		// Solo se persiste en caché cuando el estado es estable para el `updated_at` actual
		// (sin README, o generación exitosa). Un fallo transitorio (de la API de GitHub o de
		// Gemini) no se cachea, para que el próximo build lo reintente en vez de quedarse con
		// el fallback para siempre.
		let persistirEnCache = true;

		if (!readme.ok) {
			// No sabemos si tiene README o no (fallo temporal de la API de GitHub): no se
			// guarda en caché, para que el próximo build lo reintente.
			descripcion = entradaCache?.[lang] || FALLBACK_DESCRIPTION[lang];
			persistirEnCache = false;
		} else if (readme.texto) {
			if (seHaLlamadoAGeminiEnEsteProceso) {
				await esperar(RATE_LIMIT_DELAY_MS);
			}
			seHaLlamadoAGeminiEnEsteProceso = true;

			try {
				const generada = await generarDescripcion(model, repo.name, readme.texto, lang);
				descripcion = generada || FALLBACK_DESCRIPTION[lang];
			} catch (error) {
				console.error(`Gemini no pudo generar la descripción (${lang}) de "${repo.name}":`, error);
				descripcion = entradaCache?.[lang] || FALLBACK_DESCRIPTION[lang];
				persistirEnCache = false;
			}
		}
		// Si readme.ok es true y readme.texto es null: confirmado que no hay README, se queda
		// con el texto de reserva y SÍ se persiste en caché (es un estado estable y correcto).

		descripciones[repo.name] = descripcion;
		if (persistirEnCache) {
			cache[repo.name] = {
				name: repo.name,
				updated_at: repo.updated_at,
				...(entradaVigente?.[otroLang] ? { [otroLang]: entradaVigente[otroLang] } : {}),
				[lang]: descripcion,
			};
		}
	}

	guardarCache(cache);
	return descripciones;
}
