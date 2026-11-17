/**
 * eventos.js
 * ----------
 * Bus de eventos en tiempo real para la BIBLIOTECA VIRTUAL.
 *
 * Usa Server-Sent Events (SSE): un endpoint HTTP abierto (`GET /api/eventos`)
 * al que cada equipo conectado se suscribe con `EventSource`. Cuando un docente
 * sube, edita o elimina un libro, el servidor emite una señal y TODOS los
 * equipos refrescan la biblioteca al instante, sin recargar la página.
 *
 * Solo se emiten señales ("hay cambios en la biblioteca"), nunca datos: la
 * recarga real la hace el frontend autenticado pidiendo /api/libros con su
 * token. Por eso la ruta puede ser pública sin filtrar información.
 */

export function crearBusEventos() {
  /** @type {Set<{res: import('node:http').ServerResponse, keepalive: NodeJS.Timeout}>} */
  const clientes = new Set();

  /**
   * Suscribe una conexión SSE hasta que el cliente se desconecte.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  function manejarSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Por si hubiera un proxy inverso delante (nginx/traefik): sin buffering.
      'X-Accel-Buffering': 'no',
    });
    res.write(': conectado\n\n');

    // Keep-alive invisible para EventSource; evita que proxies cierren la conexión.
    const keepalive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* la conexión ya cerró */ }
    }, 25000);

    const registro = { res, keepalive };
    clientes.add(registro);

    req.on('close', () => {
      clearInterval(keepalive);
      clientes.delete(registro);
    });
  }

  /**
   * Emite una señal a todos los clientes conectados.
   * @param {string} tipo nombre del evento (p. ej. 'biblioteca')
   * @param {object} [datos] carga útil opcional (NO incluir datos sensibles)
   */
  function emitir(tipo, datos = {}) {
    const cuerpo = `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
    for (const { res } of clientes) {
      try { res.write(cuerpo); } catch { /* cliente desconectado a mitad de envío */ }
    }
  }

  /** Número de clientes conectados (para diagnóstico). */
  function clientesConectados() {
    return clientes.size;
  }

  return { manejarSSE, emitir, clientesConectados };
}
