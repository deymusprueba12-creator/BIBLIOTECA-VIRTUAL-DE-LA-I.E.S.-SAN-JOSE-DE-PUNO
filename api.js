/*
 * api.js
 * ------
 * Cliente del API de la BIBLIOTECA VIRTUAL.
 *
 * Todo el estado compartido (libros, tareas, entregas, calificaciones,
 * notificaciones) vive en el servidor. Este archivo es el ÚNICO punto del
 * frontend que habla con él; así no hay llamadas sueltas ni rutas repetidas.
 *
 * El token de sesión se guarda en localStorage. El servidor solo conserva su
 * SHA-256, y todas las peticiones se validan allí: ocultar botones en el
 * navegador no protege nada.
 */
(function () {
  'use strict';

  var CONFIG = window.HEMEROTECA_CONFIG || {};
  var BASE = String(CONFIG.apiUrl || 'http://127.0.0.1:3000').replace(/\/+$/, '');
  var CLAVE_TOKEN = 'hemeroteca_api_token';
  var CLAVE_USUARIO = 'hemeroteca_api_usuario';

  function leer(clave) {
    try { return localStorage.getItem(clave); } catch (e) { return null; }
  }
  function guardar(clave, valor) {
    try { localStorage.setItem(clave, valor); } catch (e) { /* almacenamiento no disponible */ }
  }
  function borrar(clave) {
    try { localStorage.removeItem(clave); } catch (e) { /* almacenamiento no disponible */ }
  }

  function token() { return leer(CLAVE_TOKEN) || ''; }
  function haySesion() { return !!token(); }

  function guardarSesion(datos) {
    if (!datos || !datos.token) return;
    guardar(CLAVE_TOKEN, datos.token);
    guardar(CLAVE_USUARIO, JSON.stringify(datos.usuario || {}));
  }

  function usuarioGuardado() {
    try {
      var crudo = leer(CLAVE_USUARIO);
      return crudo ? JSON.parse(crudo) : null;
    } catch (e) { return null; }
  }

  function limpiarSesion() {
    borrar(CLAVE_TOKEN);
    borrar(CLAVE_USUARIO);
  }

  /** Error del API con el código HTTP y el mensaje del servidor. */
  function errorDe(respuesta, datos) {
    var mensaje = (datos && datos.error) || ('Error ' + respuesta.status + '.');
    var err = new Error(mensaje);
    err.estado = respuesta.status;
    return err;
  }

  /**
   * Petición normal (JSON o multipart).
   * @param {string} metodo
   * @param {string} ruta
   * @param {{cuerpo?: object|FormData, senal?: AbortSignal}} opciones
   */
  function peticion(metodo, ruta, opciones) {
    var opt = opciones || {};
    var cabeceras = {};
    var t = token();
    if (t) cabeceras.Authorization = 'Bearer ' + t;

    var cuerpo;
    if (opt.cuerpo instanceof FormData) {
      cuerpo = opt.cuerpo;
    } else if (opt.cuerpo !== undefined) {
      cabeceras['Content-Type'] = 'application/json';
      cuerpo = JSON.stringify(opt.cuerpo);
    }

    return fetch(BASE + ruta, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo,
      signal: opt.senal
    }).then(function (respuesta) {
      var tipo = respuesta.headers.get('content-type') || '';
      var leerCuerpo = tipo.indexOf('application/json') !== -1
        ? respuesta.json().catch(function () { return null; })
        : respuesta.text().then(function (texto) { return texto ? { error: texto } : null; });

      return leerCuerpo.then(function (datos) {
        if (!respuesta.ok) {
          if (respuesta.status === 401 && t) {
            limpiarSesion();
            document.dispatchEvent(new CustomEvent('hemeroteca:sesion-expirada'));
          }
          throw errorDe(respuesta, datos);
        }
        return datos;
      });
    }, function (err) {
      var fallo = new Error('No se pudo conectar con el servidor. Comprueba que esté encendido.');
      fallo.estado = 0;
      fallo.causa = err;
      throw fallo;
    });
  }

  // El servidor responde directamente con el objeto de datos
  // (por ejemplo { libros: [...] } o { token, usuario }), no con un sobre
  // { datos: ... }. Por eso estas funciones devuelven el cuerpo tal cual.
  function get(ruta) { return peticion('GET', ruta); }
  function post(ruta, cuerpo) { return peticion('POST', ruta, { cuerpo: cuerpo }); }
  function patch(ruta, cuerpo) { return peticion('PATCH', ruta, { cuerpo: cuerpo }); }
  function del(ruta) { return peticion('DELETE', ruta); }

  /** Descarga autenticada: el archivo nunca es público ni tiene URL directa. */
  function descargar(ruta, nombreSugerido) {
    var cabeceras = {};
    var t = token();
    if (t) cabeceras.Authorization = 'Bearer ' + t;

    return fetch(BASE + ruta, { headers: cabeceras }).then(function (respuesta) {
      if (!respuesta.ok) {
        return respuesta.json().catch(function () { return null; }).then(function (datos) {
          throw errorDe(respuesta, datos);
        });
      }
      return respuesta.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        var enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombreSugerido || 'archivo';
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        return true;
      });
    });
  }

  /** Devuelve un object URL para previsualizar (el llamador lo revoca). */
  function objetoUrl(ruta) {
    var cabeceras = {};
    var t = token();
    if (t) cabeceras.Authorization = 'Bearer ' + t;

    return fetch(BASE + ruta, { headers: cabeceras }).then(function (respuesta) {
      if (!respuesta.ok) throw errorDe(respuesta, null);
      return respuesta.blob();
    }).then(function (blob) { return URL.createObjectURL(blob); });
  }

  window.HEMEROTECA_API = {
    base: BASE,
    haySesion: haySesion,
    token: token,
    usuarioGuardado: usuarioGuardado,
    guardarSesion: guardarSesion,
    limpiarSesion: limpiarSesion,
    peticion: peticion,
    descargar: descargar,
    objetoUrl: objetoUrl,

    salud: function () { return get('/api/salud'); },
    areas: function () { return get('/api/areas'); },

    login: function (usuario, contrasena) {
      return post('/api/auth/login', { usuario: usuario, contrasena: contrasena })
        .then(function (datos) { guardarSesion(datos); return datos; });
    },
    logout: function () {
      return post('/api/auth/logout', {}).catch(function () { return null; })
        .then(function () { limpiarSesion(); });
    },
    sesion: function () { return get('/api/auth/sesion'); },

    usuarios: function (rol) { return get('/api/usuarios' + (rol ? '?rol=' + encodeURIComponent(rol) : '')); },
    crearUsuario: function (datos) { return post('/api/usuarios', datos).then(function (d) { return d.usuario; }); },
    actualizarUsuario: function (id, datos) { return patch('/api/usuarios/' + id, datos).then(function (d) { return d.usuario; }); },

    libros: function (filtros) {
      var q = [];
      if (filtros && filtros.area) q.push('area=' + encodeURIComponent(filtros.area));
      if (filtros && filtros.q) q.push('q=' + encodeURIComponent(filtros.q));
      if (filtros && filtros.autor) q.push('autor=' + encodeURIComponent(filtros.autor));
      return get('/api/libros' + (q.length ? '?' + q.join('&') : '')).then(function (d) { return d.libros; });
    },
    crearLibro: function (formData) {
      return peticion('POST', '/api/libros', { cuerpo: formData }).then(function (d) { return d.libro; });
    },
    actualizarLibro: function (id, cambios) { return patch('/api/libros/' + id, cambios).then(function (d) { return d.libro; }); },
    eliminarLibro: function (id) { return del('/api/libros/' + id); },
    descargarLibro: function (libro) {
      return descargar('/api/libros/' + libro.id + '/archivo', libro.archivo ? libro.archivo.nombre : 'libro');
    },

    tareas: function (filtros) {
      var q = [];
      if (filtros && filtros.area) q.push('area=' + encodeURIComponent(filtros.area));
      if (filtros && filtros.estado) q.push('estado=' + encodeURIComponent(filtros.estado));
      if (filtros && filtros.q) q.push('q=' + encodeURIComponent(filtros.q));
      return get('/api/tareas' + (q.length ? '?' + q.join('&') : '')).then(function (d) { return d.tareas; });
    },
    tarea: function (id) { return get('/api/tareas/' + id).then(function (d) { return d.tarea; }); },
    crearTarea: function (datos) { return post('/api/tareas', datos).then(function (d) { return d.tarea; }); },
    actualizarTarea: function (id, datos) { return patch('/api/tareas/' + id, datos).then(function (d) { return d.tarea; }); },
    eliminarTarea: function (id) { return del('/api/tareas/' + id); },
    publicarTarea: function (id, publicada) {
      return post('/api/tareas/' + id + '/publicacion', { publicada: publicada }).then(function (d) { return d.tarea; });
    },
    agregarAdjunto: function (tareaId, formData) {
      return peticion('POST', '/api/tareas/' + tareaId + '/adjuntos', { cuerpo: formData })
        .then(function (d) { return d.tarea; });
    },
    eliminarAdjunto: function (tareaId, adjuntoId) { return del('/api/tareas/' + tareaId + '/adjuntos/' + adjuntoId); },
    descargarAdjunto: function (tareaId, adjunto) {
      return descargar('/api/tareas/' + tareaId + '/adjuntos/' + adjunto.id + '/archivo', adjunto.nombre);
    },

    entregas: function (filtros) {
      var q = [];
      ['area', 'tarea', 'estudiante', 'estado', 'desde', 'hasta'].forEach(function (k) {
        if (filtros && filtros[k]) q.push(k + '=' + encodeURIComponent(filtros[k]));
      });
      return get('/api/entregas' + (q.length ? '?' + q.join('&') : '')).then(function (d) { return d.entregas; });
    },
    entrega: function (id) { return get('/api/entregas/' + id).then(function (d) { return d.entrega; }); },
    entregar: function (tareaId, formData) {
      return peticion('POST', '/api/tareas/' + tareaId + '/entregas', { cuerpo: formData })
        .then(function (d) { return d.entrega; });
    },
    calificar: function (id, datos) { return patch('/api/entregas/' + id, datos).then(function (d) { return d.entrega; }); },
    descargarEntrega: function (entrega) {
      return descargar('/api/entregas/' + entrega.id + '/archivo', entrega.archivo ? entrega.archivo.nombre : 'entrega');
    },
    calificaciones: function (filtros) {
      var q = [];
      if (filtros && filtros.area) q.push('area=' + encodeURIComponent(filtros.area));
      if (filtros && filtros.estudiante) q.push('estudiante=' + encodeURIComponent(filtros.estudiante));
      return get('/api/calificaciones' + (q.length ? '?' + q.join('&') : '')).then(function (d) { return d.calificaciones; });
    },

    notificaciones: function (soloNoLeidas) {
      return get('/api/notificaciones' + (soloNoLeidas ? '?soloNoLeidas=1' : ''));
    },
    marcarLeidas: function (id) { return post('/api/notificaciones/leidas', id ? { id: id } : {}); }
  };
})();
