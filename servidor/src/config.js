import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Obtiene la ruta absoluta de la carpeta 'servidor' en Railway (/app/servidor)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename); // /app/servidor/src
const BASE_DIR = join(__dirname, '..'); // /app/servidor

// Railway inyecta PORT dinámicamente. Lo ponemos primero.
const puertoEntorno = process.env.PORT || process.env.PUERTO || '3210';

export const CONFIG = {
  nombreAplicacion: process.env.NOMBRE_APLICACION || 'BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO',
  puerto: parseInt(puertoEntorno, 10),
  host: process.env.HOST || '0.0.0.0',
  tamanoMaximoMb: parseInt(process.env.TAMANO_MAXIMO_MB || '1024', 10),
  tamanoJsonKb: parseInt(process.env.TAMANO_JSON_KB || '512', 10), // ← ESTO EVITA EL CRASH DE JSON
  origenes: (process.env.ORIGENES_PERMITIDOS || 'http://127.0.0.1:8099,http://localhost:8099').split(','),
  
  // RUTAS ABSOLUTAS: Apuntan directamente al Volumen montado en /app/servidor/datos
  rutaBd: process.env.RUTA_BD || join(BASE_DIR, 'datos', 'biblioteca.sqlite'),
  rutaArchivos: process.env.RUTA_ARCHIVOS || join(BASE_DIR, 'datos', 'archivos'),

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