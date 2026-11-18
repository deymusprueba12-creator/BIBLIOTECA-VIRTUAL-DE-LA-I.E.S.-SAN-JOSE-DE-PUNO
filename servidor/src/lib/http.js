/**
 * lib/http.js
 * -----------
 * Utilidades HTTP sin dependencias: errores, router, lectura de cuerpos
 * JSON y multipart, CORS y envío de respuestas.
 */

/** Error con código HTTP asociado. */
export class ErrorHttp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.name = 'ErrorHttp';
    this.estado = estado;
  }
}

/* --------------------------------------------------------------------------
   Router mínimo con parámetros de ruta (:id)
   -------------------------------------------------------------------------- */

export function crearRouter() {
  const rutas = [];

  return {
    /**
     * Registra una ruta.
     * @param {string} metodo
     * @param {string} patron como '/api/tareas/:id'
     * @param {Function} manejador
     * @param {{acceso?: 'publico'|'cualquiera'|'docente'|'estudiante'}} opciones
     */
    add(metodo, patron, manejador, opciones = {}) {
      rutas.push({
        metodo: metodo.toUpperCase(),
        segmentos: patron.split('/').filter(Boolean),
        manejador,
        acceso: opciones.acceso || 'cualquiera',
      });
    },

    /** Devuelve { manejador, params, acceso } o null. */
    buscar(metodo, ruta) {
      const partes = ruta.split('/').filter(Boolean);
      for (const candidata of rutas) {
        if (candidata.metodo !== metodo.toUpperCase()) continue;
        if (candidata.segmentos.length !== partes.length) continue;

        const params = {};
        let coincide = true;
        for (let i = 0; i < partes.length; i++) {
          const segmento = candidata.segmentos[i];
          if (segmento.startsWith(':')) {
            params[segmento.slice(1)] = decodeURIComponent(partes[i]);
          } else if (segmento !== partes[i]) {
            coincide = false;
            break;
          }
        }
        if (coincide) {
          return { manejador: candidata.manejador, params, acceso: candidata.acceso };
        }
      }
      return null;
    },
  };
}

/* --------------------------------------------------------------------------
   Lectura de cuerpos
   -------------------------------------------------------------------------- */

/**
 * Lee el cuerpo completo con un límite de bytes. Si se supera, se descarta
 * el excedente para no consumir memoria y se responde 413.
 */
