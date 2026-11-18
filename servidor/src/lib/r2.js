/**
 * lib/r2.js
 * ---------
 * Cliente opcional para Cloudflare R2 (API S3).
 * Si las variables de entorno están completas, los archivos se guardan en R2.
 * Si no existen, la aplicación sigue usando el disco local para desarrollo.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { ErrorHttp } from './http.js';

const VARIABLES = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];

let cliente = null;

/** Devuelve la configuración R2 validada, o null cuando R2 no está configurado. */
export function configuracionR2() {
  const valores = Object.fromEntries(VARIABLES.map((nombre) => [nombre, String(process.env[nombre] || '').trim()]));
  const definidos = VARIABLES.filter((nombre) => valores[nombre]);

  if (definidos.length === 0) return null;
  if (definidos.length !== VARIABLES.length) {
    const faltantes = VARIABLES.filter((nombre) => !valores[nombre]);
    throw new ErrorHttp(502, `Cloudflare R2 está configurado de forma incompleta. Faltan: ${faltantes.join(', ')}.`);
  }

  return {
    accountId: valores.R2_ACCOUNT_ID,
    accessKeyId: valores.R2_ACCESS_KEY_ID,
    secretAccessKey: valores.R2_SECRET_ACCESS_KEY,
    bucket: valores.R2_BUCKET_NAME,
    endpoint: `https://${valores.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    publicBaseUrl: String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, ''),
  };
}

/** true cuando están las cuatro variables necesarias. */
export function r2Configurado() {
  return configuracionR2() !== null;
}

/** Cliente S3 perezoso, con el endpoint de Cloudflare R2. */
export function obtenerClienteR2() {
  const config = configuracionR2();
  if (!config) return null;
  if (!cliente) {
    cliente = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return cliente;
}

/** URL pública para leer un objeto. Permite personalizarla con R2_PUBLIC_BASE_URL. */
export function urlPublicaR2(key) {
  const config = configuracionR2();
  if (!config) return null;
  const base = config.publicBaseUrl || `${config.endpoint}/${encodeURIComponent(config.bucket)}`;
  const clave = String(key).split('/').map(encodeURIComponent).join('/');
  return `${base}/${clave}`;
}

/** Sube un archivo a R2 y devuelve su URL pública. */
export async function subirArchivoR2(datos, { key, contentType, nombreOriginal }) {
  const config = configuracionR2();
  const s3 = obtenerClienteR2();
  if (!config || !s3) {
    throw new ErrorHttp(502, 'Cloudflare R2 no está configurado.');
  }

  try {
    await s3.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: datos,
      ContentType: contentType || 'application/octet-stream',
      ContentLength: datos.length,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: {
        nombre_original: String(nombreOriginal || 'archivo').slice(0, 1024),
      },
    }));
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    throw new ErrorHttp(502, `No se pudo subir el archivo a Cloudflare R2: ${detalle}`);
  }

  return urlPublicaR2(key);
}

/** Elimina un objeto de R2. No revela si ya no existía. */
export async function borrarArchivoR2(key) {
  const config = configuracionR2();
  const s3 = obtenerClienteR2();
  if (!config || !s3) return;

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch {
    // Si ya no está, consideramos que la limpieza terminó.
  }
}
