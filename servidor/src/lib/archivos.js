/**
 * lib/archivos.js
 * ---------------
 * Validación y almacenamiento de archivos en disco.
 *
 * El tipo real se comprueba por los primeros bytes (número mágico) y no por
 * la extensión ni por el Content-Type declarado, que el cliente puede falsear.
 * En disco siempre se usa un nombre aleatorio: nunca el nombre original.
 */

import { writeFile, readFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ErrorHttp } from './http.js';
import { nuevoId } from './seguridad.js';
import { ahora } from '../bd/almacen.js';

const TIPOS = [
  {
    mime: 'application/pdf',
    extensiones: ['pdf'],
    magicos: [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensiones: ['docx'],
    magicos: [Buffer.from([0x50, 0x4b, 0x03, 0x04])], // ZIP
  },
  {
    mime: 'application/msword',
    extensiones: ['doc'],
    magicos: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])], // CFB
  },
  {
    mime: 'image/jpeg',
    extensiones: ['jpg', 'jpeg'],
    magicos: [Buffer.from([0xff, 0xd8, 0xff])],
  },
  {
    mime: 'image/png',
    extensiones: ['png'],
    magicos: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  },
];

/** Extensiones aceptadas en cada contexto. */
export const PERMITIDOS = Object.freeze({
  libros: ['pdf', 'doc', 'docx'],
  tareas: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
  entregas: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
});

function extensionDe(nombre) {
  const coincidencia = /\.([A-Za-z0-9]+)$/.exec(String(nombre || ''));
  return coincidencia ? coincidencia[1].toLowerCase() : '';
}

/** Devuelve el tipo detectado por número mágico, o null. */
export function detectarTipo(datos) {
  if (!datos || datos.length < 4) return null;
  for (const tipo of TIPOS) {
    for (const magico of tipo.magicos) {
      if (datos.length >= magico.length && datos.subarray(0, magico.length).equals(magico)) {
        return tipo;
      }
    }
  }
  return null;
}

/** Describe el error de un archivo no válido sin revelar rutas internas. */
function errorDeFormato(extension) {
  const lista = extension ? `.${extension}` : 'desconocido';
  return new ErrorHttp(
    415,
    `El archivo ${lista} no es válido. Se aceptan PDF, DOC, DOCX, JPG y PNG con contenido real.`,
  );
}

/**
 * Valida y guarda un archivo.
 * @returns {Promise<object>} fila de la tabla `archivos`
 */
export async function guardarArchivo(almacen, {
  datos,
  nombreOriginal,
  usuarioId,
  permitidas,
  limiteBytes,
}) {
  if (!datos || !datos.length) {
    throw new ErrorHttp(400, 'El archivo está vacío.');
  }
  if (datos.length > limiteBytes) {
    throw new ErrorHttp(413, `El archivo supera el límite de ${Math.round(limiteBytes / 1024 / 1024)} MB.`);
  }

  const extension = extensionDe(nombreOriginal);
  const tipo = detectarTipo(datos);

  if (!tipo || !tipo.extensiones.includes(extension) || !permitidas.includes(extension)) {
    throw errorDeFormato(extension);
  }

  const id = nuevoId();
  const ruta = `${id}.${extension}`;

  await writeFile(join(almacen.rutaArchivos, ruta), datos);

  const fila = {
    id,
    nombre_original: String(nombreOriginal || 'archivo').slice(0, 255),
    mime: tipo.mime,
    extension,
    tamano: datos.length,
    sha256: createHash('sha256').update(datos).digest('hex'),
    ruta,
    subido_por: usuarioId || null,
    creado_en: ahora(),
  };

  almacen.ejecutar(
    `INSERT INTO archivos
       (id, nombre_original, mime, extension, tamano, sha256, ruta, subido_por, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    fila.id, fila.nombre_original, fila.mime, fila.extension, fila.tamano,
    fila.sha256, fila.ruta, fila.subido_por, fila.creado_en,
  );

  return fila;
}

/** Lee el binario de un archivo registrado. */
export async function leerArchivo(almacen, fila) {
  if (!fila) throw new ErrorHttp(404, 'El archivo no existe.');
  try {
    return await readFile(join(almacen.rutaArchivos, fila.ruta));
  } catch {
    throw new ErrorHttp(404, 'El archivo ya no está disponible en el servidor.');
  }
}

/** Elimina un archivo del disco y de la base de datos. */
export async function borrarArchivo(almacen, archivoId) {
  const fila = almacen.uno('SELECT * FROM archivos WHERE id = ?', archivoId);
  if (!fila) return;

  almacen.ejecutar('DELETE FROM archivos WHERE id = ?', archivoId);
  try {
    await unlink(join(almacen.rutaArchivos, fila.ruta));
  } catch {
    // Si el archivo ya no estaba, la fila igual queda eliminada.
  }
}
