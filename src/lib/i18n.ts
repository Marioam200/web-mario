export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

/**
 * Rutas cuyo slug no sigue el patrón simétrico /foo <-> /en/foo (por ejemplo, páginas legales
 * con un slug distinto y más natural en cada idioma). Formato: [ruta en es, ruta en en].
 */
const RUTAS_ASIMETRICAS: [es: string, en: string][] = [
	['/politica-de-privacidad', '/en/privacy-policy'],
	['/politica-de-cookies', '/en/cookie-policy'],
];

/** Antepone /en a una ruta en español cuando el idioma no es el por defecto. */
export function localizedPath(path: string, lang: Locale): string {
	if (lang === DEFAULT_LOCALE) return path;
	const excepcion = RUTAS_ASIMETRICAS.find(([es]) => es === path);
	if (excepcion) return excepcion[1];
	return path === '/' ? '/en' : `/en${path}`;
}

/** Dada la ruta actual (con o sin /en), devuelve la misma ruta en el otro idioma. */
export function alternatePath(pathname: string): string {
	const clean = pathname.replace(/\/$/, '') || '/';

	const porRutaEn = RUTAS_ASIMETRICAS.find(([, en]) => en === clean);
	if (porRutaEn) return porRutaEn[0];

	const porRutaEs = RUTAS_ASIMETRICAS.find(([es]) => es === clean);
	if (porRutaEs) return porRutaEs[1];

	if (clean === '/en' || clean.startsWith('/en/')) {
		const sinPrefijo = clean.slice(3);
		return sinPrefijo || '/';
	}
	return localizedPath(clean, 'en');
}

/** Idioma actual a partir de la ruta. */
export function localeFromPath(pathname: string): Locale {
	const clean = pathname.replace(/\/$/, '') || '/';
	return clean === '/en' || clean.startsWith('/en/') ? 'en' : 'es';
}

export const strings = {
	es: {
		nav: {
			sobreMi: 'Sobre mí',
			proyectos: 'Proyectos',
			experiencia: 'Experiencia',
			contacto: 'Contacto',
			ariaMain: 'Navegación principal',
			openMenu: 'Abrir menú',
		},
		footer: {
			tagline: 'Data · Sport · Progress',
			copy: (year: number) => `© ${year} Mario Álvarez. Valencia.`,
			ariaSocial: 'Redes sociales',
		},
		langSwitch: { es: 'ES', en: 'EN', label: 'Cambiar idioma' },
		cookies: {
			texto: 'Usamos cookies propias para analítica anónima y mejorar tu experiencia. No usamos cookies de terceros.',
			politica: 'Política de cookies',
			aceptar: 'Aceptar',
			rechazar: 'Rechazar',
			configurar: 'Configurar cookies',
			borrarDatos: 'Borrar mis datos',
			ariaBanner: 'Consentimiento de cookies',
		},
		legal: {
			privacidad: 'Política de privacidad',
			cookies: 'Política de cookies',
		},
	},
	en: {
		nav: {
			sobreMi: 'About',
			proyectos: 'Projects',
			experiencia: 'Experience',
			contacto: 'Contact',
			ariaMain: 'Main navigation',
			openMenu: 'Open menu',
		},
		footer: {
			tagline: 'Data · Sport · Progress',
			copy: (year: number) => `© ${year} Mario Álvarez. Valencia, Spain.`,
			ariaSocial: 'Social media',
		},
		langSwitch: { es: 'ES', en: 'EN', label: 'Switch language' },
		cookies: {
			texto: "We use first-party cookies for anonymous analytics and to improve your experience. We don't use third-party cookies.",
			politica: 'Cookie policy',
			aceptar: 'Accept',
			rechazar: 'Reject',
			configurar: 'Cookie settings',
			borrarDatos: 'Delete my data',
			ariaBanner: 'Cookie consent',
		},
		legal: {
			privacidad: 'Privacy policy',
			cookies: 'Cookie policy',
		},
	},
} as const;
