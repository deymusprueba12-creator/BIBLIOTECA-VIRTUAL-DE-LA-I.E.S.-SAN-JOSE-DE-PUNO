/**
 * servicios/usuarios.js
 * ---------------------
 * Autenticación, sesiones y gestión de usuarios.
 *
 * Reglas:
 *   - Las contraseñas se guardan con scrypt (hash + sal). Nunca en claro.
 *   - Del token de sesión solo se persiste el SHA-256.
 *   - El bloqueo por intentos fallidos se decide en el servidor.
 *   - Un estudiante nunca puede crear usuarios ni cambiar roles.
 */

import { createHash } from 'node:crypto';
import { ErrorHttp } from '../lib/http.js';
import { ahora } from '../bd/almacen.js';
import {
  hashearContrasena,
  verificarContrasena,
  generarToken,
  nuevoId,
} from '../lib/seguridad.js';
import {
  textoObligatorio,
  textoOpcional,
  usuarioValido,
  contrasenaValida,
} from '../lib/validacion.js';

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Forma pública de un usuario: nunca incluye hash ni sal. */
function publico(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombre: fila.nombre,
    rol: fila.rol,
    activo: !!fila.activo,
    creadoEn: fila.creado_en,
  };
}

/**
 * Crea los usuarios iniciales si la tabla está vacía.
 * Las contraseñas deben venir del entorno; nunca del repositorio.
 */
export async function asegurarUsuariosIniciales({ almacen, config }) {
  const total = (await almacen.uno('SELECT COUNT(*) AS n FROM usuarios')).n;
  if (total > 0) return;

  const iniciales = [
    { ...config.docenteInicial, rol: 'docente' },
    { ...config.estudianteInicial, rol: 'estudiante' },
  ].filter((u) => u.usuario && u.contrasena);

  if (!iniciales.length) {
    throw new Error(
      'No hay usuarios y faltan DOCENTE_PASSWORD / ESTUDIANTE_PASSWORD. ' +
      'Copia servidor/.env.example a servidor/.env y define credenciales de demostración.',
    );
  }

  for (const datos of iniciales) {
    await crearUsuario({ almacen, config }, {
      usuario: datos.usuario,
      nombre: datos.nombre || (datos.rol === 'docente' ? 'Docente' : 'Estudiante'),
      rol: datos.rol,
      contrasena: datos.contrasena,
    }, { permitirPrimero: true });
  }

  console.log(`[servidor] Usuarios iniciales creados: ${iniciales.map((u) => `${u.usuario} (${u.rol})`).join(', ')}`);
}

/* --------------------------------------------------------------------------
   Inicio y cierre de sesión
   -------------------------------------------------------------------------- */

function claveIntento(ip, usuario) {
  return `${ip || 'desconocida'}|${String(usuario || '').toLowerCase()}`;
}

async function comprobarBloqueo(almacen, config, clave) {
  const fila = await almacen.uno('SELECT * FROM intentos_acceso WHERE clave = ?', clave);
  if (!fila || !fila.bloqueado_hasta) return;

  if (Date.parse(fila.bloqueado_hasta) > Date.now()) {
    const segundos = Math.max(1, Math.ceil((Date.parse(fila.bloqueado_hasta) - Date.now()) / 1000));
    throw new ErrorHttp(429, `Demasiados intentos fallidos. Espera ${segundos} segundos.`);
  }

  // El bloqueo ya expiró: se reinicia el contador.
  await almacen.ejecutar('DELETE FROM intentos_acceso WHERE clave = ?', clave);
}

async function registrarFallo(almacen, config, clave) {
  const fila = await almacen.uno('SELECT * FROM intentos_acceso WHERE clave = ?', clave);
  const fallos = (fila ? fila.fallos : 0) + 1;
  const bloquear = fallos >= config.limiteIntentos;
  const hasta = bloquear
    ? new Date(Date.now() + config.bloqueoSegundos * 1000).toISOString()
    : null;

  await almacen.ejecutar(
    `INSERT INTO intentos_acceso (clave, fallos, bloqueado_hasta, actualizado_en)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (clave) DO UPDATE SET
       fallos = excluded.fallos,
       bloqueado_hasta = excluded.bloqueado_hasta,
       actualizado_en = excluded.actualizado_en`,
    clave, bloquear ? 0 : fallos, hasta, ahora(),
  );

  if (bloquear) {
    throw new ErrorHttp(429, `Demasiados intentos fallidos. Espera ${config.bloqueoSegundos} segundos.`);
  }

  const restantes = Math.max(0, config.limiteIntentos - fallos);
  return restantes;
}