export function leerCuerpo(req, limiteBytes) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    let total = 0;

    req.on('data', (trozo) => {
      total += trozo.length;
      if (total <= limiteBytes) trozos.push(trozo);
    });

    req.on('end', () => {
      if (total > limiteBytes) {
        reject(new ErrorHttp(413, `El contenido supera el límite de ${Math.round(limiteBytes / 1024 / 1024)} MB.`));
      } else {
        resolve(Buffer.concat(trozos));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

/** Lee y parsea un cuerpo JSON. Un cuerpo vacío devuelve {}. */
export async function leerJson(req, limiteBytes) {
  const bruto = await leerCuerpo(req, limiteBytes);
  if (!bruto.length) return {};

  let datos;
  try {
    datos = JSON.parse(bruto.toString('utf8'));
  } catch {
    throw new ErrorHttp(400, 'El cuerpo de la petición no es JSON válido.');
  }

  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorHttp(400, 'El cuerpo debe ser un objeto JSON.');
  }
  return datos;
}

/**
 * Parsea un cuerpo multipart/form-data.
 * Devuelve { campos: {nombre: texto}, archivos: [{campo, nombre, mime, datos}] }.
 *
 * Se implementa sobre Buffer para no corromper binarios.
 */
export async function leerMultipart(req, limiteBytes) {
  const tipo = String(req.headers['content-type'] || '');
  const coincidencia = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(tipo);
  if (!/^multipart\/form-data/i.test(tipo) || !coincidencia) {
    throw new ErrorHttp(400, 'Se esperaba un cuerpo multipart/form-data.');
  }

  const frontera = Buffer.from('--' + (coincidencia[1] || coincidencia[2]).trim(), 'utf8');
  const cuerpo = await leerCuerpo(req, limiteBytes);

  const campos = {};
  const archivos = [];

  let posicion = cuerpo.indexOf(frontera);
  while (posicion !== -1) {
    let inicio = posicion + frontera.length;

    // '--' justo después de la frontera marca el final.
    if (cuerpo.subarray(inicio, inicio + 2).toString('latin1') === '--') break;

    // Salto de línea tras la frontera.
    if (cuerpo.subarray(inicio, inicio + 2).toString('latin1') === '\r\n') inicio += 2;

    const finCabeceras = cuerpo.indexOf('\r\n\r\n', inicio);
    if (finCabeceras === -1) break;

    const cabeceras = cuerpo.subarray(inicio, finCabeceras).toString('utf8');
    const inicioCuerpo = finCabeceras + 4;

    const siguiente = cuerpo.indexOf(frontera, inicioCuerpo);
    if (siguiente === -1) break;

    // El CRLF anterior a la frontera no forma parte del contenido.
    const finCuerpo = Math.max(inicioCuerpo, siguiente - 2);
    const contenido = cuerpo.subarray(inicioCuerpo, finCuerpo);

    const disposicion = /content-disposition:([^\r\n]*)/i.exec(cabeceras);
    if (disposicion) {
      const nombreCampo = /name="([^"]*)"/i.exec(disposicion[1]);
      const nombreArchivo = /filename="([^"]*)"/i.exec(disposicion[1]);
      const tipoParte = /content-type:([^\r\n]*)/i.exec(cabeceras);
      const nombre = nombreCampo ? nombreCampo[1] : '';

      if (nombreArchivo) {
        archivos.push({
          campo: nombre,
          nombre: decodificarNombre(nombreArchivo[1]),
          mime: tipoParte ? tipoParte[1].trim() : 'application/octet-stream',
          datos: contenido,
        });
      } else if (nombre) {
        campos[nombre] = contenido.toString('utf8');
      }
    }

    posicion = siguiente;
  }

  return { campos, archivos };
}

/**
 * Los navegadores envían el nombre del archivo en UTF-8 dentro de la
 * cabecera. Si llega con caracteres escapados, se intenta reconstruir.
 */
function decodificarNombre(nombre) {
  if (!nombre) return 'archivo';
  try {
    return decodeURIComponent(nombre);
  } catch {
    return nombre;
  }
}

/* --------------------------------------------------------------------------
   Respuestas
   -------------------------------------------------------------------------- */

export function aplicarCors(req, res, origenes) {
  const origen = req.headers.origin;
  if (origen && (origenes.includes('*') || origenes.includes(origen))) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
}

export function aplicarCabecerasSeguridad(res, { produccion = false } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (produccion) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

export function responderJson(res, estado, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
    'Cache-Control': 'no-store',
  });
  res.end(cuerpo);
}

export function responderError(res, err) {
  const estado = err instanceof ErrorHttp ? err.estado : 500;
  const mensaje = err instanceof ErrorHttp
    ? err.message
    : 'Error interno del servidor.';

  if (estado >= 500) console.error('[servidor]', err);

  responderJson(res, estado, { error: mensaje });
}

/**
 * Envía un archivo descargable. El nombre se escapa para no romper la
 * cabecera Content-Disposition.
 */
export function responderArchivo(res, { datos, nombre, mime }, { descarga = true } = {}) {
  const nombreSeguro = String(nombre || 'archivo').replace(/["\\\r\n]/g, '_');
  res.writeHead(200, {
    'Content-Type': mime || 'application/octet-stream',
    'Content-Length': datos.length,
    'Content-Disposition': `${descarga ? 'attachment' : 'inline'}; filename="${nombreSeguro}"; filename*=UTF-8''${encodeURIComponent(nombreSeguro)}`,
    'Cache-Control': 'private, max-age=0, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(datos);
}

/** Extrae los parámetros de la URL. */
export function parametros(url) {
  return Object.fromEntries(url.searchParams.entries());
}
