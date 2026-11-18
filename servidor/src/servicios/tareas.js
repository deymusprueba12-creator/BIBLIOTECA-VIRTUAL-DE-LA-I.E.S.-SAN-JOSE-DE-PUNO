/**
 * servicios/tareas.js
 * -------------------
 * Tareas y actividades académicas, con adjuntos y publicación programada.
 *
 * Reglas:
 *   - Solo el docente crea, edita, publica o elimina tareas.
 *   - El estudiante solo ve tareas publicadas.
 *   - Los adjuntos de una tarea no publicada no se pueden descargar.
 */

import { ErrorHttp } from '../lib/http.js';
import { ahora } from '../bd/almacen.js';
import { nuevoId } from '../lib/seguridad.js';
import { guardarArchivo, resolverArchivo, borrarArchivo, PERMITIDOS } from '../lib/archivos.js';
import {
  textoObligatorio,
  textoOpcional,
  areaObligatoria,
  booleano,
  numeroEntre,
  fechaOpcional,
} from '../lib/validacion.js';
import { exigirDocente } from './usuarios.js';
import { crearNotificacion, notificarEstudiantes, avisarProximosVencimientos, TIPOS } from './notificaciones.js';

const CAMPOS = `
  t.*, d.nombre AS docente_nombre,
  (SELECT COUNT(*) FROM tarea_adjuntos a WHERE a.tarea_id = t.id) AS adjuntos_total,
  (SELECT COUNT(*) FROM entregas e WHERE e.tarea_id = t.id) AS entregas_total,
  (SELECT COUNT(*) FROM entregas e
    WHERE e.tarea_id = t.id AND e.estado IN ('entregada', 'fuera_de_plazo')) AS entregas_revisar`;

/** Columnas y unión extra que solo necesita el estudiante (su propia entrega). */
const CAMPOS_MI = `
  , me.id AS mi_entrega_id, me.estado AS mi_estado,
    me.calificacion AS mi_calificacion, me.observaciones AS mi_observaciones,
    me.entregada_en AS mi_entregada_en, mf.nombre_original AS mi_archivo_nombre`;

const JOIN_MI = `
  LEFT JOIN entregas me ON me.tarea_id = t.id AND me.estudiante_id = ?
  LEFT JOIN archivos mf ON mf.id = me.archivo_id`;

/** Consulta base según el rol. El estudiante recibe también su entrega. */
function sqlTarea(esDocente) {
  return `SELECT ${CAMPOS} ${esDocente ? '' : CAMPOS_MI}
            FROM tareas t
            JOIN usuarios d ON d.id = t.docente_id
            ${esDocente ? '' : JOIN_MI}`;
}

function mapTarea(fila, usuario) {
  const esDocente = usuario && usuario.rol === 'docente';
  const limite = fila.limite_en ? Date.parse(fila.limite_en) : null;
  const vencida = limite !== null && Date.now() > limite;

  let estado = null;
  if (!esDocente) {
    estado = fila.mi_estado || (vencida ? 'fuera_de_plazo' : 'pendiente');
  }

  return {
    id: fila.id,
    titulo: fila.titulo,
    area: fila.area,
    instrucciones: fila.instrucciones,
    indicaciones: fila.indicaciones,
    publicada: !!fila.publicada,
    publicadaEn: fila.publicada_en,
    fechaPublicacion: fila.fecha_publicacion,
    limiteEn: fila.limite_en,
    puntajeMaximo: fila.puntaje_maximo,
    permiteReapertura: !!fila.permite_reapertura,
    docenteId: fila.docente_id,
    docenteNombre: fila.docente_nombre,
    adjuntosTotal: fila.adjuntos_total || 0,
    adjuntos: [],
    entregasTotal: fila.entregas_total || 0,
    entregasPorRevisar: fila.entregas_revisar || 0,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
    // Campos derivados para el estudiante.
    estado,
    vencida,
    miEntrega: fila.mi_entrega_id
      ? {
          id: fila.mi_entrega_id,
          estado: fila.mi_estado,
          calificacion: fila.mi_calificacion,
          observaciones: fila.mi_observaciones || '',
          entregadaEn: fila.mi_entregada_en,
          archivoNombre: fila.mi_archivo_nombre || null,
        }
      : null,
  };
}

/**
 * Publica automáticamente las tareas programadas cuya fecha ya llegó.
 * Se ejecuta de forma perezosa al consultar, sin necesidad de cron.
 */
