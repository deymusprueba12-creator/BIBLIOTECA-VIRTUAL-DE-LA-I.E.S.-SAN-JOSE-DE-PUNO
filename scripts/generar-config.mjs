#!/usr/bin/env node
/**
 * Genera config.js para el frontend a partir de variables de entorno.
 *
 * Desde que la autenticación y los datos viven en el servidor (carpeta
 * servidor/), el frontend ya NO necesita hashes de contraseñas. Solo necesita:
 *   - API_URL      URL pública del API (por ejemplo https://api.midominio.org)
 *   - TAMANO_MAXIMO_MB  límite por archivo, para avisar antes de subir
 *
 * Las credenciales de demostración se configuran en servidor/.env y las valida
 * el servidor con scrypt. Este archivo no contiene secretos.
 *
 * config.js está en .gitignore y debe generarse en el despliegue.
 *
 * Uso:
 *   node scripts/generar-config.mjs
 *   API_URL=https://api.ejemplo.org node scripts/generar-config.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const RUTA_CONFIG = join(RAIZ, 'config.js');
const ARCHIVOS_ENV = [join(RAIZ, '.env'), join(RAIZ, 'servidor', '.env')];

const API_POR_DEFECTO = 'http://127.0.0.1:3000';
const MAX_MB_POR_DEFECTO = 25;

function leerArchivoEnv(ruta) {
  if (!existsSync(ruta)) return {};
  const valores = {};
  const contenido = readFileSync(ruta, 'utf8');

  contenido.split(/\r?\n/).forEach(function (linea) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) return;
    const separador = limpia.indexOf('=');
    if (separador < 1) return;
    const clave = limpia.slice(0, separador).trim();
    let valor = limpia.slice(separador + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    valores[clave] = valor;
  });

  return valores;
}

// El .env de la raíz manda; servidor/.env aporta el límite si no está definido.
const desdeArchivo = Object.assign({}, ...ARCHIVOS_ENV.map(leerArchivoEnv));

function valor(nombre, porDefecto) {
  const bruto = process.env[nombre] || desdeArchivo[nombre] || '';
  const limpio = String(bruto).trim();
  return limpio || porDefecto;
}

const apiUrl = valor('API_URL', API_POR_DEFECTO).replace(/\/+$/, '');
const maxMb = Number(valor('TAMANO_MAXIMO_MB', MAX_MB_POR_DEFECTO));

if (!/^https?:\/\//i.test(apiUrl)) {
  console.error('API_URL debe empezar por http:// o https:// (valor recibido: ' + apiUrl + ').');
  process.exit(1);
}
if (!Number.isFinite(maxMb) || maxMb <= 0) {
  console.error('TAMANO_MAXIMO_MB debe ser un número mayor que cero.');
  process.exit(1);
}

const salida = '/* Archivo generado por scripts/generar-config.mjs. No editar a mano.\n' +
  '   Solo contiene la URL pública del API y el límite de subida.\n' +
  '   No incluye credenciales ni secretos. */\n' +
  'window.HEMEROTECA_CONFIG = Object.freeze({\n' +
  "  apiUrl: '" + apiUrl + "',\n" +
  '  maxMb: ' + maxMb + '\n' +
  '});\n';

writeFileSync(RUTA_CONFIG, salida, 'utf8');
console.log('config.js generado correctamente.');
console.log('API: ' + apiUrl);
console.log('Límite por archivo: ' + maxMb + ' MB');
console.log('Archivo: ' + RUTA_CONFIG);
