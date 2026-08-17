export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

/** Antepone /en a una ruta en español cuando el idioma no es el por defecto. */
export function localizedPath(path: string, lang: Locale): string {
	if (lang === DEFAULT_LOCALE) return path;
	return path === '/' ? '/en' : `/en${path}`;
}

/** Dada la ruta actual (con o sin /en), devuelve la misma ruta en el otro idioma. */
export function alternatePath(pathname: string): string {
	const clean = pathname.replace(/\/$/, '') || '/';
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
	},
} as const;
