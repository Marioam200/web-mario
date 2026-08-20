import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import qrcode from 'qrcode-generator';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const HEADER_H = 92;
const SIDEBAR_W = 178;
const GAP = 20;

const COLOR = {
	navy: rgb(6 / 255, 9 / 255, 15 / 255),
	blue: rgb(0x38 / 255, 0xbd / 255, 0xf8 / 255),
	green: rgb(0x34 / 255, 0xd3 / 255, 0x99 / 255),
	sidebarBg: rgb(0xf6 / 255, 0xf9 / 255, 0xfc / 255),
	white: rgb(1, 1, 1),
	ink: rgb(0.08, 0.11, 0.16),
	dim: rgb(0.38, 0.42, 0.5),
	track: rgb(0.85, 0.88, 0.92),
};

// Los fonts estándar de pdf-lib usan WinAnsiEncoding: em/en dash, comillas tipográficas
// y flechas/viñetas Unicode no están garantizadas ahí y pdf-lib lanza error al dibujarlas.
function sanitize(texto) {
	return String(texto ?? '')
		.replace(/[—–]/g, '-')
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/[▸►▶→•‣◦]/g, '-')
		.trim();
}

function wrapText(font, size, maxWidth, texto) {
	const palabras = sanitize(texto).split(/\s+/).filter(Boolean);
	const lineas = [];
	let linea = '';
	for (const palabra of palabras) {
		const prueba = linea ? `${linea} ${palabra}` : palabra;
		if (font.widthOfTextAtSize(prueba, size) > maxWidth && linea) {
			lineas.push(linea);
			linea = palabra;
		} else {
			linea = prueba;
		}
	}
	if (linea) lineas.push(linea);
	return lineas.length ? lineas : [''];
}

/** Dibuja texto envuelto a maxWidth, apilando líneas hacia abajo desde (x, y). */
function drawWrappedLine(page, texto, x, y, maxWidth, size, font, color, lineHeight = size * 1.3) {
	const lineas = wrapText(font, size, maxWidth, texto);
	lineas.forEach((linea, i) => {
		page.drawText(linea, { x, y: y - i * lineHeight, size, font, color });
	});
	return lineas.length;
}

function dibujarQr(page, texto, x, y, tamano, color) {
	const qr = qrcode(0, 'M');
	qr.addData(texto);
	qr.make();
	const count = qr.getModuleCount();
	const moduleSize = tamano / count;
	for (let fila = 0; fila < count; fila++) {
		for (let columna = 0; columna < count; columna++) {
			if (qr.isDark(fila, columna)) {
				page.drawRectangle({
					x: x + columna * moduleSize,
					y: y + tamano - (fila + 1) * moduleSize,
					width: moduleSize,
					height: moduleSize,
					color,
				});
			}
		}
	}
}

/** Columna de contenido con paginación automática (nueva página A4 completa, sin sidebar). */
class Columna {
	constructor(page, x, width, y, crearPaginaNueva) {
		this.page = page;
		this.x = x;
		this.width = width;
		this.y = y;
		this.crearPaginaNueva = crearPaginaNueva;
	}

	asegurarEspacio(altura) {
		if (this.y - altura < MARGIN) {
			const nueva = this.crearPaginaNueva();
			this.page = nueva.page;
			this.x = nueva.x;
			this.width = nueva.width;
			this.y = nueva.y;
		}
	}

	titulo(texto, font, underline, alturaSiguiente = 0) {
		this.asegurarEspacio(30 + alturaSiguiente);
		this.y -= 4;
		this.page.drawText(sanitize(texto).toUpperCase(), {
			x: this.x,
			y: this.y - 10,
			size: 11,
			font,
			color: COLOR.navy,
		});
		this.y -= 15;
		this.page.drawLine({
			start: { x: this.x, y: this.y },
			end: { x: this.x + this.width, y: this.y },
			thickness: 1.2,
			color: underline,
		});
		this.y -= 10;
	}

