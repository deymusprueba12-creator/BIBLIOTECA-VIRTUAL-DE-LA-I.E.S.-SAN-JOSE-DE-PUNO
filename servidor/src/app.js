/**
 * app.js
 * ------
 * Construye la aplicación HTTP completa (sin escuchar en un puerto).
 * Separar esto de index.js permite que las pruebas levanten instancias
 * aisladas con una base de datos temporal.
 */

import http from 'node:http';
import { CONFIG } from './config.js';
import { crearAlmacen } from './bd/almacen.js';
import { crearRutas } from './rutas.js';
import { usuarioPorToken, asegurarUsuariosIniciales } from './servicios/usuarios.js';
import { crearBusEventos } from './eventos.js';
import {
  ErrorHttp,
  aplicarCors,
  aplicarCabecerasSeguridad,
  responderJson,
  responderError,
  responderArchivo,
  parametros,
} from './lib/http.js';

const VERSION = '1.0.0';

/** Lee el token del encabezado Authorization: Bearer <token>. */
function tokenDe(req) {
  const cabecera = String(req.headers.authorization || '');
  const coincidencia = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(cabecera.trim());
  return coincidencia ? coincidencia[1] : null;
}

/**
 * Crea la aplicación.
 * @returns {Promise<{servidor, almacen, ctx, cerrar}>}
 */
export async function iniciarAplicacion({ config = CONFIG } = {}) {
  const almacen = crearAlmacen({
    rutaBd: config.rutaBd,
    rutaArchivos: config.rutaArchivos,
  });

  const ctx = { almacen, config, eventos: crearBusEventos() };
  const router = crearRutas(ctx, { version: VERSION });

  await asegurarUsuariosIniciales(ctx);

  const servidor = http.createServer(async (req, res) => {
    aplicarCabecerasSeguridad(res);
    aplicarCors(req, res, config.origenes);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const encontrada = router.buscar(req.method, url.pathname);

      if (!encontrada) throw new ErrorHttp(404, 'Ruta no encontrada.');

      const { manejador, params, acceso } = encontrada;
      let usuario = null;
      let token = null;

      if (acceso !== 'publico') {
        token = tokenDe(req);
        usuario = usuarioPorToken(ctx, token);

        if (!usuario) throw new ErrorHttp(401, 'Inicia sesión para continuar.');

        if (acceso === 'docente' && usuario.rol !== 'docente') {
          throw new ErrorHttp(403, 'Esta acción requiere una cuenta de docente.');
        }
        if (acceso === 'estudiante' && usuario.rol !== 'estudiante') {
          throw new ErrorHttp(403, 'Esta acción requiere una cuenta de estudiante.');
        }
      }

      const resultado = await manejador({
        req,
        res,
        params,
        query: parametros(url),
        usuario,
        token,
      });

      // El endpoint SSE mantiene la conexión abierta; no es JSON ni archivo.
      if (resultado && resultado.stream) return;

      if (resultado && resultado.archivo) {
        responderArchivo(res, resultado.archivo, { descarga: !resultado.inline });
        return;
      }

      responderJson(res, (resultado && resultado.estado) || 200, (resultado && resultado.datos) || {});
    } catch (err) {
      // Un cuerpo demasiado grande puede haber cerrado la conexión.
      if (res.writableEnded) return;
      responderError(res, err);
    }
  });

  return {
    servidor,
    almacen,
    ctx,
    async cerrar() {
      await new Promise((resolve) => servidor.close(() => resolve()));
      almacen.cerrar();
    },
  };
}
