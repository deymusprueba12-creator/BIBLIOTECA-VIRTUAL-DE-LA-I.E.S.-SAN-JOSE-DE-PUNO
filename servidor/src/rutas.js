/**
 * rutas.js
 * --------
 * Definición de la API HTTP.
 *
 * Cada ruta declara quién puede usarla:
 *   publico    -> sin sesión
 *   cualquiera -> cualquier usuario autenticado
 *   docente    -> solo docentes
 *   estudiante -> solo estudiantes
 *
 * La comprobación central se hace en server.js antes de llamar al manejador,
 * y los servicios vuelven a comprobarla. Nunca se confía en el cliente.
 */

import { crearRouter, ErrorHttp, leerJson, leerMultipart, parametros } from './lib/http.js';
import { AREAS } from './areas.js';
import {
  iniciarSesion, cerrarSesion, listarUsuarios, crearUsuario,
  actualizarUsuario, exigirDocente,
} from './servicios/usuarios.js';
import {
  listarLibros, obtenerLibro, crearLibro, actualizarLibro,
  eliminarLibro, archivoDeLibro,
} from './servicios/libros.js';
import {
  listarTareas, obtenerTarea, crearTarea, actualizarTarea, eliminarTarea,
  cambiarPublicacion, agregarAdjunto, eliminarAdjunto, archivoDeAdjunto,
} from './servicios/tareas.js';
import {
  listarEntregas, obtenerEntrega, entregarTarea, calificarEntrega,
  archivoDeEntrega, listarCalificaciones,
} from './servicios/entregas.js';
import {
  listarNotificaciones, contarNoLeidas, marcarLeidas,
} from './servicios/notificaciones.js';

/** Primera parte de un formulario multipart, con su archivo principal. */
async function formulario(req, config) {
  const { campos, archivos } = await leerMultipart(req, config.tamanoMaximoMb * 1024 * 1024 + 1024 * 1024);
  return {
    campos,
    archivo: archivos.find((a) => a.campo === 'archivo') || archivos[0] || null,
  };
}

