const COOKIE_CONSENTIMIENTO = 'consentimiento_cookies';
const COOKIE_VISITANTE = 'visitante_id';
const ENDPOINT = '/api/track';
const ENVIO_INTERVALO_MS = 10000;
const COMPROBACION_LIMITE_MS = 1000;
const TRAMO_MAXIMO_SEGUNDOS = 30;

let inicializado = false;
let colaEventos = [];
// Un tramo de atención por cada elemento actualmente visible (varios a la vez es normal,
// por ejemplo dos tarjetas de proyecto visibles al mismo tiempo en una rejilla).
const tramosActivos = new Map();

function leerCookie(nombre) {
	const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${nombre}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : null;
}

function haConsentido() {
	return leerCookie(COOKIE_CONSENTIMIENTO) === 'aceptado';
}

function ahoraSegundos() {
	return Date.now() / 1000;
}

function encolarEvento(evento) {
	colaEventos.push(evento);
}

function datosDeTramo(el) {
	if (el.dataset.trackingSeccion !== undefined) {
		return { tipo: 'seccion', valor: el.dataset.trackingSeccion };
	}
	if (el.dataset.trackingProyecto !== undefined) {
		return { tipo: 'proyecto', valor: el.dataset.trackingProyecto };
	}
	return null;
}

function segundosAcumuladosDe(tramo) {
	let total = tramo.acumulado;
	if (document.visibilityState === 'visible' && tramo.inicio !== null) {
		total += ahoraSegundos() - tramo.inicio;
	}
	return total;
}

function abrirTramo(el) {
	const datos = datosDeTramo(el);
	if (!datos) return;

	tramosActivos.set(el, {
		tipo: datos.tipo,
		valor: datos.valor,
		acumulado: 0,
		inicio: document.visibilityState === 'visible' ? ahoraSegundos() : null,
	});
}

function cerrarTramo(el) {
	const tramo = tramosActivos.get(el);
	if (!tramo) return;

	const duracionSegundos = Math.round(segundosAcumuladosDe(tramo));
	tramosActivos.delete(el);

	if (duracionSegundos > 0) {
		encolarEvento({ tipo: 'tiempo_atencion', [tramo.tipo]: tramo.valor, duracionSegundos });
	}
}

// Si alguien pasa más de TRAMO_MAXIMO_SEGUNDOS seguidos en el mismo elemento, se corta el
// tramo en ese punto y se abre uno nuevo para lo que siga viendo, en vez de perder la cuenta
// o dejar crecer un único tramo sin límite.
function comprobarLimitesDeTramos() {
	for (const el of Array.from(tramosActivos.keys())) {
		const tramo = tramosActivos.get(el);
		if (segundosAcumuladosDe(tramo) >= TRAMO_MAXIMO_SEGUNDOS) {
			cerrarTramo(el);
			abrirTramo(el);
		}
	}
}

function enviarCola(usarBeacon) {
	if (colaEventos.length === 0) return;

	const visitanteId = leerCookie(COOKIE_VISITANTE);
	if (!visitanteId) {
		colaEventos = [];
		return;
	}

	const payload = JSON.stringify({
		visitanteId,
		idioma: document.documentElement.lang,
		dispositivo: window.matchMedia('(max-width: 768px)').matches ? 'movil' : 'escritorio',
		eventos: colaEventos,
	});

	colaEventos = [];

	if (usarBeacon && navigator.sendBeacon) {
		navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
		return;
	}

	fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: payload,
		keepalive: Boolean(usarBeacon),
	}).catch(() => {});
}

function onVisibilityChange() {
	if (document.visibilityState === 'hidden') {
		const ahora = ahoraSegundos();
		for (const tramo of tramosActivos.values()) {
			if (tramo.inicio !== null) {
				tramo.acumulado += ahora - tramo.inicio;
				tramo.inicio = null;
			}
		}
		enviarCola(true);
	} else {
		const ahora = ahoraSegundos();
		for (const tramo of tramosActivos.values()) {
			tramo.inicio = ahora;
		}
	}
}

function onClick(event) {
	const el = event.target.closest('[data-tracking-clic]');
	if (!el) return;
	encolarEvento({ tipo: 'clic', seccion: el.dataset.trackingClic });
}

function observarElementos() {
	if (!('IntersectionObserver' in window)) return;

	const elementos = document.querySelectorAll('[data-tracking-seccion], [data-tracking-proyecto]');
	if (elementos.length === 0) return;

	// threshold 0: un elemento se considera "visible" en cuanto asoma en el viewport, no solo
	// cuando ocupa la mitad de la pantalla. Con un threshold alto, secciones más altas que el
	// viewport (Sobre mí, Contacto) podrían no llegar nunca a disparar isIntersecting=true.
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					if (!tramosActivos.has(entry.target)) abrirTramo(entry.target);
				} else {
					cerrarTramo(entry.target);
				}
			}
		},
		{ threshold: 0 },
	);

	elementos.forEach((el) => observer.observe(el));
}

function inicializar() {
	if (inicializado) return;
	inicializado = true;

	observarElementos();
	document.addEventListener('click', onClick);
	document.addEventListener('visibilitychange', onVisibilityChange);
	setInterval(comprobarLimitesDeTramos, COMPROBACION_LIMITE_MS);
	setInterval(() => enviarCola(false), ENVIO_INTERVALO_MS);
}

if (haConsentido()) {
	inicializar();
} else {
	window.addEventListener('cookies-aceptadas', inicializar, { once: true });
}