	/** Línea envuelta al ancho de la columna, sin espaciado extra tras el bloque (para roles/meta/títulos de ítem). */
	lineaAncha(texto, font, size, color, lineHeight = size * 1.25) {
		const lineas = wrapText(font, size, this.width, texto);
		this.asegurarEspacio(lineas.length * lineHeight);
		lineas.forEach((linea, i) => {
			this.page.drawText(linea, { x: this.x, y: this.y - lineHeight * 0.78 - i * lineHeight, size, font, color });
		});
		this.y -= lineas.length * lineHeight;
		return lineas.length;
	}

	parrafo(texto, font, size = 9.5, color = COLOR.ink, lineHeight = size * 1.4) {
		const lineas = wrapText(font, size, this.width, texto);
		for (const linea of lineas) {
			this.asegurarEspacio(lineHeight);
			this.page.drawText(linea, { x: this.x, y: this.y - lineHeight * 0.78, size, font, color });
			this.y -= lineHeight;
		}
		this.y -= 4;
	}

	bullet(texto, font, size = 8.8, markerColor = COLOR.green) {
		const indent = 12;
		const lineHeight = size * 1.4;
		const lineas = wrapText(font, size, this.width - indent, texto);
		lineas.forEach((linea, i) => {
			this.asegurarEspacio(lineHeight);
			if (i === 0) {
				this.page.drawRectangle({
					x: this.x,
					y: this.y - lineHeight * 0.78 + 1.5,
					width: 4,
					height: 4,
					color: markerColor,
				});
			}
			this.page.drawText(linea, { x: this.x + indent, y: this.y - lineHeight * 0.78, size, font, color: COLOR.ink });
			this.y -= lineHeight;
		});
	}

	espacio(px) {
		this.y -= px;
	}
}

/** Chips en la barra lateral. Ningún chip supera nunca anchoDisponible: los textos largos se parten en varias líneas/chips. */
function dibujarChips(page, items, x, anchoDisponible, yInicial, accent, font) {
	const size = 7.2;
	const paddingX = 6;
	const maxTextW = anchoDisponible - paddingX * 2;
	const chipsTexto = items.flatMap((raw) => wrapText(font, size, maxTextW, sanitize(raw)));

	let cx = x;
	let y = yInicial;
	const altoFila = 16;

	for (const texto of chipsTexto) {
		const textW = font.widthOfTextAtSize(texto, size);
		const chipW = Math.min(textW + paddingX * 2, anchoDisponible);

		if (cx !== x && cx + chipW > x + anchoDisponible) {
			cx = x;
			y -= altoFila;
		}

		page.drawRectangle({
			x: cx,
			y: y - 12,
			width: chipW,
			height: 14,
			color: accent,
			opacity: 0.12,
			borderColor: accent,
			borderWidth: 0.75,
			borderOpacity: 1,
		});
		page.drawText(texto, { x: cx + paddingX, y: y - 8.4, size, font, color: accent });

		cx += chipW + 5;
	}

	return y - altoFila;
}

/** Lista con viñetas en la barra lateral, envuelta a anchoDisponible (para frases largas tipo "Deporte"). */
function dibujarListaSidebar(page, items, x, anchoDisponible, yInicial, font, color) {
	const size = 7.6;
	const lineHeight = size * 1.35;
	const indent = 8;
	let y = yInicial;

	for (const raw of items) {
		const lineas = wrapText(font, size, anchoDisponible - indent, sanitize(raw));
		lineas.forEach((linea, i) => {
			if (i === 0) {
				page.drawRectangle({ x, y: y - 6.5, width: 3, height: 3, color });
			}
			page.drawText(linea, { x: x + indent, y: y - 6, size, font, color: COLOR.ink });
			y -= lineHeight;
		});
	}

	return y;
}

/**
 * Genera el PDF del CV a partir de los datos estructurados de cv.json.
 * @param {object} cv
 * @returns {Promise<Uint8Array>}
 */