/** Inicia sesión y devuelve el token en claro (solo una vez). */
export async function iniciarSesion({ almacen, config }, { usuario, contrasena, ip }) {
  const nombreUsuario = String(usuario ?? '').trim();
  if (!nombreUsuario || !contrasena) {
    throw new ErrorHttp(400, 'Escribe tu usuario y tu contraseña.');
  }

  const clave = claveIntento(ip, nombreUsuario);
  await comprobarBloqueo(almacen, config, clave);

  const fila = await almacen.uno(
    'SELECT * FROM usuarios WHERE usuario = ? COLLATE NOCASE',
    nombreUsuario,
  );

  const valida = fila && fila.activo
    ? await verificarContrasena(contrasena, fila.hash, fila.salt)
    : false;

  if (!valida) {
    const restantes = await registrarFallo(almacen, config, clave);
    // Mensaje idéntico para usuario inexistente y contraseña incorrecta.
    throw new ErrorHttp(401, `Usuario o contraseña incorrectos. Quedan ${restantes} intentos.`);
  }

  await almacen.ejecutar('DELETE FROM intentos_acceso WHERE clave = ?', clave);

  // Limpieza de sesiones caducadas.
  await almacen.ejecutar('DELETE FROM sesiones WHERE expira_en <= ?', ahora());

  const token = generarToken();
  const creada = ahora();
  const expira = new Date(Date.now() + config.duracionSesionHoras * 3600 * 1000).toISOString();

  await almacen.ejecutar(
    'INSERT INTO sesiones (token_hash, usuario_id, creada_en, expira_en) VALUES (?, ?, ?, ?)',
    hashToken(token), fila.id, creada, expira,
  );

  return { token, expiraEn: expira, usuario: publico(fila) };
}

/** Devuelve el usuario autenticado o null. */
export async function usuarioPorToken({ almacen }, token) {
  if (!token) return null;

  const fila = await almacen.uno(
    `SELECT u.*, s.expira_en
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ?`,
    hashToken(token),
  );

  if (!fila) return null;
  if (Date.parse(fila.expira_en) <= Date.now()) {
    await almacen.ejecutar('DELETE FROM sesiones WHERE token_hash = ?', hashToken(token));
    return null;
  }
  if (!fila.activo) return null;

  return publico(fila);
}

export async function cerrarSesion({ almacen }, token) {
  if (!token) return;
  await almacen.ejecutar('DELETE FROM sesiones WHERE token_hash = ?', hashToken(token));
}

/* --------------------------------------------------------------------------
   Administración de usuarios (solo docente)
   -------------------------------------------------------------------------- */

export async function listarUsuarios({ almacen }, { rol } = {}) {
  const filas = rol
    ? await almacen.todos('SELECT * FROM usuarios WHERE rol = ? ORDER BY nombre COLLATE NOCASE', rol)
    : await almacen.todos('SELECT * FROM usuarios ORDER BY rol, nombre COLLATE NOCASE');

  return filas.map(publico);
}

export async function crearUsuario({ almacen }, { usuario, nombre, rol, contrasena }, { permitirPrimero = false } = {}) {
  const rolFinal = rol === 'docente' ? 'docente' : 'estudiante';
  const usuarioFinal = usuarioValido(usuario);

  if (!permitirPrimero) {
    const existe = await almacen.uno('SELECT id FROM usuarios WHERE usuario = ? COLLATE NOCASE', usuarioFinal);
    if (existe) throw new ErrorHttp(409, 'Ya existe un usuario con ese nombre.');
  }

  const clave = contrasenaValida(contrasena);
  const { hash, salt } = await hashearContrasena(clave);
  const id = nuevoId();
  const momento = ahora();

  await almacen.ejecutar(
    `INSERT INTO usuarios (id, usuario, nombre, rol, hash, salt, activo, creado_en, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id, usuarioFinal, textoObligatorio(nombre || usuarioFinal, 'nombre', 120),
    rolFinal, hash, salt, momento, momento,
  );

  return publico(await almacen.uno('SELECT * FROM usuarios WHERE id = ?', id));
}

export async function actualizarUsuario({ almacen }, id, cambios) {
  const fila = await almacen.uno('SELECT * FROM usuarios WHERE id = ?', id);
  if (!fila) throw new ErrorHttp(404, 'El usuario no existe.');

  const nombre = cambios.nombre !== undefined
    ? textoObligatorio(cambios.nombre, 'nombre', 120)
    : fila.nombre;

  const activo = cambios.activo !== undefined ? (cambios.activo ? 1 : 0) : fila.activo;

  let hash = fila.hash;
  let salt = fila.salt;
  if (cambios.contrasena) {
    const nueva = await hashearContrasena(contrasenaValida(cambios.contrasena));
    hash = nueva.hash;
    salt = nueva.salt;
  }

  await almacen.ejecutar(
    'UPDATE usuarios SET nombre = ?, activo = ?, hash = ?, salt = ?, actualizado_en = ? WHERE id = ?',
    nombre, activo, hash, salt, ahora(), id,
  );

  // Si se desactiva o cambia la contraseña, se cierran sus sesiones.
  if (!activo || cambios.contrasena) {
    await almacen.ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', id);
  }

  return publico(await almacen.uno('SELECT * FROM usuarios WHERE id = ?', id));
}

/** Docente autenticado, o error 403. */
export function exigirDocente(usuario) {
  if (!usuario || usuario.rol !== 'docente') {
    throw new ErrorHttp(403, 'Esta acción requiere una cuenta de docente.');
  }
  return usuario;
}

export { publico as usuarioPublico };
