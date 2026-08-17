import { GoogleGenerativeAI } from '@google/generative-ai';
import { leerArchivoJson, json } from './_lib.js';

const MODEL_NAME = 'gemini-flash-latest';
const PERMITIDOS = ['inicio.json', 'sobre-mi.json', 'experiencia.json', 'cv.json'];

async function leerFuentesDeVerdad(env, rama) {
	const datos = {};
	for (const archivo of PERMITIDOS) {
		try {
			const { contenido } = await leerArchivoJson(env, archivo, rama);
			datos[archivo] = contenido;
		} catch (error) {
			console.error(`No se pudo leer ${archivo} para el chat del panel:`, error);
			datos[archivo] = null;
		}
	}
	return datos;
}

function construirSystemInstruction(datos) {
	return `Eres el asistente del panel privado de Mario Álvarez, dueño de esta web. Habla SOLO con Mario, en español, con tuteo y cercanía, como un compañero que le ayuda a mantener al día su web.

## Cómo hablas
- Haces UNA sola pregunta por turno. Nunca una lista de preguntas ni un interrogatorio.
- Nunca inventas datos que Mario no te haya dado explícitamente en la conversación. Si algo no está claro o falta un dato concreto (fecha, nombre, cifra...), pregúntalo antes de proponer nada.
- Tono natural y breve, no burocrático.

## Cuándo propones un cambio
Cuando ya tienes información concreta y suficiente sobre algo (una experiencia nueva, un ajuste al perfil, una habilidad, un dato de contacto, un logro deportivo...), añades al FINAL de tu respuesta -después del texto normal que lees en voz alta- un bloque de código con la etiqueta "propuesta" y un único objeto JSON con esta forma exacta:

\`\`\`propuesta
{"archivo": "uno-de-los-permitidos.json", "resumen": "una frase que describe el cambio", "contenido": { /* JSON COMPLETO y ya fusionado del archivo entero */ }}
\`\`\`

Reglas de la propuesta:
- "archivo" tiene que ser exactamente uno de: ${PERMITIDOS.join(', ')}.
- "contenido" es el archivo COMPLETO ya actualizado con el cambio incorporado, respetando su estructura y campos actuales (los que ves más abajo en "fuente de la verdad"), no un fragmento ni un parche parcial. No pierdas ni contradigas datos que ya existían y siguen siendo ciertos.
- No propongas cambios en archivos que no estén en esa lista.
- Si todavía no tienes información suficiente para un cambio concreto, no incluyas el bloque "propuesta": sigue conversando con normalidad.
- Nunca muestres el JSON de la propuesta como parte del texto que Mario lee; va solo dentro del bloque \`\`\`propuesta\`\`\`.

## Fuente de la verdad
Este es el contenido ACTUAL de los archivos de datos del sitio (rama de trabajo). Amplíalo con lo que Mario te cuente, sin contradecirlo ni perder información existente que siga siendo válida.

### src/data/inicio.json
${JSON.stringify(datos['inicio.json'], null, 2)}

### src/data/sobre-mi.json
${JSON.stringify(datos['sobre-mi.json'], null, 2)}

### src/data/experiencia.json
${JSON.stringify(datos['experiencia.json'], null, 2)}

### src/data/cv.json
${JSON.stringify(datos['cv.json'], null, 2)}`;
}

function extraerPropuesta(texto) {
	const regex = /```propuesta\s*([\s\S]*?)```/i;
	const match = texto.match(regex);

	if (!match) {
		return { reply: texto.trim(), proposal: null };
	}

	const reply = (texto.slice(0, match.index) + texto.slice(match.index + match[0].length)).trim();

	try {
		const datos = JSON.parse(match[1].trim());
		if (
			datos &&
			typeof datos === 'object' &&
			PERMITIDOS.includes(datos.archivo) &&
			typeof datos.resumen === 'string' &&
			typeof datos.contenido === 'object' &&
			datos.contenido !== null &&
			!Array.isArray(datos.contenido)
		) {
			return { reply, proposal: { archivo: datos.archivo, resumen: datos.resumen, contenido: datos.contenido } };
		}
	} catch (error) {
		console.error('Bloque de propuesta con JSON mal formado, se ignora:', error);
	}

	return { reply, proposal: null };
}

export async function onRequestPost({ request, env }) {
	const apiKey = env.GEMINI_API_KEY;
	if (!apiKey) {
		return json({ ok: false, error: 'Falta GEMINI_API_KEY' }, 500);
	}

	if (!env.GITHUB_TOKEN) {
		return json({ ok: false, error: 'Falta GITHUB_TOKEN' }, 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Body no es JSON válido' }, 400);
	}

	const historyBruto = Array.isArray(body?.history) ? body.history : null;
	if (!historyBruto || historyBruto.length === 0) {
		return json({ ok: false, error: 'Falta history' }, 400);
	}

	const contents = historyBruto
		.filter((m) => m && typeof m.text === 'string' && m.text.trim() && (m.role === 'user' || m.role === 'model'))
		.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

	if (contents.length === 0) {
		return json({ ok: false, error: 'history vacío o inválido' }, 400);
	}

	const rama = env.GITHUB_BRANCH || 'panel-test';

	try {
		const datos = await leerFuentesDeVerdad(env, rama);
		const systemInstruction = construirSystemInstruction(datos);

		const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL_NAME, systemInstruction });

		const resultado = await model.generateContent({ contents });
		const texto = resultado.response.text();

		const { reply, proposal } = extraerPropuesta(texto);

		return json({ ok: true, reply, proposal });
	} catch (error) {
		console.error('Error en el chat del panel:', error);
		return json({ ok: false, error: 'No se pudo contactar con Gemini' }, 500);
	}
}

export async function onRequest() {
	return json({ ok: false, error: 'Solo POST por ahora' }, 405);
}
