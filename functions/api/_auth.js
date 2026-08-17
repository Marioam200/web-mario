const PBKDF2_ITERACIONES = 100000;
const PBKDF2_LONGITUD_BITS = 32 * 8;
const SALT_LONGITUD_BYTES = 16;

const SESION_NOMBRE_COOKIE = 'sesion_panel';
const SESION_DURACION_MS = 1000 * 60 * 60 * 24 * 7;
const SESION_MAX_AGE_SEGUNDOS = 604800;

function bufferAHex(datos) {
	return Array.from(new Uint8Array(datos))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function hexABuffer(hex) {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

// Comparación en tiempo constante: recorre siempre las dos cadenas enteras en vez de
// cortar en la primera diferencia (como haría === o localeCompare), para no filtrar por
// temporización cuánto coincide un hash/firma con el esperado.
function compararEnTiempoConstante(a, b) {
	if (a.length !== b.length) return false;
	let diferencia = 0;
	for (let i = 0; i < a.length; i++) {
		diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diferencia === 0;
}

async function derivarPBKDF2(password, saltBytes) {
	const encoder = new TextEncoder();
	const claveBase = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERACIONES, hash: 'SHA-256' },
		claveBase,
		PBKDF2_LONGITUD_BITS,
	);
	return bufferAHex(bits);
}

async function firmarHMAC(mensaje, secret) {
	const encoder = new TextEncoder();
	const clave = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const firma = await crypto.subtle.sign('HMAC', clave, encoder.encode(mensaje));
	return bufferAHex(firma);
}

function leerCookieDeCabecera(cabecera, nombre) {
	if (!cabecera) return null;
	const match = cabecera.match(new RegExp(`(?:^|;\\s*)${nombre}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * @param {string} password
 * @returns {Promise<{ hash: string, salt: string }>}
 */
export async function hashPassword(password) {
	const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_LONGITUD_BYTES));
	const salt = bufferAHex(saltBytes);
	const hash = await derivarPBKDF2(password, saltBytes);
	return { hash, salt };
}

/**
 * @param {string} password
 * @param {string} hash
 * @param {string} salt
 * @returns {Promise<boolean>}
 */
export async function verificarPassword(password, hash, salt) {
	const saltBytes = hexABuffer(salt);
	const hashCalculado = await derivarPBKDF2(password, saltBytes);
	return compararEnTiempoConstante(hashCalculado, hash);
}

/**
 * @param {string | number} userId
 * @param {string} secret
 * @returns {Promise<string>}
 */
export async function crearCookieSesion(userId, secret) {
	const expira = Date.now() + SESION_DURACION_MS;
	const payload = `${userId}.${expira}`;
	const firma = await firmarHMAC(payload, secret);
	return `${payload}.${firma}`;
}

/** Cabecera Set-Cookie para instalar la cookie de sesión ya firmada. */
export function cabeceraCookieSesion(valorCookie) {
	return `${SESION_NOMBRE_COOKIE}=${valorCookie}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESION_MAX_AGE_SEGUNDOS}`;
}

/**
 * @param {Request} request
 * @param {{ SESSION_SECRET?: string }} env
 * @returns {Promise<string | null>} el userId si la sesión es válida, null si no
 */
export async function verificarSesion(request, env) {
	const cookie = leerCookieDeCabecera(request.headers.get('Cookie'), SESION_NOMBRE_COOKIE);
	if (!cookie) return null;

	const partes = cookie.split('.');
	if (partes.length !== 3) return null;

	const [userId, expiraStr, firma] = partes;
	const payload = `${userId}.${expiraStr}`;

	let firmaEsperada;
	try {
		firmaEsperada = await firmarHMAC(payload, env.SESSION_SECRET);
	} catch {
		return null;
	}

	if (!compararEnTiempoConstante(firma, firmaEsperada)) return null;

	const expira = Number(expiraStr);
	if (!Number.isFinite(expira) || Date.now() > expira) return null;

	return userId;
}

/**
 * @param {{ DB: D1Database }} env
 * @param {'info' | 'error'} nivel
 * @param {string} contexto
 * @param {string} mensaje
 */
export async function registrarLog(env, nivel, contexto, mensaje) {
	try {
		await env.DB.prepare('INSERT INTO logs_sistema (nivel, contexto, mensaje) VALUES (?, ?, ?)').bind(nivel, contexto, mensaje).run();
	} catch (error) {
		console.error('No se pudo registrar el log:', error);
	}
}