export async function publicarProgramadas({ almacen }) {
  const pendientes = await almacen.todos(
    `SELECT * FROM tareas
      WHERE publicada = 0
        AND fecha_publicacion IS NOT NULL
        AND fecha_publicacion <= ?`,
    ahora(),
  );

  for (const tarea of pendientes) {
    await almacen.ejecutar(
      'UPDATE tareas SET publicada = 1, publicada_en = ?, actualizado_en = ? WHERE id = ?',
      tarea.fecha_publicacion, ahora(), tarea.id,
    );
    await notificarEstudiantes({ almacen }, {
      tipo: TIPOS.TAREA_NUEVA,
      titulo: `Nueva tarea publicada: «${tarea.titulo}»`,
      detalle: tarea.limite_en ? `Fecha límite: ${tarea.limite_en}.` : 'Sin fecha límite.',
      tareaId: tarea.id,
    });
  }

  return pendientes.length;
}

/** Lista tareas según el rol. */
export async function listarTareas({ almacen }, usuario, { area, estado, q } = {}) {
  await publicarProgramadas({ almacen });

  const esDocente = usuario.rol === 'docente';
  const condiciones = [];
  const params = [];
  const joinParams = [];

  if (!esDocente) {
    condiciones.push('t.publicada = 1');
    joinParams.push(usuario.id);
    await avisarProximosVencimientos({ almacen }, usuario);
  }

  if (area) {
    condiciones.push('t.area = ?');
    params.push(areaObligatoria(area));
  }
  if (q) {
    condiciones.push('(t.titulo LIKE ? OR t.instrucciones LIKE ?)');
    const patron = `%${String(q).trim()}%`;
    params.push(patron, patron);
  }
  if (esDocente && estado === 'borrador') condiciones.push('t.publicada = 0');
  if (esDocente && estado === 'publicada') condiciones.push('t.publicada = 1');

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const paramsConJoin = [...joinParams, ...params];

  const filas = await almacen.todos(
    `${sqlTarea(esDocente)} ${where} ORDER BY t.publicada DESC, t.creado_en DESC`,
    ...paramsConJoin,
  );

  let lista = filas.map((fila) => mapTarea(fila, usuario));

  // La lista también lleva los adjuntos para que las tarjetas puedan
  // mostrarlos y descargarlos sin pedir el detalle de cada tarea.
  for (const tarea of lista) {
    tarea.adjuntos = await adjuntosDeTarea(almacen, tarea.id);
  }

  if (!esDocente && estado) {
    lista = lista.filter((t) => t.estado === estado);
  }

  return lista;
}

/** Adjuntos de una tarea, con los datos del archivo listos para descargar. */
async function adjuntosDeTarea(almacen, tareaId) {
  const filas = await almacen.todos(
    `SELECT a.id, a.titulo, a.tipo, f.nombre_original, f.mime, f.tamano
       FROM tarea_adjuntos a
       JOIN archivos f ON f.id = a.archivo_id
      WHERE a.tarea_id = ?
      ORDER BY a.creado_en`,
    tareaId,
  );
  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    tipo: f.tipo,
    nombre: f.nombre_original,
    mime: f.mime,
    tamano: f.tamano,
  }));
}

/** Tarea completa con adjuntos y, para el estudiante, su propia entrega. */
export async function obtenerTarea({ almacen }, usuario, id) {
  await publicarProgramadas({ almacen });

  const esDocente = usuario.rol === 'docente';

  const fila = esDocente
    ? await almacen.uno(`${sqlTarea(true)} WHERE t.id = ?`, id)
    : await almacen.uno(`${sqlTarea(false)} WHERE t.id = ?`, usuario.id, id);
  if (!fila) throw new ErrorHttp(404, 'La tarea no existe.');
  if (!fila.publicada && usuario.rol !== 'docente') {
    throw new ErrorHttp(403, 'Esa tarea no está publicada.');
  }

  const tarea = mapTarea(fila, usuario);
  tarea.adjuntos = await adjuntosDeTarea(almacen, id);

  return tarea;
}

/* --------------------------------------------------------------------------
   Creación y edición (docente)
   -------------------------------------------------------------------------- */

