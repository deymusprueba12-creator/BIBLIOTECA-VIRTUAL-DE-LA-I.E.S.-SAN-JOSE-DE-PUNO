/**
 * servicios/notificaciones.js
 * ---------------------------
 * Notificaciones internas. No se envía ningún correo: todo queda en la base
 * y se consulta desde la campana de la interfaz.
 */

import { ahora } from '../bd/almacen.js';
import { nuevoId } from '../lib/seguridad.js';

export const TIPOS = Object.freeze({
  TAREA_NUEVA: 'tarea_nueva',
  PROXIMA_ENTREGA: 'proxima_entrega',
  ENTREGA_REGISTRADA: 'entrega_registrada',
  TAREA_CALIFICADA: 'tarea_calificada',
  CORRECCION: 'correccion',
});

/** Crea una notificación para un usuario concreto. */
export function crearNotificacion({ almacen }, {
  usuarioId, tipo, titulo, detalle = '', tareaId = null, entregaId = null,
}) {
  if (!usuarioId) return null;

  const id = nuevoId();
  almacen.ejecutar(
    `INSERT INTO notificaciones
       (id, usuario_id, tipo, titulo, detalle, tarea_id, entrega_id, leida, creada_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    id, usuarioId, tipo, titulo, detalle, tareaId, entregaId, ahora(),
  );
  return id;
}

/** Notifica a todos los estudiantes activos. */
export function notificarEstudiantes({ almacen }, datos) {
  const estudiantes = almacen.todos("SELECT id FROM usuarios WHERE rol = 'estudiante' AND activo = 1");
  for (const estudiante of estudiantes) {
    crearNotificacion({ almacen }, { ...datos, usuarioId: estudiante.id });
  }
}

/** Lista las notificaciones del usuario autenticado. */
export function listarNotificaciones({ almacen }, usuario, { soloNoLeidas = false } = {}) {
  const filas = almacen.todos(
    `SELECT * FROM notificaciones
      WHERE usuario_id = ? ${soloNoLeidas ? 'AND leida = 0' : ''}
      ORDER BY creada_en DESC
      LIMIT 200`,
    usuario.id,
  );

  return filas.map((fila) => ({
    id: fila.id,
    tipo: fila.tipo,
    titulo: fila.titulo,
    detalle: fila.detalle,
    tareaId: fila.tarea_id,
    entregaId: fila.entrega_id,
    leida: !!fila.leida,
    creadaEn: fila.creada_en,
  }));
}

export function contarNoLeidas({ almacen }, usuario) {
  return almacen.uno(
    'SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = ? AND leida = 0',
    usuario.id,
  ).n;
}

/** Marca una notificación (o todas) como leídas. Siempre del propio usuario. */
export function marcarLeidas({ almacen }, usuario, { id } = {}) {
  if (id) {
    almacen.ejecutar(
      'UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?',
      id, usuario.id,
    );
  } else {
    almacen.ejecutar('UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?', usuario.id);
  }
  return contarNoLeidas({ almacen }, usuario);
}

/**
 * Aviso de próxima fecha límite: se genera una sola vez por estudiante y
 * tarea cuando faltan 48 horas o menos y todavía no hay entrega.
 */
export function avisarProximosVencimientos({ almacen }, usuario) {
  const limite = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const pendientes = almacen.todos(
    `SELECT t.id, t.titulo, t.limite_en
       FROM tareas t
      WHERE t.publicada = 1
        AND t.limite_en IS NOT NULL
        AND t.limite_en > ?
        AND t.limite_en <= ?
        AND NOT EXISTS (
          SELECT 1 FROM entregas e
           WHERE e.tarea_id = t.id AND e.estudiante_id = ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM notificaciones n
           WHERE n.usuario_id = ? AND n.tarea_id = t.id AND n.tipo = ?
        )`,
    ahora(), limite, usuario.id, usuario.id, TIPOS.PROXIMA_ENTREGA,
  );

  for (const tarea of pendientes) {
    crearNotificacion({ almacen }, {
      usuarioId: usuario.id,
      tipo: TIPOS.PROXIMA_ENTREGA,
      titulo: `Se acerca la fecha límite de «${tarea.titulo}»`,
      detalle: `La entrega vence el ${tarea.limite_en}.`,
      tareaId: tarea.id,
    });
  }
}
