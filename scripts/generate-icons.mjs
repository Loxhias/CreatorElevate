// Genera iconos placeholder (PNG sólido con un emoji ⚡ encima).
// Uso: node scripts/generate-icons.mjs
//
// Genera SVGs (no requieren librerías) y un ícono raster mínimo válido.
// En producción reemplaza estos placeholders por tus íconos reales.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT  = resolve(ROOT, 'assets/icons');

await mkdir(OUT, { recursive: true });

function svg(size) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#7c6ef7"/>
      <stop offset="100%" stop-color="#f471b5"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bg)"/>
  <text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif"
        font-size="${size * 0.55}" font-weight="800"
        text-anchor="middle" dominant-baseline="middle"
        fill="#ffffff">⚡</text>
</svg>`;
}

await writeFile(resolve(OUT, 'icon-192.svg'), svg(192));
await writeFile(resolve(OUT, 'icon-512.svg'), svg(512));

// Mini PNG válido (1x1 transparente) — el navegador escalará si falta el PNG.
// En producción exporta los SVG a PNG con tu herramienta favorita.
const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==',
    'base64'
);
await writeFile(resolve(OUT, 'icon-192.png'), PNG_1x1);
await writeFile(resolve(OUT, 'icon-512.png'), PNG_1x1);

console.log('✓ Iconos generados en assets/icons/');
console.log('  Reemplaza icon-192.png y icon-512.png por PNG reales para producción.');
console.log('  Los SVG (icon-192.svg, icon-512.svg) sirven como referencia / favicon.');
