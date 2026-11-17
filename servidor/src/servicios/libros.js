/**
 * servicios/libros.js
 * -------------------
 * Biblioteca de libros clasificados por área curricular.
 *
 * - Solo un docente puede crear, editar o eliminar libros.
 * - Un estudiante solo ve y descarga libros publicados.
 * - Se rechazan duplicados exactos (mismo SHA-256 ya registrado).
 */

import { createHash } from 'node:crypto';
import { ErrorHttp } from '../lib/http.js';
import { ahora } from '../bd/almacen.js';
import { nuevoId } from '../lib/seguridad.js';
import { guardarArchivo, leerArchivo, borrarArchivo, PERMITIDOS } from '../lib/archivos.js';
import {
  textoObligatorio,
  textoOpcional,
  areaObligatoria,
  booleano,
  numeroEntre,
} from '../lib/validacion.js';
import { exigirDocente } from './usuarios.js';

function mapLibro(fila) {
  return {
    id: fila.id,
    titulo: fila.titulo,
    autor: fila.autor,
    descripcion: fila.descripcion,
    area: fila.area,
    clasificacion: fila.clasificacion,
    confianza: fila.confianza,
    publicado: !!fila.publicado,
    docenteId: fila.docente_id,
    archivo: fila.archivo_id
      ? {
          id: fila.archivo_id,
          nombre: fila.nombre_original,
          mime: fila.mime,
          tamano: fila.tamano,
        }
      : null,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

const CONSULTA = `
  SELECT l.*, a.nombre_original, a.mime, a.tamano, a.sha256
    FROM libros l
    LEFT JOIN archivos a ON a.id = l.archivo_id`;

/** Lista libros con filtros de área, texto y autor. */
export function listarLibros({ almacen }, usuario, { area, q, autor } = {}) {
  const condiciones = [];
  const params = [];

  // Un estudiante (o una petición sin sesión) solo ve lo publicado.
  if (!usuario || usuario.rol !== 'docente') condiciones.push('l.publicado = 1');

  if (area) {
    condiciones.push('l.area = ?');
    params.push(areaObligatoria(area));
  }
  if (autor) {
    condiciones.push('l.autor LIKE ?');
    params.push(`%${String(autor).trim()}%`);
  }
  if (q) {
    condiciones.push('(l.titulo LIKE ? OR l.autor LIKE ? OR l.descripcion LIKE ?)');
    const patron = `%${String(q).trim()}%`;
    params.push(patron, patron, patron);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = almacen.todos(
    `${CONSULTA} ${where} ORDER BY l.creado_en DESC`,
    ...params,
  );

  return filas.map(mapLibro);
}

/** Devuelve un libro o lanza 404 (y 403 si un estudiante pide uno sin publicar). */
export function obtenerLibro({ almacen }, usuario, id) {
  const fila = almacen.uno(`${CONSULTA} WHERE l.id = ?`, id);
  if (!fila) throw new ErrorHttp(404, 'El libro no existe.');
  if (!fila.publicado && (!usuario || usuario.rol !== 'docente')) {
    throw new ErrorHttp(403, 'Ese libro no está publicado.');
  }
  return mapLibro(fila);
}

/**
 * Crea un libro y guarda su archivo.
 * @param {object} datos campos del formulario
 * @param {{datos: Buffer, nombre: string}|null} archivo
 */
export async function crearLibro({ almacen, config, eventos }, usuario, datos, archivo) {
  exigirDocente(usuario);

  const titulo = textoObligatorio(datos.titulo, 'título', 300);
  const area = areaObligatoria(datos.area);
  const clasificacion = datos.clasificacion === 'auto' ? 'auto' : 'manual';
  const confianza = datos.confianza === undefined
    ? 0
    : numeroEntre(datos.confianza, 'confianza', 0, 100);

  if (!archivo || !archivo.datos || !archivo.datos.length) {
    throw new ErrorHttp(400, 'Selecciona el archivo del libro.');
  }

  // Duplicado exacto: mismo contenido ya registrado en la biblioteca.
  const sha = createHash('sha256').update(archivo.datos).digest('hex');
  const duplicado = almacen.uno(
    `SELECT l.titulo
       FROM libros l
       JOIN archivos a ON a.id = l.archivo_id
      WHERE a.sha256 = ?
      LIMIT 1`,
    sha,
  );
  if (duplicado) {
    throw new ErrorHttp(409, `Ese archivo ya está en la biblioteca como «${duplicado.titulo}».`);
  }

  const filaArchivo = await guardarArchivo(almacen, {
    datos: archivo.datos,
    nombreOriginal: archivo.nombre,
    usuarioId: usuario.id,
    permitidas: PERMITIDOS.libros,
    limiteBytes: config.tamanoMaximoMb * 1024 * 1024,
  });

  const id = nuevoId();
  const momento = ahora();

  try {
    almacen.ejecutar(
      `INSERT INTO libros
         (id, titulo, autor, descripcion, area, archivo_id, clasificacion,
          confianza, publicado, docente_id, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      titulo,
      textoOpcional(datos.autor, 160),
      textoOpcional(datos.descripcion, 4000),
      area,
      filaArchivo.id,
      clasificacion,
      confianza,
      booleano(datos.publicado, true) ? 1 : 0,
      usuario.id,
      momento,
      momento,
    );
  } catch (err) {
    // Si falla la inserción, no dejamos el archivo huérfano en disco.
    await borrarArchivo(almacen, filaArchivo.id);
    throw err;
  }

  eventos?.emitir('biblioteca');
  return obtenerLibro({ almacen }, usuario, id);
}

/** Actualiza metadatos y/o la clasificación de un libro. */
export function actualizarLibro({ almacen, eventos }, usuario, id, cambios) {
  exigirDocente(usuario);

  const fila = almacen.uno('SELECT * FROM libros WHERE id = ?', id);
  if (!fila) throw new ErrorHttp(404, 'El libro no existe.');

  const titulo = cambios.titulo !== undefined
    ? textoObligatorio(cambios.titulo, 'título', 300)
    : fila.titulo;
  const autor = cambios.autor !== undefined
    ? textoOpcional(cambios.autor, 160)
    : fila.autor;
  const descripcion = cambios.descripcion !== undefined
    ? textoOpcional(cambios.descripcion, 4000)
    : fila.descripcion;
  const area = cambios.area !== undefined ? areaObligatoria(cambios.area) : fila.area;
  const publicado = cambios.publicado !== undefined
    ? (booleano(cambios.publicado, true) ? 1 : 0)
    : fila.publicado;

  // Si el docente corrige el área, la clasificación pasa a manual.
  const cambioArea = cambios.area !== undefined && area !== fila.area;
  const clasificacion = cambioArea
    ? 'manual'
    : (cambios.clasificacion === 'auto' || cambios.clasificacion === 'manual'
        ? cambios.clasificacion
        : fila.clasificacion);
  const confianza = cambioArea ? 0 : fila.confianza;

  almacen.ejecutar(
    `UPDATE libros
        SET titulo = ?, autor = ?, descripcion = ?, area = ?, publicado = ?,
            clasificacion = ?, confianza = ?, actualizado_en = ?
      WHERE id = ?`,
    titulo, autor, descripcion, area, publicado, clasificacion, confianza, ahora(), id,
  );

  eventos?.emitir('biblioteca');
  return obtenerLibro({ almacen }, usuario, id);
}

/** Elimina un libro y su archivo. */
export async function eliminarLibro({ almacen, eventos }, usuario, id) {
  exigirDocente(usuario);

  const fila = almacen.uno('SELECT * FROM libros WHERE id = ?', id);
  if (!fila) throw new ErrorHttp(404, 'El libro no existe.');

  almacen.ejecutar('DELETE FROM libros WHERE id = ?', id);
  if (fila.archivo_id) await borrarArchivo(almacen, fila.archivo_id);
  eventos?.emitir('biblioteca');
}

/** Descarga el archivo de un libro con comprobación de permisos. */
export async function archivoDeLibro({ almacen }, usuario, id) {
  const fila = almacen.uno(
    `SELECT l.publicado, a.*
       FROM libros l
       JOIN archivos a ON a.id = l.archivo_id
      WHERE l.id = ?`,
    id,
  );

  if (!fila) throw new ErrorHttp(404, 'El libro no tiene archivo disponible.');
  if (!fila.publicado && (!usuario || usuario.rol !== 'docente')) {
    throw new ErrorHttp(403, 'Ese libro no está publicado.');
  }

  return {
    datos: await leerArchivo(almacen, fila),
    nombre: fila.nombre_original,
    mime: fila.mime,
  };
}
