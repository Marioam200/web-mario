import { GoogleGenerativeAI } from '@google/generative-ai';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Astro empaqueta este archivo en dist/ durante el build, así que import.meta.url
// deja de apuntar a src/lib/. Usamos process.cwd() (raíz del proyecto, que es
// desde donde se ejecuta `astro dev` / `astro build`) para localizar la caché.
const CACHE_PATH = path.join(process.cwd(), 'src', 'data', 'descripciones-cache.json');

const GITHUB_USER = 'Marioam200';
const MODEL_NAME = 'gemini-flash-latest';
const FALLBACK_DESCRIPTION = 'Proyecto de análisis y ciencia de datos.';
// Margen prudente por debajo del límite del free tier de Gemini (15 req/min).
const RATE_LIMIT_DELAY_MS = 4500;

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

async function obtenerReadme(repoName) {
	try {
		const response = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${repoName}/readme`, {
			headers: { Accept: 'application/vnd.github.raw' },
		});
		if (!response.ok) return null;
		const texto = (await response.text()).trim();
		return texto || null;
	} catch (error) {
		console.error(`No se pudo obtener el README de "${repoName}":`, error);
		return null;
	}
}

async function generarDescripcion(model, repoName, readme) {
	const prompt = `Eres un asistente que redacta descripciones breves para un portfolio de desarrollador.
A partir del siguiente README del repositorio "${repoName}", escribe una descripción en español de 1 o 2 frases que explique con sencillez qué hace el proyecto y qué tecnologías usa.

Tono: profesional pero cercano, humilde y honesto. Sin exagerar ni prometer más de lo que el proyecto realmente es.
No uses palabras grandilocuentes o de marketing (por ejemplo: "avanzada", "confiabilidad", "óptima", "estratégica", "equidad algorítmica", "robusto", "innovador") salvo que el README lo justifique claramente con evidencia concreta.
Si por el README parece un trabajo académico, un ejercicio de clase o un proyecto de aprendizaje/práctica, dilo con naturalidad en vez de venderlo como algo más ambicioso.
Responde solo con el texto de la descripción, sin markdown, sin comillas y sin prefijos.

README:
"""
${readme.slice(0, 6000)}
"""`;

	const resultado = await model.generateContent(prompt);
	return resultado.response.text().trim() || null;
}

/**
 * Devuelve un mapa { [nombreRepo]: descripcion } para la lista de repos dada,
 * reutilizando la caché en disco cuando el `updated_at` del repo no ha cambiado.
 * @param {Array<{ name: string, updated_at: string }>} repos
 * @returns {Promise<Record<string, string>>}
 */
export async function obtenerDescripciones(repos) {
	const cache = leerCache();
	const apiKey = process.env.GEMINI_API_KEY;

	if (!apiKey) {
		console.warn('GEMINI_API_KEY no está definida: se usarán descripciones de la caché o el texto de reserva.');
	}

	const model = apiKey ? new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL_NAME }) : null;

	const descripciones = {};
	let esPrimeraLlamadaGemini = true;

	for (const repo of repos) {
		const entradaCache = cache[repo.name];

		if (entradaCache && entradaCache.updated_at === repo.updated_at) {
			descripciones[repo.name] = entradaCache.description;
			continue;
		}

		if (!model) {
			descripciones[repo.name] = FALLBACK_DESCRIPTION;
			continue;
		}

		const readme = await obtenerReadme(repo.name);

		let descripcion = FALLBACK_DESCRIPTION;
		// Solo se persiste en caché cuando el estado es estable para el `updated_at` actual
		// (sin README, o generación exitosa). Un fallo transitorio de Gemini no se cachea,
		// para que el próximo build lo reintente en vez de quedarse con el fallback para siempre.
		let persistirEnCache = true;

		if (readme) {
			if (!esPrimeraLlamadaGemini) {
				await esperar(RATE_LIMIT_DELAY_MS);
			}
			esPrimeraLlamadaGemini = false;

			try {
				const generada = await generarDescripcion(model, repo.name, readme);
				descripcion = generada || FALLBACK_DESCRIPTION;
			} catch (error) {
				console.error(`Gemini no pudo generar la descripción de "${repo.name}":`, error);
				descripcion = entradaCache?.description || FALLBACK_DESCRIPTION;
				persistirEnCache = false;
			}
		}

		descripciones[repo.name] = descripcion;
		if (persistirEnCache) {
			cache[repo.name] = {
				name: repo.name,
				updated_at: repo.updated_at,
				description: descripcion,
			};
		}
	}

	guardarCache(cache);
	return descripciones;
}