function datosTarea(datos, fila = null) {
  // En creación (fila === null) no hay valor previo del que heredar: los campos
  // obligatorios se validan siempre y los opcionales toman su valor por defecto.
  // Antes, al faltar un campo se leía `fila.<campo>` sobre null y el servidor
  // respondía 500 «Error interno del servidor» en lugar de un 400 con mensaje.
  const esEdicion = fila !== null;

  const titulo = esEdicion
    ? (datos.titulo !== undefined
      ? textoObligatorio(datos.titulo, 'título', 200)
      : fila.titulo)
    : textoObligatorio(datos.titulo, 'título', 200);

  const area = esEdicion
    ? (datos.area !== undefined ? areaObligatoria(datos.area) : fila.area)
    : areaObligatoria(datos.area);

  const instrucciones = esEdicion
    ? (datos.instrucciones !== undefined
      ? textoObligatorio(datos.instrucciones, 'instrucciones', 8000)
      : fila.instrucciones)
    : textoOpcional(datos.instrucciones, 8000);

  const indicaciones = datos.indicaciones !== undefined
    ? textoOpcional(datos.indicaciones, 4000)
    : (fila ? fila.indicaciones : '');

  const limiteEn = datos.limiteEn !== undefined
    ? fechaOpcional(datos.limiteEn, 'fecha límite')
    : (fila ? fila.limite_en : null);

  const fechaPublicacion = datos.fechaPublicacion !== undefined
    ? fechaOpcional(datos.fechaPublicacion, 'fecha de publicación')
    : (fila ? fila.fecha_publicacion : null);

  const puntajeMaximo = datos.puntajeMaximo !== undefined
    ? numeroEntre(datos.puntajeMaximo, 'puntaje máximo', 1, 100)
    : (fila ? fila.puntaje_maximo : 20);

  const permiteReapertura = datos.permiteReapertura !== undefined
    ? (booleano(datos.permiteReapertura, false) ? 1 : 0)
    : (fila ? fila.permite_reapertura : 0);

  return {
    titulo, area, instrucciones, indicaciones,
    limite_en: limiteEn,
    fecha_publicacion: fechaPublicacion,
    puntaje_maximo: puntajeMaximo,
    permite_reapertura: permiteReapertura,
  };
}

