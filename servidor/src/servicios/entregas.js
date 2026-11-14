/**
 * servicios/entregas.js
 * ---------------------
 * Entregas de los estudiantes, revisión y calificación.
 *
 * Permisos que se comprueban aquí (no en el navegador):
 *   - Un estudiante solo ve y descarga SUS entregas.
 *   - Un estudiante no puede calificar ni cambiar estados.
 *   - Solo se entrega en tareas publicadas.
 *   - Después del límite no se entrega, salvo que el docente haya habilitado
 *     una nueva oportunidad (`permite_reapertura`).
 *   - Una entrega ya calificada no se puede reemplazar sin reapertura.
 */

import { ErrorHttp } from '../lib/http.js';
import { ahora } from '../bd/almacen.js';
import { nuevoId } from '../lib/seguridad.js';
import { guardarArchivo, leerArchivo, borrarArchivo, PERMITIDOS } from '../lib/archivos.js';
import {
  textoOpcional,
  numeroOpcionalEntre,
  fechaOpcional,
  areaObligatoria,
} from '../lib/validacion.js';
import { exigirDocente } from './usuarios.js';
import { crearNotificacion, TIPOS } from './notificaciones.js';

const ESTADOS = ['entregada', 'en_revision', 'calificada', 'fuera_de_plazo'];

const CONSULTA = `
  SELECT e.*, t.titulo AS tarea_titulo, t.area, t.puntaje_maximo, t.limite_en,
         t.permite_reapertura, t.publicada,
         u.nombre AS estudiante_nombre, u.usuario AS estudiante_usuario,
         f.nombre_original, f.mime, f.tamano
    FROM entregas e
    JOIN tareas t ON t.id = e.tarea_id
    JOIN usuarios u ON u.id = e.estudiante_id
    JOIN archivos f ON f.id = e.archivo_id`;

function mapEntrega(fila) {
  return {
    id: fila.id,
    tareaId: fila.tarea_id,
    tareaTitulo: fila.tarea_titulo,
    area: fila.area,
    puntajeMaximo: fila.puntaje_maximo,
    limiteEn: fila.limite_en,
    permiteReapertura: !!fila.permite_reapertura,
    estudianteId: fila.estudiante_id,
    estudianteNombre: fila.estudiante_nombre,
    estudianteUsuario: fila.estudiante_usuario,
    comentario: fila.comentario,
    estado: fila.estado,
    calificacion: fila.calificacion,
    observaciones: fila.observaciones,
    archivo: {
      id: fila.archivo_id,
      nombre: fila.nombre_original,
      mime: fila.mime,
      tamano: fila.tamano,
    },
    entregadaEn: fila.entregada_en,
    evaluadaEn: fila.evaluada_en,
    actualizadaEn: fila.actualizada_en,
  };
}

