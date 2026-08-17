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

	titulo(texto, font, underline) {
		this.asegurarEspacio(30);
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

	parrafo(texto, font, size = 9.5, color = COLOR.ink, lineHeight = size * 1.4) {
		const lineas = wrapText(font, size, this.width, texto);
		for (const linea of lineas) {
			this.asegurarEspacio(lineHeight);
			this.page.drawText(linea, { x: this.x, y: this.y - lineHeight * 0.78, size, font, color });
			this.y -= lineHeight;
		}
		this.y -= 6;
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

function dibujarChips(page, items, x, anchoDisponible, yInicial, accent, font) {
	let cx = x;
	let y = yInicial;
	const altoFila = 16;
	const paddingX = 6;

	for (const raw of items) {
		const texto = sanitize(raw);
		const size = 7.2;
		const textW = font.widthOfTextAtSize(texto, size);
		const chipW = textW + paddingX * 2;

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
	page1.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: COLOR.navy });
	page1.drawText(sanitize(contact.name), { x: MARGIN, y: PAGE_H - 38, size: 21, font: fontBold, color: COLOR.white });
	page1.drawText(sanitize(contact.title), { x: MARGIN, y: PAGE_H - 55, size: 10.5, font: fontRegular, color: COLOR.blue });

	const lineaContacto = [contact.location, contact.phone, contact.email].filter(Boolean).join('   ·   ');
	page1.drawText(sanitize(lineaContacto), { x: MARGIN, y: PAGE_H - 72, size: 8.8, font: fontRegular, color: COLOR.white });

	const lineaEnlaces = [contact.site, contact.github].filter(Boolean).join('   ·   ');
	page1.drawText(sanitize(lineaEnlaces), {
		x: MARGIN,
		y: PAGE_H - 85,
		size: 8,
		font: fontRegular,
		color: rgb(0.72, 0.78, 0.87),
	});

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
		sy = dibujarChips(page1, cv.sport, sbX, sbW, sy, COLOR.green, fontRegular);
		sy -= 4;
	}

	if (contact.site) {
		const qrSize = 72;
		const qrY = sy - qrSize;
		if (qrY > 14) {
			dibujarQr(page1, contact.site, sbX, qrY, qrSize, COLOR.navy);
			const nota = 'Escanea para visitar la web';
			page1.drawText(nota, {
				x: sbX,
				y: qrY - 10,
				size: 6.3,
				font: fontRegular,
				color: COLOR.dim,
			});
		}
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

	if (cv.experience?.length) {
		col.titulo('Experiencia', fontBold, COLOR.green);
		for (const exp of cv.experience) {
			col.asegurarEspacio(38);
			col.page.drawText(sanitize(exp.role), { x: col.x, y: col.y - 10, size: 9.8, font: fontBold, color: COLOR.ink });
			col.y -= 13;
			const meta = [exp.org, exp.dates].filter(Boolean).join('  ·  ');
			col.page.drawText(sanitize(meta), { x: col.x, y: col.y - 8, size: 8.3, font: fontItalic, color: COLOR.dim });
			col.y -= 14;
			for (const bullet of exp.bullets || []) {
				col.bullet(bullet, fontRegular, 8.6, COLOR.green);
			}
			col.y -= 6;
		}
	}

	if (cv.education?.length) {
		col.titulo('Educación', fontBold, COLOR.green);
		for (const edu of cv.education) {
			col.asegurarEspacio(38);
			col.page.drawText(sanitize(edu.degree), { x: col.x, y: col.y - 10, size: 9.8, font: fontBold, color: COLOR.ink });
			col.y -= 13;
			const meta = [edu.org, edu.dates].filter(Boolean).join('  ·  ');
			col.page.drawText(sanitize(meta), { x: col.x, y: col.y - 8, size: 8.3, font: fontItalic, color: COLOR.dim });
			col.y -= 14;
			for (const bullet of edu.bullets || []) {
				col.bullet(bullet, fontRegular, 8.6, COLOR.green);
			}
			col.y -= 6;
		}
	}

	if (cv.certifications?.length) {
		col.titulo('Certificaciones', fontBold, COLOR.green);
		for (const cert of cv.certifications) {
			col.bullet(cert, fontRegular, 8.8, COLOR.green);
		}
		col.y -= 6;
	}

	if (cv.projects?.length) {
		col.titulo('Proyectos', fontBold, COLOR.green);
		for (const proyecto of cv.projects) {
			col.asegurarEspacio(24);
			col.page.drawText(sanitize(proyecto.name), { x: col.x, y: col.y - 10, size: 9.5, font: fontBold, color: COLOR.ink });
			col.y -= 14;
			if (proyecto.description) {
				col.parrafo(proyecto.description, fontRegular, 8.6);
			}
		}
	}

	return pdfDoc.save();
}