export async function generarCvPdf(cv) {
	const pdfDoc = await PDFDocument.create();
	const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

	const page1 = pdfDoc.addPage([PAGE_W, PAGE_H]);
	const contact = cv.contact || {};

	// --- Cabecera ---
	// El QR ocupa la esquina superior derecha: el texto se envuelve antes de llegar a esa columna.
	const qrSize = 58;
	const qrPad = 6;
	const qrX = PAGE_W - MARGIN - qrSize;
	const headerMaxWidth = qrX - qrPad - 14 - MARGIN;

	page1.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: COLOR.navy });
	drawWrappedLine(page1, sanitize(contact.name), MARGIN, PAGE_H - 38, headerMaxWidth, 21, fontBold, COLOR.white);
	drawWrappedLine(page1, sanitize(contact.title), MARGIN, PAGE_H - 55, headerMaxWidth, 10.5, fontRegular, COLOR.blue);

	const lineaContacto = [contact.location, contact.phone, contact.email].filter(Boolean).join('   ·   ');
	drawWrappedLine(page1, sanitize(lineaContacto), MARGIN, PAGE_H - 72, headerMaxWidth, 8.8, fontRegular, COLOR.white);

	const lineaEnlaces = [contact.site, contact.github].filter(Boolean).join('   ·   ');
	drawWrappedLine(
		page1,
		sanitize(lineaEnlaces),
		MARGIN,
		PAGE_H - 85,
		headerMaxWidth,
		8,
		fontRegular,
		rgb(0.72, 0.78, 0.87),
	);

	if (contact.site) {
		const qrY = PAGE_H - HEADER_H + (HEADER_H - qrSize) / 2;
		page1.drawRectangle({
			x: qrX - qrPad,
			y: qrY - qrPad,
			width: qrSize + qrPad * 2,
			height: qrSize + qrPad * 2,
			color: COLOR.white,
		});
		dibujarQr(page1, contact.site, qrX, qrY, qrSize, COLOR.navy);

		const nota = 'Escanea la web';
		const notaSize = 6;
		const notaWidth = fontRegular.widthOfTextAtSize(nota, notaSize);
		page1.drawText(nota, {
			x: qrX + qrSize / 2 - notaWidth / 2,
			y: PAGE_H - HEADER_H + 3,
			size: notaSize,
			font: fontRegular,
			color: rgb(0.72, 0.78, 0.87),
		});
	}

	// --- Barra lateral ---
	page1.drawRectangle({ x: 0, y: 0, width: SIDEBAR_W, height: PAGE_H - HEADER_H, color: COLOR.sidebarBg });

	const sbX = 24;
	const sbW = SIDEBAR_W - sbX - 14;
	let sy = PAGE_H - HEADER_H - 26;

	function sidebarTitulo(texto) {
		page1.drawText(sanitize(texto).toUpperCase(), { x: sbX, y: sy - 9, size: 9, font: fontBold, color: COLOR.navy });
		sy -= 13;
		page1.drawLine({ start: { x: sbX, y: sy }, end: { x: sbX + sbW, y: sy }, thickness: 1, color: COLOR.blue });
		sy -= 12;
	}

	if (cv.skills?.length) {
		sidebarTitulo('Habilidades');
		for (const skill of cv.skills) {
			page1.drawText(sanitize(skill.name), { x: sbX, y: sy, size: 8.3, font: fontRegular, color: COLOR.ink });
			sy -= 9;
			const nivel = Math.max(0, Math.min(5, Number(skill.level) || 0));
			page1.drawRectangle({ x: sbX, y: sy - 4, width: sbW, height: 4, color: COLOR.track });
			page1.drawRectangle({ x: sbX, y: sy - 4, width: (sbW * nivel) / 5, height: 4, color: COLOR.blue });
			sy -= 12;
		}
		sy -= 4;
	}

	if (cv.languages?.length) {
		sidebarTitulo('Idiomas');
		for (const lang of cv.languages) {
			page1.drawText(sanitize(`${lang.name} - ${lang.level}`), {
				x: sbX,
				y: sy,
				size: 8.3,
				font: fontRegular,
				color: COLOR.ink,
			});
			sy -= 12.5;
		}
		sy -= 4;
	}

	if (cv.competencies?.length) {
		sidebarTitulo('Competencias clave');
		sy = dibujarChips(page1, cv.competencies, sbX, sbW, sy, COLOR.blue, fontRegular);
		sy -= 4;
	}

	if (cv.sport?.length) {
		sidebarTitulo('Deporte');
		sy = dibujarListaSidebar(page1, cv.sport, sbX, sbW, sy, fontRegular, COLOR.green);
		sy -= 4;
	}

	// --- Columna principal (con paginación automática) ---
	const mainX = SIDEBAR_W + GAP;
	const mainWidth = PAGE_W - mainX - MARGIN;
	const mainYInicial = PAGE_H - HEADER_H - 26;

	const crearPaginaNueva = () => {
		const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
		return { page, x: MARGIN, width: PAGE_W - MARGIN * 2, y: PAGE_H - MARGIN };
	};

	const col = new Columna(page1, mainX, mainWidth, mainYInicial, crearPaginaNueva);

	if (cv.profile) {
		col.titulo('Perfil', fontBold, COLOR.green);
		col.parrafo(cv.profile, fontRegular, 9.3);
	}

	// Altura estimada del primer elemento de un bloque, para no dejar el título de sección huérfano al paginar.
	const alturaMeta = (org, dates) => wrapText(fontItalic, 8.3, mainWidth, [org, dates].filter(Boolean).join('  ·  ')).length * 14;
	const alturaRole = (texto, size = 9.8) => wrapText(fontBold, size, mainWidth, texto).length * 13;

	if (cv.experience?.length) {
		const primero = cv.experience[0];
		const alturaPrimero = alturaRole(primero.role) + alturaMeta(primero.org, primero.dates) + (primero.bullets?.length ? 8.6 * 1.4 : 0);
		col.titulo('Experiencia', fontBold, COLOR.green, alturaPrimero);
		for (const exp of cv.experience) {
			col.lineaAncha(exp.role, fontBold, 9.8, COLOR.ink, 13);
			const meta = [exp.org, exp.dates].filter(Boolean).join('  ·  ');
			col.lineaAncha(meta, fontItalic, 8.3, COLOR.dim, 14);
			for (const bullet of exp.bullets || []) {
				col.bullet(bullet, fontRegular, 8.6, COLOR.green);
			}
			col.y -= 3;
		}
	}

	if (cv.education?.length) {
		const primero = cv.education[0];
		const alturaPrimero = alturaRole(primero.degree) + alturaMeta(primero.org, primero.dates) + (primero.bullets?.length ? 8.6 * 1.4 : 0);
		col.titulo('Educación', fontBold, COLOR.green, alturaPrimero);
		for (const edu of cv.education) {
			col.lineaAncha(edu.degree, fontBold, 9.8, COLOR.ink, 13);
			const meta = [edu.org, edu.dates].filter(Boolean).join('  ·  ');
			col.lineaAncha(meta, fontItalic, 8.3, COLOR.dim, 14);
			for (const bullet of edu.bullets || []) {
				col.bullet(bullet, fontRegular, 8.6, COLOR.green);
			}
			col.y -= 3;
		}
	}

	if (cv.certifications?.length) {
		col.titulo('Certificaciones', fontBold, COLOR.green, 8.8 * 1.4);
		for (const cert of cv.certifications) {
			col.bullet(cert, fontRegular, 8.8, COLOR.green);
		}
		col.y -= 6;
	}

	if (cv.projects?.length) {
		const primero = cv.projects[0];
		const alturaPrimero = alturaRole(primero.name, 9.5) + (primero.description ? 8.6 * 1.4 : 0);
		col.titulo('Proyectos', fontBold, COLOR.green, alturaPrimero);
		for (const proyecto of cv.projects) {
			col.lineaAncha(proyecto.name, fontBold, 9.5, COLOR.ink, 13.5);
			if (proyecto.description) {
				col.parrafo(proyecto.description, fontRegular, 8.6);
			}
		}
	}

	return pdfDoc.save();
}