/** Lista entregas con filtros. El estudiante queda limitado a las suyas. */
export function listarEntregas({ almacen }, usuario, filtros = {}) {
  const condiciones = [];
  const params = [];

  if (usuario.rol !== 'docente') {
    condiciones.push('e.estudiante_id = ?');
    params.push(usuario.id);
  } else if (filtros.estudiante) {
    condiciones.push('e.estudiante_id = ?');
    params.push(String(filtros.estudiante));
  }

  if (filtros.area) {
    condiciones.push('t.area = ?');
    params.push(areaObligatoria(filtros.area));
  }
  if (filtros.tarea) {
    condiciones.push('e.tarea_id = ?');
    params.push(String(filtros.tarea));
  }
  if (filtros.estado && ESTADOS.includes(filtros.estado)) {
    condiciones.push('e.estado = ?');
    params.push(filtros.estado);
  }
  if (filtros.desde) {
    condiciones.push('e.entregada_en >= ?');
    params.push(fechaOpcional(filtros.desde, 'desde'));
  }
  if (filtros.hasta) {
    condiciones.push('e.entregada_en <= ?');
    params.push(fechaOpcional(filtros.hasta, 'hasta'));
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return almacen.todos(
    `${CONSULTA} ${where} ORDER BY e.entregada_en DESC`,
    ...params,
  ).map(mapEntrega);
}

/** Una entrega concreta, solo si el usuario tiene derecho a verla. */
export function obtenerEntrega({ almacen }, usuario, id) {
  const fila = almacen.uno(`${CONSULTA} WHERE e.id = ?`, id);
  if (!fila) throw new ErrorHttp(404, 'La entrega no existe.');

  if (usuario.rol !== 'docente' && fila.estudiante_id !== usuario.id) {
    throw new ErrorHttp(403, 'No puedes consultar entregas de otro estudiante.');
  }

  return mapEntrega(fila);
}

/**
 * Registra o reemplaza la entrega de un estudiante.
 * Devuelve la entrega guardada.
 */
export async function entregarTarea({ almacen, config }, usuario, tareaId, archivo, datos = {}) {
  if (usuario.rol !== 'estudiante') {
    throw new ErrorHttp(403, 'Solo un estudiante puede entregar una tarea.');
  }

  const tarea = almacen.uno('SELECT * FROM tareas WHERE id = ?', tareaId);
  if (!tarea) throw new ErrorHttp(404, 'La tarea no existe.');
  if (!tarea.publicada) throw new ErrorHttp(403, 'Esa tarea todavía no está publicada.');

  if (!archivo || !archivo.datos || !archivo.datos.length) {
    throw new ErrorHttp(400, 'Selecciona el archivo de tu entrega.');
  }

  const existente = almacen.uno(
    'SELECT * FROM entregas WHERE tarea_id = ? AND estudiante_id = ?',
    tareaId, usuario.id,
  );

  const vencida = tarea.limite_en !== null && Date.now() > Date.parse(tarea.limite_en);

  if (vencida && !tarea.permite_reapertura) {
    throw new ErrorHttp(409, 'La fecha límite ya pasó. Pide al docente que habilite una nueva oportunidad.');
  }
  if (existente && existente.estado === 'calificada' && !tarea.permite_reapertura) {
    throw new ErrorHttp(409, 'Tu entrega ya fue calificada. Pide al docente que habilite una nueva oportunidad.');
  }

  const filaArchivo = await guardarArchivo(almacen, {
    datos: archivo.datos,
    nombreOriginal: archivo.nombre,
    usuarioId: usuario.id,
    permitidas: PERMITIDOS.entregas,
    limiteBytes: config.tamanoMaximoMb * 1024 * 1024,
  });

  const momento = ahora();
  const estado = vencida ? 'fuera_de_plazo' : 'entregada';
  const comentario = textoOpcional(datos.comentario, 2000);

  if (existente) {
    almacen.ejecutar(
      `UPDATE entregas
          SET archivo_id = ?, comentario = ?, estado = ?, calificacion = NULL,
              observaciones = '', evaluada_en = NULL, entregada_en = ?, actualizada_en = ?
        WHERE id = ?`,
      filaArchivo.id, comentario, estado, momento, momento, existente.id,
    );
    await borrarArchivo(almacen, existente.archivo_id);
  } else {
    almacen.ejecutar(
      `INSERT INTO entregas
         (id, tarea_id, estudiante_id, archivo_id, comentario, estado,
          calificacion, observaciones, entregada_en, actualizada_en)
       VALUES (?, ?, ?, ?, ?, ?, NULL, '', ?, ?)`,
      nuevoId(), tareaId, usuario.id, filaArchivo.id, comentario, estado, momento, momento,
    );
  }

  crearNotificacion({ almacen }, {
    usuarioId: tarea.docente_id,
    tipo: TIPOS.ENTREGA_REGISTRADA,
    titulo: `${usuario.nombre} entregó «${tarea.titulo}»`,
    detalle: vencida ? 'Entrega registrada fuera de plazo.' : 'Entrega registrada dentro del plazo.',
    tareaId,
  });

  const guardada = almacen.uno(
    'SELECT id FROM entregas WHERE tarea_id = ? AND estudiante_id = ?',
    tareaId, usuario.id,
  );

  return obtenerEntrega({ almacen }, usuario, guardada.id);
}

/** Calificación y retroalimentación (solo docente). */
export function calificarEntrega({ almacen }, usuario, id, datos) {
  exigirDocente(usuario);

  const fila = almacen.uno(
    `SELECT e.*, t.titulo AS tarea_titulo, t.puntaje_maximo
       FROM entregas e JOIN tareas t ON t.id = e.tarea_id
      WHERE e.id = ?`,
    id,
  );
  if (!fila) throw new ErrorHttp(404, 'La entrega no existe.');

  const estado = ESTADOS.includes(datos.estado) ? datos.estado : fila.estado;
  const calificacion = datos.calificacion !== undefined
    ? numeroOpcionalEntre(datos.calificacion, 'calificación', 0, fila.puntaje_maximo)
    : fila.calificacion;
  const observaciones = datos.observaciones !== undefined
    ? textoOpcional(datos.observaciones, 4000)
    : fila.observaciones;

  if (estado === 'calificada' && calificacion === null) {
    throw new ErrorHttp(400, 'Para marcar la tarea como calificada asigna una nota.');
  }
  if (calificacion !== null && calificacion > fila.puntaje_maximo) {
    throw new ErrorHttp(400, `La nota no puede superar el puntaje máximo (${fila.puntaje_maximo}).`);
  }

  almacen.ejecutar(
    `UPDATE entregas
        SET estado = ?, calificacion = ?, observaciones = ?, evaluada_en = ?, actualizada_en = ?
      WHERE id = ?`,
    estado, calificacion, observaciones, ahora(), ahora(), id,
  );

  if (estado === 'calificada') {
    crearNotificacion({ almacen }, {
      usuarioId: fila.estudiante_id,
      tipo: TIPOS.TAREA_CALIFICADA,
      titulo: `Tu tarea «${fila.tarea_titulo}» fue calificada`,
      detalle: `Nota: ${calificacion} / ${fila.puntaje_maximo}. ${observaciones}`.trim(),
      tareaId: fila.tarea_id,
      entregaId: id,
    });
  } else if (estado === 'en_revision') {
    crearNotificacion({ almacen }, {
      usuarioId: fila.estudiante_id,
      tipo: TIPOS.CORRECCION,
      titulo: `El docente pidió correcciones en «${fila.tarea_titulo}»`,
      detalle: observaciones || 'Revisa las observaciones y vuelve a entregar.',
      tareaId: fila.tarea_id,
      entregaId: id,
    });
  }

  return obtenerEntrega({ almacen }, usuario, id);
}

/** Archivo de una entrega: solo el dueño o un docente. */
export async function archivoDeEntrega({ almacen }, usuario, id) {
  const fila = almacen.uno(
    `SELECT e.estudiante_id, f.*
       FROM entregas e
       JOIN archivos f ON f.id = e.archivo_id
      WHERE e.id = ?`,
    id,
  );
  if (!fila) throw new ErrorHttp(404, 'La entrega no existe.');

  if (usuario.rol !== 'docente' && fila.estudiante_id !== usuario.id) {
    throw new ErrorHttp(403, 'No puedes descargar la entrega de otro estudiante.');
  }

  return {
    datos: await leerArchivo(almacen, fila),
    nombre: fila.nombre_original,
    mime: fila.mime,
  };
}

/**
 * Historial de calificaciones.
 * - Estudiante: solo las suyas.
 * - Docente: todas, con el nombre del estudiante.
 */
export function listarCalificaciones({ almacen }, usuario, filtros = {}) {
  const condiciones = ["e.calificacion IS NOT NULL"];
  const params = [];

  if (usuario.rol !== 'docente') {
    condiciones.push('e.estudiante_id = ?');
    params.push(usuario.id);
  } else if (filtros.estudiante) {
    condiciones.push('e.estudiante_id = ?');
    params.push(String(filtros.estudiante));
  }

  if (filtros.area) {
    condiciones.push('t.area = ?');
    params.push(areaObligatoria(filtros.area));
  }

  const filas = almacen.todos(
    `${CONSULTA} WHERE ${condiciones.join(' AND ')} ORDER BY e.evaluada_en DESC`,
    ...params,
  );

  return filas.map(mapEntrega);
}
