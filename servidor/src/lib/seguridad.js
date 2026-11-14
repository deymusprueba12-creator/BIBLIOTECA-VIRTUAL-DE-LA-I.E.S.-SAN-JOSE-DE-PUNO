/**
 * lib/seguridad.js
 * ----------------
 * Criptografía y utilidades de identificación. Solo `node:crypto`.
 *
 * - scrypt para las contraseñas (sal aleatoria por usuario).
 * - tokens de sesión opacos de 256 bits.
 * - comparación en tiempo constante.
 */

import {
  scrypt as _scrypt,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);

const OPCIONES_SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LONGITUD_HASH = 64;

/** Genera el hash y la sal de una contraseña. */
export async function hashearContrasena(contrasena) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(String(contrasena).normalize('NFKC'), salt, LONGITUD_HASH, OPCIONES_SCRYPT);
  return { hash: hash.toString('hex'), salt };
}

/** Verifica una contraseña contra el hash guardado. */
export async function verificarContrasena(contrasena, hash, salt) {
  if (typeof hash !== 'string' || typeof salt !== 'string' || !hash || !salt) return false;
  const calculado = await scrypt(String(contrasena).normalize('NFKC'), salt, LONGITUD_HASH, OPCIONES_SCRYPT);
  const esperado = Buffer.from(hash, 'hex');
  if (esperado.length !== calculado.length) return false;
  return timingSafeEqual(esperado, calculado);
}

/** Token de sesión aleatorio de 256 bits. */
export function generarToken() {
  return randomBytes(32).toString('hex');
}

/** Identificador único para filas. */
export function nuevoId() {
  return randomUUID();
}

/** Comparación en tiempo constante de dos cadenas. */
export function iguales(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Comparación ficticia para que el tiempo no revele la longitud.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