export async function crearTarea({ almacen }, usuario, datos) {
  exigirDocente(usuario);

  const campos = datosTarea(datos);
  const quierePublicar = booleano(datos.publicada, false);
  const programada = quierePublicar &&
    campos.fecha_publicacion !== null &&
    Date.parse(campos.fecha_publicacion) > Date.now();

  const id = nuevoId();
  const momento = ahora();
  const publicada = quierePublicar && !programada;

  await almacen.ejecutar(
    `INSERT INTO tareas
       (id, titulo, area, instrucciones, indicaciones, publicada, publicada_en,
        fecha_publicacion, limite_en, puntaje_maximo, permite_reapertura,
        docente_id, creado_en, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, campos.titulo, campos.area, campos.instrucciones, campos.indicaciones,
    publicada ? 1 : 0, publicada ? momento : null,
    campos.fecha_publicacion, campos.limite_en, campos.puntaje_maximo,
    campos.permite_reapertura, usuario.id, momento, momento,
  );

  if (publicada) {
    await notificarEstudiantes({ almacen }, {
      tipo: TIPOS.TAREA_NUEVA,
      titulo: `Nueva tarea publicada: «${campos.titulo}»`,
      detalle: campos.limite_en ? `Fecha límite: ${campos.limite_en}.` : 'Sin fecha límite.',
      tareaId: id,
    });
  }

  return await obtenerTarea({ almacen }, usuario, id);
}

export async function actualizarTarea({ almacen }, usuario, id, datos) {
  exigirDocente(usuario);

  const fila = await almacen.uno('SELECT * FROM tareas WHERE id = ?', id);
  if (!fila) throw new ErrorHttp(404, 'La tarea no existe.');

  const campos = datosTarea(datos, fila);

  await almacen.ejecutar(
    `UPDATE tareas
        SET titulo = ?, area = ?, instrucciones = ?, indicaciones = ?,
            fecha_publicacion = ?, limite_en = ?, puntaje_maximo = ?,
            permite_reapertura = ?, actualizado_en = ?
      WHERE id = ?`,
    campos.titulo, campos.area, campos.instrucciones, campos.indicaciones,
    campos.fecha_publicacion, campos.limite_en, campos.puntaje_maximo,
    campos.permite_reapertura, ahora(), id,
  );

  if (datos.publicada !== undefined) {
    await cambiarPublicacion({ almacen }, usuario, id, booleano(datos.publicada, false));
  }

  return await obtenerTarea({ almacen }, usuario, id);
}

/** Publica o despublica una tarea. */
export async function cambiarPublicacion({ almacen }, usuario, id, publicada) {
  exigirDocente(usuario);

  const fila = await almacen.uno('SELECT * FROM tareas WHERE id = ?', id);
  if (!fila) throw new ErrorHttp(404, 'La tarea no existe.');

  const nuevo = publicada ? 1 : 0;
  if (nuevo === fila.publicada) return await obtenerTarea({ almacen }, usuario, id);

  await almacen.ejecutar(
    'UPDATE tareas SET publicada = ?, publicada_en = ?, actualizado_en = ? WHERE id = ?',
    nuevo, publicada ? ahora() : null, ahora(), id,
  );

  if (publicada) {
    await notificarEstudiantes({ almacen }, {
      tipo: TIPOS.TAREA_NUEVA,
      titulo: `Nueva tarea publicada: «${fila.titulo}»`,
      detalle: fila.limite_en ? `Fecha límite: ${fila.limite_en}.` : 'Sin fecha límite.',
      tareaId: id,
    });
  }

  return await obtenerTarea({ almacen }, usuario, id);
}

/** Elimina la tarea, sus adjuntos, sus entregas y los archivos de todos ellos. */
export async function eliminarTarea({ almacen }, usuario, id) {
  exigirDocente(usuario);

  const fila = await almacen.uno('SELECT id FROM tareas WHERE id = ?', id);
  if (!fila) throw new ErrorHttp(404, 'La tarea no existe.');

  const adjuntos = await almacen.todos('SELECT archivo_id FROM tarea_adjuntos WHERE tarea_id = ?', id);
  const entregas = await almacen.todos('SELECT archivo_id FROM entregas WHERE tarea_id = ?', id);

  await almacen.ejecutar('DELETE FROM tareas WHERE id = ?', id);

  for (const adjunto of adjuntos) await borrarArchivo(almacen, adjunto.archivo_id);
  for (const entrega of entregas) await borrarArchivo(almacen, entrega.archivo_id);
}

/* --------------------------------------------------------------------------
   Adjuntos
   -------------------------------------------------------------------------- */

export async function agregarAdjunto({ almacen, config }, usuario, tareaId, archivo, datos = {}) {
  exigirDocente(usuario);

  const tarea = await almacen.uno('SELECT * FROM tareas WHERE id = ?', tareaId);
  if (!tarea) throw new ErrorHttp(404, 'La tarea no existe.');
  if (!archivo || !archivo.datos || !archivo.datos.length) {
    throw new ErrorHttp(400, 'Selecciona el archivo que quieres adjuntar.');
  }

  const fila = await guardarArchivo(almacen, {
    datos: archivo.datos,
    nombreOriginal: archivo.nombre,
    usuarioId: usuario.id,
    permitidas: PERMITIDOS.tareas,
    limiteBytes: config.tamanoMaximoMb * 1024 * 1024,
  });

  const id = nuevoId();
  await almacen.ejecutar(
    `INSERT INTO tarea_adjuntos (id, tarea_id, archivo_id, titulo, tipo, creado_en)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id, tareaId, fila.id,
    textoOpcional(datos.titulo, 200) || fila.nombre_original,
    datos.tipo === 'adjunto' ? 'adjunto' : 'material',
    ahora(),
  );

  return await obtenerTarea({ almacen }, usuario, tareaId);
}

export async function eliminarAdjunto({ almacen }, usuario, tareaId, adjuntoId) {
  exigirDocente(usuario);

  const fila = await almacen.uno(
    'SELECT * FROM tarea_adjuntos WHERE id = ? AND tarea_id = ?',
    adjuntoId, tareaId,
  );
  if (!fila) throw new ErrorHttp(404, 'El adjunto no existe.');

  await almacen.ejecutar('DELETE FROM tarea_adjuntos WHERE id = ?', adjuntoId);
  await borrarArchivo(almacen, fila.archivo_id);
}

/** Descarga un adjunto si la tarea es visible para quien lo pide. */
export async function archivoDeAdjunto({ almacen }, usuario, tareaId, adjuntoId) {
  const fila = await almacen.uno(
    `SELECT t.publicada, f.*
       FROM tarea_adjuntos a
       JOIN tareas t ON t.id = a.tarea_id
       JOIN archivos f ON f.id = a.archivo_id
      WHERE a.id = ? AND a.tarea_id = ?`,
    adjuntoId, tareaId,
  );

  if (!fila) throw new ErrorHttp(404, 'El adjunto no existe.');
  if (!fila.publicada && usuario.rol !== 'docente') {
    throw new ErrorHttp(403, 'Esa tarea no está publicada.');
  }

  return {
    ...(await resolverArchivo(almacen, fila)),
  };
}
