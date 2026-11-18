/**
 * Configuración del servidor.
 * Prioriza process.env.PORT (Railway/Render) sobre PUERTO.
 */

// Railway inyecta PORT dinámicamente. Lo ponemos primero.
const puertoEntorno = process.env.PORT || process.env.PUERTO || '3210';

export const CONFIG = {
  puerto: parseInt(puertoEntorno, 10),
  host: process.env.HOST || '0.0.0.0',
  tamanoMaximoMb: parseInt(process.env.TAMANO_MAXIMO_MB || '1024', 10),
  origenes: (process.env.ORIGENES_PERMITIDOS || 'http://127.0.0.1:8099,http://localhost:8099').split(','),
  
  // Rutas relativas a la carpeta 'servidor' (donde corre Node en Railway)
  rutaBd: process.env.RUTA_BD || './datos/biblioteca.sqlite',
  rutaArchivos: process.env.RUTA_ARCHIVOS || './datos/archivos',

  docente: {
    usuario: process.env.DOCENTE_USUARIO || 'docente',
    password: process.env.DOCENTE_PASSWORD || 'docente123',
    nombre: process.env.DOCENTE_NOMBRE || 'Docente'
  },
  estudiante: {
    usuario: process.env.ESTUDIANTE_USUARIO || 'estudiante',
    password: process.env.ESTUDIANTE_PASSWORD || 'estudiante123',
    nombre: process.env.ESTUDIANTE_NOMBRE || 'Estudiante'
  }
};

export default CONFIG;