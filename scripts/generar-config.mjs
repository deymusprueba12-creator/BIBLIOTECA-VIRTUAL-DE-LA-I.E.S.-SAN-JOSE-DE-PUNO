#!/usr/bin/env node
/**
 * Genera config.js a partir de las variables de entorno (.env o variables del
 * sistema, por ejemplo GitHub Actions Secrets).
 *
 * El archivo generado SOLO contiene hashes; nunca las contraseñas en texto
 * plano. config.js está en .gitignore y no debe publicarse en el repositorio.
 *
 * Uso:
 *   node scripts/generar-config.mjs
 *   DOCENTE_USUARIO=... DOCENTE_PASSWORD=... node scripts/generar-config.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const RUTA_ENV = join(RAIZ, '.env');
const RUTA_CONFIG = join(RAIZ, 'config.js');

const VARIABLES = [
  'DOCENTE_USUARIO',
  'DOCENTE_PASSWORD',
  'ESTUDIANTE_USUARIO',
  'ESTUDIANTE_PASSWORD'
];

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

function sha256(texto) {
  return createHash('sha256').update(String(texto), 'utf8').digest('hex');
}

/** Copia exacta del respaldo de script.js para contextos sin crypto.subtle. */
function hashRespaldo(cadena) {
  let h1 = 0xdeadbeef ^ cadena.length;
  let h2 = 0x41c6ce57 ^ cadena.length;
  for (let i = 0; i < cadena.length; i++) {
    const ch = cadena.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ('00000000' + (h2 >>> 0).toString(16)).slice(-8) +
         ('00000000' + (h1 >>> 0).toString(16)).slice(-8);
}

const desdeArchivo = leerArchivoEnv(RUTA_ENV);
const valores = {};

VARIABLES.forEach(function (nombre) {
  const valor = process.env[nombre] || desdeArchivo[nombre] || '';
  valores[nombre] = String(valor).trim();
});

const faltantes = VARIABLES.filter(function (nombre) { return !valores[nombre]; });
if (faltantes.length) {
  console.error('Faltan variables de entorno: ' + faltantes.join(', '));
  console.error('Copia .env.example a .env y completa los valores de demostración,');
  console.error('o define esas variables en el entorno (por ejemplo, GitHub Secrets).');
  process.exit(1);
}

const placeholders = VARIABLES.filter(function (nombre) {
  return valores[nombre].startsWith('cambia_');
});
if (placeholders.length) {
  console.error('Reemplaza los valores de ejemplo en .env: ' + placeholders.join(', '));
  process.exit(1);
}

if (valores.DOCENTE_USUARIO === valores.ESTUDIANTE_USUARIO) {
  console.warn('Aviso: docentes y estudiantes usan el mismo usuario. Usa usuarios distintos.');
}

function bloque(rol, usuario, password) {
  return '  ' + rol + ': Object.freeze({\n' +
    "    usuarioHash: '" + sha256(usuario) + "',\n" +
    "    passwordHash: '" + sha256(password) + "',\n" +
    "    usuarioRespaldo: '" + hashRespaldo(usuario) + "',\n" +
    "    passwordRespaldo: '" + hashRespaldo(password) + "'\n" +
    '  })';
}

const salida = '/* Archivo generado por scripts/generar-config.mjs. No editar a mano.\n' +
  '   Contiene únicamente hashes; no incluye contraseñas en texto plano.\n' +
  '   No lo subas al repositorio: está en .gitignore. */\n' +
  'window.HEMEROTECA_AUTH = Object.freeze({\n' +
  bloque('docente', valores.DOCENTE_USUARIO, valores.DOCENTE_PASSWORD) + ',\n' +
  bloque('estudiante', valores.ESTUDIANTE_USUARIO, valores.ESTUDIANTE_PASSWORD) + '\n' +
  '});\n';

writeFileSync(RUTA_CONFIG, salida, 'utf8');
console.log('config.js generado correctamente (solo hashes SHA-256).');
console.log('Archivo: ' + RUTA_CONFIG);
