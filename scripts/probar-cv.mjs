import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generarCvPdf } from '../functions/api/_generar-cv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cv = JSON.parse(readFileSync(path.join(__dirname, '../src/data/cv.json'), 'utf-8'));

const pdfBytes = await generarCvPdf(cv);
const outPath = path.join(__dirname, '../cv-test.pdf');
writeFileSync(outPath, pdfBytes);
console.log(`PDF generado: ${outPath} (${pdfBytes.length} bytes)`);