export function crearRutas(ctx, { version = '1.0.0' } = {}) {
  const router = crearRouter();
  const { config } = ctx;

  const json = (req) => leerJson(req, config.tamanoJsonKb * 1024);
  const id = (params) => String(params.id || '');

  /* ------------------------------- Sistema ------------------------------- */

  router.add('GET', '/api/salud', async () => ({
    datos: {
      ok: true,
      nombre: config.nombreAplicacion,
      version,
      areas: AREAS,
      maxMb: config.tamanoMaximoMb,
      modo: 'servidor',
    },
  }), { acceso: 'publico' });

  router.add('GET', '/api/areas', async () => ({ datos: { areas: AREAS } }), { acceso: 'publico' });

  // Señales en tiempo real (SSE). Solo avisa de cambios; no envía datos.
  router.add('GET', '/api/eventos', ({ req, res }) => {
    ctx.eventos.manejarSSE(req, res);
    return { stream: true };
  }, { acceso: 'publico' });

  /* -------------------------------- Sesión ------------------------------- */

  router.add('POST', '/api/auth/login', async (c) => {
    const datos = await json(c.req);
    const ip = c.req.socket.remoteAddress || '';
    const resultado = await iniciarSesion(ctx, {
      usuario: datos.usuario,
      contrasena: datos.contrasena,
      ip,
    });
    return { estado: 200, datos: resultado };
  }, { acceso: 'publico' });

  router.add('POST', '/api/auth/logout', async (c) => {
    await cerrarSesion(ctx, c.token);
    return { datos: { ok: true } };
  }, { acceso: 'cualquiera' });

  router.add('GET', '/api/auth/sesion', async (c) => ({
    datos: { usuario: c.usuario },
  }), { acceso: 'cualquiera' });

  /* ------------------------------- Usuarios ------------------------------ */

  router.add('GET', '/api/usuarios', async (c) => ({
    datos: { usuarios: await listarUsuarios(ctx, { rol: c.query.rol }) },
  }), { acceso: 'docente' });

  router.add('POST', '/api/usuarios', async (c) => {
    const datos = await json(c.req);
    const usuario = await crearUsuario(ctx, {
      usuario: datos.usuario,
      nombre: datos.nombre,
      rol: datos.rol,
      contrasena: datos.contrasena,
    });
    return { estado: 201, datos: { usuario } };
  }, { acceso: 'docente' });

  router.add('PATCH', '/api/usuarios/:id', async (c) => {
    const datos = await json(c.req);
    const usuario = await actualizarUsuario(ctx, id(c.params), datos);
    return { datos: { usuario } };
  }, { acceso: 'docente' });

  /* -------------------------------- Libros ------------------------------- */

  router.add('GET', '/api/libros', async (c) => ({
    datos: {
      libros: await listarLibros(ctx, c.usuario, {
        area: c.query.area,
        q: c.query.q,
        autor: c.query.autor,
      }),
    },
  }), { acceso: 'cualquiera' });

  router.add('GET', '/api/libros/:id', async (c) => ({
    datos: { libro: await obtenerLibro(ctx, c.usuario, id(c.params)) },
  }), { acceso: 'cualquiera' });

  router.add('POST', '/api/libros', async (c) => {
    const { campos, archivo } = await formulario(c.req, config);
    const libro = await crearLibro(ctx, c.usuario, campos, archivo);
    return { estado: 201, datos: { libro } };
  }, { acceso: 'docente' });

  router.add('PATCH', '/api/libros/:id', async (c) => {
    const datos = await json(c.req);
    const libro = await actualizarLibro(ctx, c.usuario, id(c.params), datos);
    return { datos: { libro } };
  }, { acceso: 'docente' });

  router.add('DELETE', '/api/libros/:id', async (c) => {
    await eliminarLibro(ctx, c.usuario, id(c.params));
    return { datos: { ok: true } };
  }, { acceso: 'docente' });

  router.add('GET', '/api/libros/:id/archivo', async (c) => ({
    archivo: await archivoDeLibro(ctx, c.usuario, id(c.params)),
    inline: true,
  }), { acceso: 'cualquiera' });

  /* -------------------------------- Tareas ------------------------------- */

  router.add('GET', '/api/tareas', async (c) => ({
    datos: {
      tareas: await listarTareas(ctx, c.usuario, {
        area: c.query.area,
        estado: c.query.estado,
        q: c.query.q,
      }),
    },
  }), { acceso: 'cualquiera' });

  router.add('GET', '/api/tareas/:id', async (c) => ({
    datos: { tarea: await obtenerTarea(ctx, c.usuario, id(c.params)) },
  }), { acceso: 'cualquiera' });

  router.add('POST', '/api/tareas', async (c) => {
    const datos = await json(c.req);
    const tarea = await crearTarea(ctx, c.usuario, datos);
    return { estado: 201, datos: { tarea } };
  }, { acceso: 'docente' });

  router.add('PATCH', '/api/tareas/:id', async (c) => {
    const datos = await json(c.req);
    const tarea = await actualizarTarea(ctx, c.usuario, id(c.params), datos);
    return { datos: { tarea } };
  }, { acceso: 'docente' });

  router.add('DELETE', '/api/tareas/:id', async (c) => {
    await eliminarTarea(ctx, c.usuario, id(c.params));
    return { datos: { ok: true } };
  }, { acceso: 'docente' });

  router.add('POST', '/api/tareas/:id/publicacion', async (c) => {
    const datos = await json(c.req);
    const tarea = await cambiarPublicacion(ctx, c.usuario, id(c.params), datos.publicada === true);
    return { datos: { tarea } };
  }, { acceso: 'docente' });

  router.add('POST', '/api/tareas/:id/adjuntos', async (c) => {
    const { campos, archivo } = await formulario(c.req, config);
    const tarea = await agregarAdjunto(ctx, c.usuario, id(c.params), archivo, campos);
    return { estado: 201, datos: { tarea } };
  }, { acceso: 'docente' });

  router.add('DELETE', '/api/tareas/:id/adjuntos/:adjuntoId', async (c) => {
    await eliminarAdjunto(ctx, c.usuario, id(c.params), String(c.params.adjuntoId));
    return { datos: { ok: true } };
  }, { acceso: 'docente' });

  router.add('GET', '/api/tareas/:id/adjuntos/:adjuntoId/archivo', async (c) => ({
    archivo: await archivoDeAdjunto(ctx, c.usuario, id(c.params), String(c.params.adjuntoId)),
    inline: true,
  }), { acceso: 'cualquiera' });

  /* ------------------------------- Entregas ------------------------------ */

  router.add('GET', '/api/entregas', async (c) => ({
    datos: {
      entregas: await listarEntregas(ctx, c.usuario, {
        area: c.query.area,
        tarea: c.query.tarea,
        estudiante: c.query.estudiante,
        estado: c.query.estado,
        desde: c.query.desde,
        hasta: c.query.hasta,
      }),
    },
  }), { acceso: 'cualquiera' });

  router.add('GET', '/api/entregas/:id', async (c) => ({
    datos: { entrega: await obtenerEntrega(ctx, c.usuario, id(c.params)) },
  }), { acceso: 'cualquiera' });

  router.add('POST', '/api/tareas/:id/entregas', async (c) => {
    const { campos, archivo } = await formulario(c.req, config);
    const entrega = await entregarTarea(ctx, c.usuario, id(c.params), archivo, campos);
    return { estado: 201, datos: { entrega } };
  }, { acceso: 'estudiante' });

  router.add('GET', '/api/tareas/:id/entregas', async (c) => {
    exigirDocente(c.usuario);
    return {
      datos: { entregas: await listarEntregas(ctx, c.usuario, { tarea: id(c.params) }) },
    };
  }, { acceso: 'docente' });

  router.add('PATCH', '/api/entregas/:id', async (c) => {
    const datos = await json(c.req);
    const entrega = await calificarEntrega(ctx, c.usuario, id(c.params), datos);
    return { datos: { entrega } };
  }, { acceso: 'docente' });

  router.add('GET', '/api/entregas/:id/archivo', async (c) => ({
    archivo: await archivoDeEntrega(ctx, c.usuario, id(c.params)),
    inline: false,
  }), { acceso: 'cualquiera' });

  /* ----------------------------- Calificaciones -------------------------- */

  router.add('GET', '/api/calificaciones', async (c) => ({
    datos: {
      calificaciones: await listarCalificaciones(ctx, c.usuario, {
        area: c.query.area,
        estudiante: c.query.estudiante,
      }),
    },
  }), { acceso: 'cualquiera' });

  /* ---------------------------- Notificaciones --------------------------- */

  router.add('GET', '/api/notificaciones', async (c) => ({
    datos: {
      notificaciones: await listarNotificaciones(ctx, c.usuario, {
        soloNoLeidas: c.query.soloNoLeidas === '1',
      }),
      sinLeer: await contarNoLeidas(ctx, c.usuario),
    },
  }), { acceso: 'cualquiera' });

  router.add('GET', '/api/notificaciones/contador', async (c) => ({
    datos: { sinLeer: await contarNoLeidas(ctx, c.usuario) },
  }), { acceso: 'cualquiera' });

  router.add('POST', '/api/notificaciones/leidas', async (c) => {
    const datos = await json(c.req);
    return { datos: { sinLeer: await marcarLeidas(ctx, c.usuario, datos) } };
  }, { acceso: 'cualquiera' });

  return router;
}

export { ErrorHttp, parametros };
