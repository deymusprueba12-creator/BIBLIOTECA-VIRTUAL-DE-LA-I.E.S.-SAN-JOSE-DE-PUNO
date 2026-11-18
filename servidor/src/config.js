/**
 * config.js
 * ---------
 * Configuración del servidor de la BIBLIOTECA VIRTUAL.
 *
 * Todos los valores se leen de variables de entorno. Si existe el archivo
 * `servidor/.env`, se carga primero para no tener que exportar variables a mano.
 * Las variables ya definidas en el entorno SIEMPRE tienen prioridad.
 *
 * No hay dependencias externas ni valores secretos en el repositorio.
 */

import dotenv from 'dotenv';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ_SERVIDOR = resolve(AQUI, '..');

dotenv.config({ path: join(RAIZ_SERVIDOR, '.env'), override: false, quiet: true });

function texto(nombre, porDefecto) {
  const valor = process.env[nombre];
  return typeof valor === 'string' && valor.trim() ? valor.trim() : porDefecto;
}

function numero(nombre, porDefecto) {
  const valor = Number(process.env[nombre]);
  return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
}

function lista(nombre, porDefecto) {
  const valor = texto(nombre, '');
  if (!valor) return porDefecto;
  return valor.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Carpeta raíz de datos: RUTA_DATOS o servidor/datos. */
const carpetaDatos = resolve(texto('RUTA_DATOS', join(RAIZ_SERVIDOR, 'datos')));

export const CONFIG = Object.freeze({
  puerto: numero('PUERTO', 3000),
  host: texto('HOST', '0.0.0.0'),

  /**
   * Carpeta donde viven la base SQLite y los archivos subidos.
   * RUTA_DATOS sirve de base; RUTA_BD y RUTA_ARCHIVOS pueden sobrescribirla.
   */
  rutaDatos: carpetaDatos,
  rutaBd: resolve(texto('RUTA_BD', join(carpetaDatos, 'biblioteca.sqlite'))),
  rutaArchivos: resolve(texto('RUTA_ARCHIVOS', join(carpetaDatos, 'archivos'))),

  /** Orígenes autorizados para CORS. En desarrollo se añade Live Server. */
  origenes: lista('ORIGENES_PERMITIDOS', [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://127.0.0.1:8099',
    'http://localhost:8099',
    'https://deymusprueba12-creator.github.io',
  ]),

  /** Tamaño máximo de un archivo subido, en megabytes. */
  tamanoMaximoMb: numero('TAMANO_MAXIMO_MB', 1024),
  /** Tamaño máximo de un cuerpo JSON, en kilobytes. */
  tamanoJsonKb: numero('TAMANO_JSON_KB', 512),

  /** Horas que dura una sesión. */
  duracionSesionHoras: numero('DURACION_SESION_HORAS', 12),

  /** Protección contra fuerza bruta en el inicio de sesión. */
  limiteIntentos: numero('LIMITE_INTENTOS', 5),
  bloqueoSegundos: numero('BLOQUEO_SEGUNDOS', 60),

  /**
   * Credenciales iniciales. Solo se usan si la tabla de usuarios está vacía.
   * Son de demostración: no uses contraseñas personales o institucionales.
   */
  docenteInicial: {
    usuario: texto('DOCENTE_USUARIO', 'docente'),
    contrasena: texto('DOCENTE_PASSWORD', ''),
    nombre: texto('DOCENTE_NOMBRE', 'Docente'),
  },
  estudianteInicial: {
    usuario: texto('ESTUDIANTE_USUARIO', 'estudiante'),
    contrasena: texto('ESTUDIANTE_PASSWORD', ''),
    nombre: texto('ESTUDIANTE_NOMBRE', 'Estudiante'),
  },

  nombreAplicacion: texto('NOMBRE_APLICACION', 'BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO'),
});
