import { json } from '../_lib.js';
import { verificarSesion, hashPassword } from '../_auth.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_LONGITUD_MINIMA = 10;

export async function onRequestGet({ request, env }) {
	const userId = await verificarSesion(request, env);
	if (!userId) return json({ error: 'No autenticado' }, 401);

	try {
		const { results } = await env.DB.prepare(
			'SELECT id, nombre, email, creado_en FROM usuarios_panel ORDER BY creado_en DESC',
		).all();

		const usuarios = results.map((fila) => ({
			id: fila.id,
			nombre: fila.nombre,
			email: fila.email,
			creadoEn: fila.creado_en,
		}));
		return json({ usuarios });
	} catch (error) {
		console.error('Error listando usuarios del panel:', error);
		return json({ error: 'No se pudo leer la base de datos' }, 500);
	}
}

export async function onRequestPost({ request, env }) {
	const userId = await verificarSesion(request, env);
	if (!userId) return json({ error: 'No autenticado' }, 401);

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Body no es JSON válido' }, 400);
	}

	const { nombre, email, password } = body || {};

	if (typeof nombre !== 'string' || !nombre.trim()) {
		return json({ error: 'Falta el nombre' }, 400);
	}
	if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
		return json({ error: 'Email no válido' }, 400);
	}
	if (typeof password !== 'string' || password.length < PASSWORD_LONGITUD_MINIMA) {
		return json({ error: `La contraseña debe tener al menos ${PASSWORD_LONGITUD_MINIMA} caracteres` }, 400);
	}

	try {
		const existente = await env.DB.prepare('SELECT id FROM usuarios_panel WHERE email = ?').bind(email).first();
		if (existente) {
			return json({ error: 'Ese correo ya tiene cuenta' }, 409);
		}

		const { hash, salt } = await hashPassword(password);

		const fila = await env.DB.prepare(
			'INSERT INTO usuarios_panel (nombre, email, password_hash, password_salt) VALUES (?, ?, ?, ?) RETURNING id, creado_en',
		)
			.bind(nombre, email, hash, salt)
			.first();

		return json({ id: fila.id, nombre, email, creadoEn: fila.creado_en }, 201);
	} catch (error) {
		console.error('Error creando usuario del panel:', error);
		return json({ error: 'No se pudo crear el usuario' }, 500);
	}
}

export async function onRequest() {
	return json({ error: 'Solo GET/POST por ahora' }, 405);
}
