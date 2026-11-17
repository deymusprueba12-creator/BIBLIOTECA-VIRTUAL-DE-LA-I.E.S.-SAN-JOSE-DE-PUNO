/*
 * tareas-ui.js
 * ------------
 * Tareas y actividades académicas, entregas, calificaciones y notificaciones.
 *
 * Reglas que se aplican en la interfaz (y que el servidor vuelve a validar):
 *   - El docente crea, edita, publica, elimina y califica.
 *   - El estudiante solo ve tareas publicadas, entrega sus trabajos y consulta
 *     sus propias notas. No puede editar tareas ni calificaciones ajenas.
 *   - Después del plazo no se entrega, salvo que el docente haya habilitado
 *     una nueva oportunidad.
 */
(function () {
  'use strict';

  var T = {
    tareas: [],
    entregas: [],
    calificaciones: [],
    notificaciones: [],
    sinLeer: 0,
    edicion: null,
    tareaEntrega: null,
    filtroArea: 'todos',
    filtroEstado: 'todos',
    temporizador: null,
    temporizadorNotif: null,
    adjuntosPendientes: []
  };

  var ESTADOS = {
    pendiente: 'Pendiente',
    entregada: 'Entregada',
    en_revision: 'En revisión',
    calificada: 'Calificada',
    fuera_de_plazo: 'Fuera de plazo'
  };

  function api() { return window.HEMEROTECA_API; }

  function etiquetaArea(id) {
    var perfil = window.Clasificador && window.Clasificador.perfiles.filter(function (p) { return p.id === id; })[0];
    if (perfil) return perfil.etiqueta;
    var area = (window.AREAS || []).filter(function (a) { return a.id === id; })[0];
    return area ? area.nombre : id;
  }

  function colorArea(id) {
    var area = (window.AREAS || []).filter(function (a) { return a.id === id; })[0];
    return area ? area.color : '#4f46e5';
  }

  function claseEstado(estado) {
    return 'estado estado-' + String(estado || 'pendiente').replace(/_/g, '-');
  }

  function rellenarSelect(select, conTodas) {
    if (!select) return;
    var valor = select.value;
    var html = conTodas ? '<option value="">Todas las áreas</option>' : '<option value="">Selecciona un área</option>';
    (window.AREAS || []).forEach(function (area) {
      html += '<option value="' + esc(area.id) + '">' + esc(area.nombre) + '</option>';
    });
    select.innerHTML = html;
    if (valor) select.value = valor;
  }

  function rellenarFiltros() {
    rellenarSelect(document.getElementById('tareaArea'), false);
    rellenarSelect(document.getElementById('entregaFiltroArea'), true);
    rellenarSelect(document.getElementById('calificacionFiltroArea'), true);
    rellenarFiltroTareas();
  }

  /** Selector de entregas por tarea: se rellena con las tareas cargadas. */
  function rellenarFiltroTareas() {
    var select = document.getElementById('entregaFiltroTarea');
    if (!select) return;
    var valor = select.value;
    var html = '<option value="">Todas las tareas</option>';
    T.tareas.forEach(function (t) {
      html += '<option value="' + esc(t.id) + '">' + esc(t.titulo) + '</option>';
    });
    select.innerHTML = html;
    if (valor && T.tareas.some(function (t) { return t.id === valor; })) select.value = valor;
  }

  function paraInputLocal(iso) {
    if (!iso) return '';
    var fecha = new Date(iso);
    if (isNaN(fecha.getTime())) return '';
    function dos(n) { return String(n).padStart(2, '0'); }
    return fecha.getFullYear() + '-' + dos(fecha.getMonth() + 1) + '-' + dos(fecha.getDate()) +
      'T' + dos(fecha.getHours()) + ':' + dos(fecha.getMinutes());
  }

  function fechaLegible(iso) {
    if (!iso) return 'Sin fecha límite';
    try { return formatearFechaHora(iso); } catch (e) { return iso; }
  }

  /* ================================================================== */
  /* TAREAS                                                             */
  /* ================================================================== */

  function cargarTareas() {
    return api().tareas({}).then(function (tareas) {
      T.tareas = tareas;
      estado.tareas = tareas;
      rellenarFiltroTareas();
      renderTareas();
      actualizarContadores();
      return tareas;
    }).catch(function (err) {
      var grid = document.getElementById('gridTareas');
      if (grid) {
        grid.innerHTML = '<div class="vacio"><span class="ico">⚠️</span><h3>No se pudieron cargar las tareas</h3><p>' +
          esc(err.message) + '</p></div>';
      }
      throw err;
    });
  }

  function estadoDeTarea(t) {
    if (esDocente()) return t.publicada ? 'publicada' : 'borrador';
    return t.miEntrega ? t.miEntrega.estado : (t.vencida ? 'fuera_de_plazo' : 'pendiente');
  }

  function renderFiltrosTareas() {
    var contenedor = document.getElementById('filtrosTarea');
    if (!contenedor) return;

    var html = '<button type="button" class="filtro' + (T.filtroArea === 'todos' ? ' activo' : '') + '" data-filtro-area="todos">Todas</button>';
    (window.AREAS || []).forEach(function (area) {
      var hay = T.tareas.some(function (t) { return t.area === area.id; });
      if (!hay) return;
      html += '<button type="button" class="filtro' + (T.filtroArea === area.id ? ' activo' : '') +
        '" data-filtro-area="' + esc(area.id) + '">' + esc(etiquetaArea(area.id)) + '</button>';
    });

    if (esDocente()) {
      html += '<span class="filtro-sep" aria-hidden="true"></span>';
      ['todos', 'publicada', 'borrador'].forEach(function (e) {
        var texto = e === 'todos' ? 'Todo estado' : e === 'publicada' ? 'Publicadas' : 'Borradores';
        html += '<button type="button" class="filtro' + (T.filtroEstado === e ? ' activo' : '') +
          '" data-filtro-estado="' + e + '">' + texto + '</button>';
      });
    } else {
      html += '<span class="filtro-sep" aria-hidden="true"></span>';
      ['todos', 'pendiente', 'entregada', 'en_revision', 'calificada', 'fuera_de_plazo'].forEach(function (e) {
        var texto = e === 'todos' ? 'Todo estado' : ESTADOS[e];
        html += '<button type="button" class="filtro' + (T.filtroEstado === e ? ' activo' : '') +
          '" data-filtro-estado="' + e + '">' + texto + '</button>';
      });
    }

    contenedor.innerHTML = html;
  }

  function tareasFiltradas() {
    var busqueda = (estado.busqueda.tarea || '').toLowerCase();
    return T.tareas.filter(function (t) {
      if (T.filtroArea !== 'todos' && t.area !== T.filtroArea) return false;
      if (T.filtroEstado !== 'todos' && estadoDeTarea(t) !== T.filtroEstado) return false;
      if (busqueda) {
        var texto = (t.titulo + ' ' + t.instrucciones).toLowerCase();
        if (texto.indexOf(busqueda) === -1) return false;
      }
      return true;
    });
  }

  function adjuntosHtml(tarea) {
    if (!tarea.adjuntos || !tarea.adjuntos.length) return '';
    return '<div class="tarea-adjuntos"><span class="tarea-adjuntos-titulo">Material adjunto</span>' +
      tarea.adjuntos.map(function (a) {
        return '<button type="button" class="btn btn-sm btn-soft" data-accion="adjunto" data-adjunto="' + esc(a.id) + '">' +
          '&#128206; ' + esc(a.nombre) + '</button>';
      }).join('') + '</div>';
  }

  function tarjetaTarea(tarea) {
    var estadoT = estadoDeTarea(tarea);
    var etiquetaEstado = esDocente()
      ? (estadoT === 'publicada' ? 'Publicada' : 'Borrador')
      : ESTADOS[estadoT] || estadoT;

    var nota = '';
    if (!esDocente() && tarea.miEntrega && tarea.miEntrega.calificacion !== null && tarea.miEntrega.calificacion !== undefined) {
      nota = '<div class="tarea-nota"><strong>' + esc(tarea.miEntrega.calificacion) + '</strong> / ' +
        esc(tarea.puntajeMaximo) + '</div>';
    }

    var observaciones = (!esDocente() && tarea.miEntrega && tarea.miEntrega.observaciones)
      ? '<div class="tarea-observaciones"><b>Observaciones del docente:</b> ' + esc(tarea.miEntrega.observaciones) + '</div>'
      : '';

    var vencida = tarea.vencida
      ? '<span class="tag tag-naranja">Plazo vencido</span>'
      : '';

    var acciones = '';
    if (esDocente()) {
      acciones = '<button type="button" class="btn btn-sm btn-soft" data-accion="editar-tarea">Editar</button>' +
        '<button type="button" class="btn btn-sm btn-soft" data-accion="publicar-tarea">' +
          (tarea.publicada ? 'Despublicar' : 'Publicar') + '</button>' +
        '<button type="button" class="btn btn-sm btn-peligro" data-accion="eliminar-tarea">Eliminar</button>' +
        '<button type="button" class="btn btn-sm btn-primario" data-accion="ver-entregas">Entregas (' + tarea.entregasTotal + ')</button>';
    } else {
      var puedeEntregar = tarea.publicada && (!tarea.vencida || tarea.permiteReapertura);
      var yaCalificada = tarea.miEntrega && tarea.miEntrega.estado === 'calificada' && !tarea.permiteReapertura;
      if (puedeEntregar && !yaCalificada) {
        acciones += '<button type="button" class="btn btn-sm btn-primario" data-accion="entregar">' +
          (tarea.miEntrega ? 'Reemplazar entrega' : 'Entregar tarea') + '</button>';
      }
      if (tarea.miEntrega) {
        acciones += '<span class="tag tag-verde">Entrega registrada</span>';
      }
      if (yaCalificada) {
        acciones += '<span class="chip chip-mini">Entrega cerrada</span>';
      }
    }

    return '<article class="card card-tarea" data-id="' + esc(tarea.id) + '" style="--area-color:' + esc(colorArea(tarea.area)) + '">' +
      '<div class="tarea-cabecera">' +
        '<span class="tarea-area" style="background:' + esc(colorArea(tarea.area)) + '">' + esc(etiquetaArea(tarea.area)) + '</span>' +
        '<span class="' + claseEstado(estadoT === 'publicada' ? 'entregada' : estadoT) + '">' + esc(etiquetaEstado) + '</span>' +
      '</div>' +
      '<div class="tarea-cuerpo">' +
        '<h3 class="card-titulo">' + esc(tarea.titulo) + '</h3>' +
        '<p class="tarea-meta">' +
          '<span title="Fecha límite">&#128197; ' + esc(fechaLegible(tarea.limiteEn)) + '</span>' +
          '<span title="Puntaje máximo">&#127991; ' + esc(tarea.puntajeMaximo) + ' pts</span>' +
          vencida +
        '</p>' +
        '<details class="tarea-detalle"><summary>Instrucciones</summary>' +
          '<p>' + esc(tarea.instrucciones) + '</p>' +
          (tarea.indicaciones ? '<p class="tarea-indicaciones">' + esc(tarea.indicaciones) + '</p>' : '') +
        '</details>' +
        adjuntosHtml(tarea) +
        nota + observaciones +
        '<div class="tarea-acciones">' + acciones + '</div>' +
      '</div>' +
    '</article>';
  }

  function renderTareas() {
    renderFiltrosTareas();
    var grid = document.getElementById('gridTareas');
    if (!grid) return;

    var lista = tareasFiltradas();

    if (!lista.length) {
      grid.innerHTML = '<div class="vacio"><span class="ico">' + (esDocente() ? '📝' : '📚') + '</span>' +
        '<h3>' + (esDocente() ? 'Todavía no hay tareas' : 'No hay tareas en esta vista') + '</h3>' +
        '<p>' + (esDocente()
          ? 'Crea la primera actividad con el formulario de arriba, asígnala a un área y publícala.'
          : 'Cuando el docente publique una actividad aparecerá aquí.') + '</p></div>';
    } else {
      grid.innerHTML = lista.map(tarjetaTarea).join('');
    }

    var nota = document.getElementById('notaTareas');
    if (nota) {
      nota.textContent = esDocente()
        ? lista.length + ' tarea(s) · ' + T.tareas.filter(function (t) { return !t.publicada; }).length + ' en borrador.'
        : lista.length + ' actividad(es) publicadas.';
    }

    actualizarContadores();
  }

  /* ------------------------------ Formulario ------------------------ */

  function nuevoFormulario() {
    T.edicion = null;
    T.adjuntosPendientes = [];
    var form = document.getElementById('formTarea');
    if (form) form.reset();
    document.getElementById('tareaEditando').value = '';
    document.getElementById('tareaPuntaje').value = 20;
    document.getElementById('tareaPublicada').checked = true;
    document.getElementById('tareaReapertura').checked = false;
    document.getElementById('tituloFormTarea').textContent = 'Nueva tarea o actividad';
    document.getElementById('btnGuardarTarea').textContent = 'Guardar tarea';
    document.getElementById('avisoEdicionTarea').classList.add('oculto');
    document.getElementById('tareaAdjuntosLista').innerHTML = '';
  }

  function editarTarea(id) {
    var tarea = T.tareas.filter(function (t) { return t.id === id; })[0];
    if (!tarea) return;

    if (!Array.isArray(tarea.adjuntos)) {
      // La lista podría no traer los adjuntos: se piden al detalle antes de editar.
      api().tarea(id).then(function (completa) {
        T.tareas = T.tareas.map(function (t) { return t.id === id ? completa : t; });
        editarTarea(id);
      }).catch(function (err) { toast(err.message, 'error', 7000); });
      return;
    }

    T.edicion = id;
    document.getElementById('tareaTitulo').value = tarea.titulo || '';
    document.getElementById('tareaArea').value = tarea.area;
    document.getElementById('tareaPuntaje').value = tarea.puntajeMaximo || 20;
    document.getElementById('tareaLimite').value = paraInputLocal(tarea.limiteEn);
    document.getElementById('tareaPublicacion').value = paraInputLocal(tarea.fechaPublicacion);
    document.getElementById('tareaInstrucciones').value = tarea.instrucciones || '';
    document.getElementById('tareaIndicaciones').value = tarea.indicaciones || '';
    document.getElementById('tareaPublicada').checked = !!tarea.publicada;
    document.getElementById('tareaReapertura').checked = !!tarea.permiteReapertura;
    document.getElementById('tareaEditando').value = id;
    document.getElementById('tituloFormTarea').textContent = 'Editar tarea';
    document.getElementById('btnGuardarTarea').textContent = 'Guardar cambios';
    document.getElementById('avisoEdicionTarea').classList.remove('oculto');
    document.getElementById('tareaAdjuntosLista').innerHTML = (tarea.adjuntos || []).map(function (a) {
      return '<li>' + esc(a.nombre) + ' <button type="button" class="btn-link" data-quitar-adjunto="' + esc(a.id) + '">Quitar</button></li>';
    }).join('');
    document.getElementById('tareaTitulo').focus();
    document.getElementById('sec-tareas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function leerFormulario() {
    var titulo = document.getElementById('tareaTitulo').value.trim();
    var area = document.getElementById('tareaArea').value;
    var instrucciones = document.getElementById('tareaInstrucciones').value.trim();
    var limite = document.getElementById('tareaLimite').value;
    var publicacion = document.getElementById('tareaPublicacion').value;

    if (!titulo) { toast('Escribe el título de la tarea.', 'alerta'); return null; }
    if (!area) { toast('Selecciona el área curricular.', 'alerta'); return null; }
    if (!instrucciones) { toast('Escribe las instrucciones de la tarea.', 'alerta'); return null; }
    if (!limite) { toast('Indica la fecha y hora límite.', 'alerta'); return null; }

    return {
      titulo: titulo,
      area: area,
      instrucciones: instrucciones,
      indicaciones: document.getElementById('tareaIndicaciones').value.trim(),
      limiteEn: new Date(limite).toISOString(),
      fechaPublicacion: publicacion ? new Date(publicacion).toISOString() : null,
      puntajeMaximo: Number(document.getElementById('tareaPuntaje').value) || 20,
      permiteReapertura: document.getElementById('tareaReapertura').checked,
      publicada: document.getElementById('tareaPublicada').checked
    };
  }

  function guardarTarea(evento) {
    evento.preventDefault();
    if (!esDocente()) { toast('Solo el docente puede administrar tareas.', 'alerta'); return; }

    var datos = leerFormulario();
    if (!datos) return;

    var archivos = document.getElementById('tareaAdjuntos').files;
    var adjuntos = Array.prototype.slice.call(archivos || []);

    var id = T.edicion;
    progresoMostrar(id ? 'Guardando cambios…' : 'Creando la tarea…', 'Validando los datos.');

    var operacion = id
      ? api().actualizarTarea(id, datos)
      : api().crearTarea(datos);

    operacion.then(function (tarea) {
      if (!adjuntos.length) return tarea;
      return subirAdjuntos(tarea.id, adjuntos).then(function () { return tarea; });
    }).then(function (tarea) {
      progresoOcultar();
      toast(id ? 'Tarea actualizada.' : 'Tarea «' + tarea.titulo + '» guardada.', 'ok');
      nuevoFormulario();
      return cargarTareas();
    }).catch(function (err) {
      progresoOcultar();
      toast(err.message, 'error', 8000);
    });
  }

  function subirAdjuntos(tareaId, archivos) {
    var cadena = Promise.resolve();
    archivos.forEach(function (archivo) {
      cadena = cadena.then(function () {
        var fd = new FormData();
        fd.append('archivo', archivo);
        fd.append('tipo', 'material');
        return api().agregarAdjunto(tareaId, fd);
      });
    });
    return cadena;
  }

  function eliminarTarea(id) {
    var tarea = T.tareas.filter(function (t) { return t.id === id; })[0];
    if (!tarea) return;
    confirmar('Eliminar tarea', 'Se eliminará «' + tarea.titulo + '», sus adjuntos y las entregas de los estudiantes. Esta acción no se puede deshacer.', 'Eliminar', true)
      .then(function (ok) {
        if (!ok) return;
        api().eliminarTarea(id).then(function () {
          toast('Tarea eliminada.', 'ok');
          if (T.edicion === id) nuevoFormulario();
          return cargarTareas();
        }).catch(function (err) { toast(err.message, 'error', 7000); });
      });
  }

  function alternarPublicacion(id) {
    var tarea = T.tareas.filter(function (t) { return t.id === id; })[0];
    if (!tarea) return;
    api().publicarTarea(id, !tarea.publicada).then(function (actualizada) {
      toast(actualizada.publicada ? 'Tarea publicada. Los estudiantes recibirán el aviso.' : 'Tarea despublicada.', 'ok');
      return cargarTareas();
    }).catch(function (err) { toast(err.message, 'error', 7000); });
  }

  /* ================================================================== */
  /* ENTREGAS                                                           */
  /* ================================================================== */

  function cargarEntregas() {
    var filtros = {};
    if (esDocente()) {
      filtros.area = document.getElementById('entregaFiltroArea').value || '';
      filtros.tarea = document.getElementById('entregaFiltroTarea').value || '';
      filtros.estado = document.getElementById('entregaFiltroEstado').value || '';
      filtros.desde = document.getElementById('entregaFiltroDesde').value || '';
      filtros.hasta = document.getElementById('entregaFiltroHasta').value || '';
    }
    return api().entregas(filtros).then(function (entregas) {
      T.entregas = entregas;
      renderEntregas();
      actualizarContadores();
      return entregas;
    }).catch(function (err) {
      var contenedor = document.getElementById('tablaEntregas');
      if (contenedor) contenedor.innerHTML = '<div class="vacio"><span class="ico">⚠️</span><h3>No se pudieron cargar las entregas</h3><p>' + esc(err.message) + '</p></div>';
      throw err;
    });
  }

  function filaEntrega(e) {
    var docente = esDocente();
    var estudianteFiltro = (document.getElementById('entregaFiltroEstudiante').value || '').trim().toLowerCase();
    if (docente && estudianteFiltro) {
      var nombre = (e.estudianteNombre + ' ' + e.estudianteUsuario).toLowerCase();
      if (nombre.indexOf(estudianteFiltro) === -1) return '';
    }

    return '<tr data-id="' + esc(e.id) + '">' +
      (docente ? '<td><strong>' + esc(e.estudianteNombre) + '</strong><br><small>@' + esc(e.estudianteUsuario) + '</small></td>' : '') +
      '<td><span class="tarea-area tarea-area-mini" style="background:' + esc(colorArea(e.area)) + '">' + esc(etiquetaArea(e.area)) + '</span></td>' +
      '<td>' + esc(e.tareaTitulo) + '</td>' +
      '<td>' + esc(fechaLegible(e.entregadaEn)) + '</td>' +
      '<td>' + esc(e.archivo ? e.archivo.nombre : '—') + '</td>' +
      '<td><span class="' + claseEstado(e.estado) + '">' + esc(ESTADOS[e.estado] || e.estado) + '</span></td>' +
      '<td>' + (e.calificacion === null || e.calificacion === undefined
        ? '<span class="tenue">Sin nota</span>'
        : '<strong>' + esc(e.calificacion) + '</strong> / ' + esc(e.puntajeMaximo)) + '</td>' +
      '<td class="celda-obs">' + (e.observaciones ? esc(e.observaciones) : '<span class="tenue">—</span>') + '</td>' +
      '<td class="celda-acciones">' +
        '<button type="button" class="btn btn-sm btn-soft" data-accion="descargar-entrega">Descargar</button>' +
        (docente ? '<button type="button" class="btn btn-sm btn-primario" data-accion="calificar">Calificar</button>' : '') +
      '</td>' +
    '</tr>';
  }

  function renderEntregas() {
    var contenedor = document.getElementById('tablaEntregas');
    if (!contenedor) return;
    var docente = esDocente();
    var filas = T.entregas.map(filaEntrega).filter(Boolean);

    var nota = document.getElementById('notaEntregas');
    if (nota) {
      nota.textContent = docente
        ? T.entregas.length + ' entrega(s) registradas · ' +
          T.entregas.filter(function (e) { return e.estado === 'entregada' || e.estado === 'fuera_de_plazo'; }).length + ' por revisar.'
        : T.entregas.length + ' entrega(s) propias.';
    }

    if (!filas.length) {
      contenedor.innerHTML = '<div class="vacio"><span class="ico">📥</span><h3>' +
        (docente ? 'No hay entregas en esta vista' : 'Todavía no has entregado tareas') + '</h3><p>' +
        (docente ? 'Cuando un estudiante entregue una actividad aparecerá aquí.' : 'Abre «Mis tareas», elige una actividad y adjunta tu trabajo.') +
        '</p></div>';
      return;
    }

    contenedor.innerHTML = '<table class="tabla">' +
      '<thead><tr>' +
        (docente ? '<th>Estudiante</th>' : '') +
        '<th>Área</th><th>Tarea</th><th>Entregada</th><th>Archivo</th><th>Estado</th><th>Nota</th><th>Observaciones</th><th>Acciones</th>' +
      '</tr></thead><tbody>' + filas.join('') + '</tbody></table>';
  }

  function abrirCalificar(id) {
    var entrega = T.entregas.filter(function (e) { return e.id === id; })[0];
    if (!entrega) return;
    document.getElementById('calificarEntregaId').value = id;
    document.getElementById('calificarSub').textContent = entrega.estudianteNombre + ' · ' + entrega.tareaTitulo;
    document.getElementById('calificarMax').textContent = entrega.puntajeMaximo;
    document.getElementById('calificarNota').value = entrega.calificacion === null ? '' : entrega.calificacion;
    document.getElementById('calificarNota').max = entrega.puntajeMaximo;
    document.getElementById('calificarEstado').value =
      entrega.calificacion === null ? entrega.estado : 'calificada';
    document.getElementById('calificarObs').value = entrega.observaciones || '';
    document.getElementById('calificarError').textContent = '';
    document.getElementById('calificarError').classList.remove('visible');
    document.getElementById('modalCalificar').removeAttribute('hidden');
  }

  function cerrarCalificar() {
    document.getElementById('modalCalificar').setAttribute('hidden', '');
  }

  function guardarCalificacion() {
    var id = document.getElementById('calificarEntregaId').value;
    var nota = document.getElementById('calificarNota').value;
    var estadoNuevo = document.getElementById('calificarEstado').value;
    var observaciones = document.getElementById('calificarObs').value.trim();
    var error = document.getElementById('calificarError');

    if (estadoNuevo === 'calificada' && nota === '') {
      error.textContent = 'Para marcar la tarea como calificada asigna una nota.';
      error.classList.add('visible');
      return;
    }

    // Con una nota escrita, lo natural es dejar la entrega como calificada.
    if (nota !== '' && estadoNuevo === 'entregada') estadoNuevo = 'calificada';

    var boton = document.getElementById('calificarGuardar');
    boton.disabled = true;

    api().calificar(id, {
      calificacion: nota === '' ? null : Number(nota),
      estado: estadoNuevo,
      observaciones: observaciones
    }).then(function () {
      boton.disabled = false;
      cerrarCalificar();
      toast(estadoNuevo === 'en_revision' ? 'Se solicitó una corrección al estudiante.' : 'Calificación guardada.', 'ok');
      return Promise.all([cargarEntregas(), cargarCalificaciones(), cargarTareas()]);
    }).catch(function (err) {
      boton.disabled = false;
      error.textContent = err.message;
      error.classList.add('visible');
    });
  }

  /* ================================================================== */
  /* CALIFICACIONES                                                     */
  /* ================================================================== */

  function cargarCalificaciones() {
    var filtros = {
      area: document.getElementById('calificacionFiltroArea').value || ''
    };
    return api().calificaciones(filtros).then(function (lista) {
      T.calificaciones = lista;
      renderCalificaciones();
      actualizarContadores();
      return lista;
    }).catch(function (err) {
      var contenedor = document.getElementById('tablaCalificaciones');
      if (contenedor) contenedor.innerHTML = '<div class="vacio"><span class="ico">⚠️</span><h3>No se pudieron cargar las calificaciones</h3><p>' + esc(err.message) + '</p></div>';
      throw err;
    });
  }

  function renderCalificaciones() {
    var contenedor = document.getElementById('tablaCalificaciones');
    if (!contenedor) return;
    var docente = esDocente();

    var nota = document.getElementById('notaCalificaciones');
    if (nota) {
      nota.textContent = docente
        ? T.calificaciones.length + ' calificación(es) registradas.'
        : T.calificaciones.length + ' calificación(es) en tu historial.';
    }

    if (!T.calificaciones.length) {
      contenedor.innerHTML = '<div class="vacio"><span class="ico">🏅</span><h3>Sin calificaciones todavía</h3><p>' +
        (docente ? 'Califica las entregas y aparecerán en este historial.' : 'Cuando el docente califique tus entregas verás aquí la nota y sus observaciones.') +
        '</p></div>';
      return;
    }

    var filas = T.calificaciones.map(function (c) {
      return '<tr data-id="' + esc(c.id) + '">' +
        (docente ? '<td><strong>' + esc(c.estudianteNombre) + '</strong></td>' : '') +
        '<td><span class="tarea-area tarea-area-mini" style="background:' + esc(colorArea(c.area)) + '">' + esc(etiquetaArea(c.area)) + '</span></td>' +
        '<td>' + esc(c.tareaTitulo) + '</td>' +
        '<td><strong class="nota-grande">' + esc(c.calificacion) + '</strong> / ' + esc(c.puntajeMaximo) + '</td>' +
        '<td>' + esc(fechaLegible(c.evaluadaEn)) + '</td>' +
        '<td class="celda-obs">' + (c.observaciones ? esc(c.observaciones) : '<span class="tenue">—</span>') + '</td>' +
      '</tr>';
    });

    contenedor.innerHTML = '<table class="tabla">' +
      '<thead><tr>' + (docente ? '<th>Estudiante</th>' : '') +
      '<th>Área</th><th>Tarea</th><th>Nota</th><th>Evaluada</th><th>Observaciones</th>' +
      '</tr></thead><tbody>' + filas.join('') + '</tbody></table>';
  }

  /* ================================================================== */
  /* ENTREGA DEL ESTUDIANTE                                             */
  /* ================================================================== */

  function abrirEntrega(id) {
    var tarea = T.tareas.filter(function (t) { return t.id === id; })[0];
    if (!tarea) return;
    if (tarea.vencida && !tarea.permiteReapertura) {
      toast('La fecha límite ya pasó. Pide al docente que habilite una nueva oportunidad.', 'alerta', 8000);
      return;
    }
    T.tareaEntrega = tarea;
    document.getElementById('entregaTareaId').value = id;
    document.getElementById('entregaTitulo').textContent = 'Entregar: ' + tarea.titulo;
    document.getElementById('entregaSub').textContent = 'Área: ' + etiquetaArea(tarea.area) + ' · Límite: ' + fechaLegible(tarea.limiteEn);
    document.getElementById('entregaArchivo').value = '';
    document.getElementById('entregaComentario').value = tarea.miEntrega ? '' : '';
    document.getElementById('entregaError').textContent = '';
    document.getElementById('entregaError').classList.remove('visible');
    var max = (window.HEMEROTECA_CONFIG && window.HEMEROTECA_CONFIG.maxMb) || 1024;
    document.getElementById('entregaMaxMb').textContent = max;
    document.getElementById('modalEntrega').removeAttribute('hidden');
  }

  function cerrarEntrega() {
    document.getElementById('modalEntrega').setAttribute('hidden', '');
    T.tareaEntrega = null;
  }

  function enviarEntrega() {
    if (!T.tareaEntrega) return;
    var input = document.getElementById('entregaArchivo');
    var archivo = input.files && input.files[0];
    var error = document.getElementById('entregaError');

    function fallo(mensaje) {
      error.textContent = mensaje;
      error.classList.add('visible');
    }

    if (!archivo) { fallo('Selecciona el archivo de tu entrega.'); return; }

    var permitidas = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
    var m = /\.([A-Za-z0-9]+)$/.exec(archivo.name);
    var extension = m ? m[1].toLowerCase() : '';
    if (permitidas.indexOf(extension) === -1) {
      fallo('Formato no permitido. Se aceptan PDF, DOC, DOCX, JPG, JPEG y PNG.');
      return;
    }
    var maxMb = (window.HEMEROTECA_CONFIG && window.HEMEROTECA_CONFIG.maxMb) || 1024;
    if (archivo.size > maxMb * 1024 * 1024) {
      fallo('El archivo supera el límite de ' + maxMb + ' MB.');
      return;
    }

    var boton = document.getElementById('entregaEnviar');
    boton.disabled = true;
    boton.textContent = 'Enviando…';

    var fd = new FormData();
    fd.append('archivo', archivo);
    fd.append('comentario', document.getElementById('entregaComentario').value.trim());

    api().entregar(T.tareaEntrega.id, fd).then(function (entrega) {
      boton.disabled = false;
      boton.textContent = 'Enviar entrega';
      cerrarEntrega();
      toast('Entrega registrada. Estado: ' + (ESTADOS[entrega.estado] || entrega.estado) + '.', 'ok');
      return Promise.all([cargarTareas(), cargarEntregas(), cargarCalificaciones(), cargarNotificaciones()]);
    }).catch(function (err) {
      boton.disabled = false;
      boton.textContent = 'Enviar entrega';
      fallo(err.message);
    });
  }

  /* ================================================================== */
  /* NOTIFICACIONES                                                     */
  /* ================================================================== */

  function cargarNotificaciones() {
    if (!api().haySesion()) return Promise.resolve();
    return api().notificaciones().then(function (datos) {
      T.notificaciones = datos.notificaciones || [];
      T.sinLeer = datos.sinLeer || 0;
      renderNotificaciones();
      return datos;
    }).catch(function () { /* la campana no debe romper la app */ });
  }

  function renderNotificaciones() {
    var badge = document.getElementById('badgeNotificaciones');
    if (badge) {
      badge.textContent = T.sinLeer > 99 ? '99+' : T.sinLeer;
      badge.classList.toggle('oculto', T.sinLeer === 0);
    }

    var lista = document.getElementById('listaNotificaciones');
    if (!lista) return;

    if (!T.notificaciones.length) {
      lista.innerHTML = '<p class="notif-vacio">No tienes notificaciones.</p>';
      return;
    }

    lista.innerHTML = T.notificaciones.slice(0, 30).map(function (n) {
      return '<button type="button" class="notif-item' + (n.leida ? '' : ' no-leida') + '" data-notif="' + esc(n.id) + '">' +
        '<strong>' + esc(n.titulo) + '</strong>' +
        (n.detalle ? '<small>' + esc(n.detalle) + '</small>' : '') +
        '<time>' + esc(haceTiempo(n.creadaEn)) + '</time>' +
      '</button>';
    }).join('');
  }

  function alternarNotificaciones() {
    var panel = document.getElementById('panelNotificaciones');
    var boton = document.getElementById('btnNotificaciones');
    if (!panel) return;
    var abrir = panel.classList.contains('oculto');
    panel.classList.toggle('oculto', !abrir);
    boton.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    if (abrir) cargarNotificaciones();
  }

  function marcarTodasLeidas() {
    api().marcarLeidas().then(function (datos) {
      T.sinLeer = datos.sinLeer || 0;
      T.notificaciones = T.notificaciones.map(function (n) { return Object.assign({}, n, { leida: true }); });
      renderNotificaciones();
      toast('Notificaciones marcadas como leídas.', 'ok');
    }).catch(function (err) { toast(err.message, 'error', 6000); });
  }

  /* ================================================================== */
  /* CONTADORES                                                         */
  /* ================================================================== */

  function actualizarContadores() {
    var badgeTareas = document.getElementById('badgeTareas');
    var badgeEntregas = document.getElementById('badgeEntregas');
    var badgeCalificaciones = document.getElementById('badgeCalificaciones');

    if (esDocente()) {
      if (badgeTareas) badgeTareas.textContent = T.tareas.length;
      if (badgeEntregas) {
        badgeEntregas.textContent = T.entregas.filter(function (e) {
          return e.estado === 'entregada' || e.estado === 'fuera_de_plazo';
        }).length;
      }
      if (badgeCalificaciones) badgeCalificaciones.textContent = T.calificaciones.length;
    } else {
      if (badgeTareas) {
        badgeTareas.textContent = T.tareas.filter(function (t) {
          return !t.miEntrega || t.miEntrega.estado === 'en_revision' || t.miEntrega.estado === 'pendiente';
        }).length;
      }
      if (badgeEntregas) badgeEntregas.textContent = T.entregas.length;
      if (badgeCalificaciones) badgeCalificaciones.textContent = T.calificaciones.length;
    }
  }

  /* ================================================================== */
  /* EVENTOS                                                            */
  /* ================================================================== */

  function configurarTareas() {
    rellenarFiltros();
    var max = (window.HEMEROTECA_CONFIG && window.HEMEROTECA_CONFIG.maxMb) || 1024;
    var chip = document.getElementById('chipMaxTarea');
    if (chip) chip.textContent = max;

    document.getElementById('formTarea').addEventListener('submit', guardarTarea);
    document.getElementById('btnCancelarEdicionTarea').addEventListener('click', nuevoFormulario);
    document.getElementById('btnLimpiarTarea').addEventListener('click', function () {
      setTimeout(nuevoFormulario, 0);
    });

    document.getElementById('tareaAdjuntos').addEventListener('change', function () {
      var lista = document.getElementById('tareaAdjuntosLista');
      var archivos = Array.prototype.slice.call(this.files || []);
      lista.innerHTML = archivos.map(function (a) { return '<li>' + esc(a.name) + '</li>'; }).join('');
    });

    document.getElementById('tareaAdjuntosLista').addEventListener('click', function (e) {
      var boton = e.target.closest('[data-quitar-adjunto]');
      if (!boton || !T.edicion) return;
      var adjuntoId = boton.getAttribute('data-quitar-adjunto');
      api().eliminarAdjunto(T.edicion, adjuntoId).then(function () {
        toast('Adjunto eliminado.', 'ok');
        return cargarTareas().then(function () { editarTarea(T.edicion); });
      }).catch(function (err) { toast(err.message, 'error', 6000); });
    });

    document.getElementById('buscarTarea').addEventListener('input', function () {
      var valor = this.value.trim();
      estado.busqueda.tarea = valor;
      clearTimeout(T.temporizador);
      T.temporizador = setTimeout(renderTareas, 250);
    });

    document.getElementById('filtrosTarea').addEventListener('click', function (e) {
      var area = e.target.closest('[data-filtro-area]');
      var estadoBtn = e.target.closest('[data-filtro-estado]');
      if (area) T.filtroArea = area.getAttribute('data-filtro-area');
      if (estadoBtn) T.filtroEstado = estadoBtn.getAttribute('data-filtro-estado');
      if (area || estadoBtn) renderTareas();
    });

    document.getElementById('gridTareas').addEventListener('click', function (e) {
      var boton = e.target.closest('[data-accion]');
      if (!boton) return;
      var tarjeta = boton.closest('.card-tarea');
      if (!tarjeta) return;
      var id = tarjeta.getAttribute('data-id');
      var accion = boton.getAttribute('data-accion');

      if (accion === 'editar-tarea') editarTarea(id);
      else if (accion === 'eliminar-tarea') eliminarTarea(id);
      else if (accion === 'publicar-tarea') alternarPublicacion(id);
      else if (accion === 'entregar') abrirEntrega(id);
      else if (accion === 'ver-entregas') {
        document.getElementById('entregaFiltroArea').value = '';
        var filtroTarea = document.getElementById('entregaFiltroTarea');
        if (filtroTarea && T.tareas.some(function (t) { return t.id === id; })) filtroTarea.value = id;
        irA('entregas');
        cargarEntregas().catch(function () {});
      } else if (accion === 'adjunto') {
        var tarea = T.tareas.filter(function (t) { return t.id === id; })[0];
        var adjunto = tarea && tarea.adjuntos ? tarea.adjuntos.filter(function (a) {
          return a.id === boton.getAttribute('data-adjunto');
        })[0] : null;
        if (!tarea || !adjunto) return;
        api().descargarAdjunto(tarea.id, adjunto).then(function () {
          toast('Descarga iniciada.', 'ok');
        }).catch(function (err) { toast(err.message, 'error', 6000); });
      }
    });

    configurarEntregas();
    configurarCalificaciones();
    configurarNotificaciones();
  }

  function configurarEntregas() {
    var area = document.getElementById('entregaFiltroArea');
    var tarea = document.getElementById('entregaFiltroTarea');
    var estadoSelect = document.getElementById('entregaFiltroEstado');
    var estudiante = document.getElementById('entregaFiltroEstudiante');
    var desde = document.getElementById('entregaFiltroDesde');
    var hasta = document.getElementById('entregaFiltroHasta');
    var limpiar = document.getElementById('entregaFiltroLimpiar');

    [area, tarea, estadoSelect, desde, hasta].forEach(function (elemento) {
      if (elemento) elemento.addEventListener('change', function () { cargarEntregas().catch(function () {}); });
    });
    if (estudiante) estudiante.addEventListener('input', renderEntregas);
    if (limpiar) {
      limpiar.addEventListener('click', function () {
        [area, tarea, estadoSelect, estudiante, desde, hasta].forEach(function (elemento) {
          if (elemento) elemento.value = '';
        });
        cargarEntregas().catch(function () {});
      });
    }

    document.getElementById('tablaEntregas').addEventListener('click', function (e) {
      var boton = e.target.closest('[data-accion]');
      if (!boton) return;
      var fila = boton.closest('tr');
      var id = fila && fila.getAttribute('data-id');
      var entrega = T.entregas.filter(function (x) { return x.id === id; })[0];
      if (!entrega) return;

      if (boton.getAttribute('data-accion') === 'descargar-entrega') {
        boton.disabled = true;
        api().descargarEntrega(entrega).then(function () {
          boton.disabled = false;
          toast('Descarga iniciada.', 'ok');
        }).catch(function (err) {
          boton.disabled = false;
          toast(err.message, 'error', 6000);
        });
      } else if (boton.getAttribute('data-accion') === 'calificar') {
        abrirCalificar(id);
      }
    });

    document.getElementById('calificarCerrar').addEventListener('click', cerrarCalificar);
    document.getElementById('calificarCancelar').addEventListener('click', cerrarCalificar);
    document.getElementById('calificarGuardar').addEventListener('click', guardarCalificacion);
    document.getElementById('modalCalificar').addEventListener('click', function (e) {
      if (e.target === this) cerrarCalificar();
    });
  }

  function configurarCalificaciones() {
    var select = document.getElementById('calificacionFiltroArea');
    if (select) select.addEventListener('change', function () { cargarCalificaciones().catch(function () {}); });
  }

  function configurarNotificaciones() {
    var boton = document.getElementById('btnNotificaciones');
    var marcar = document.getElementById('btnMarcarNotificaciones');
    var panel = document.getElementById('panelNotificaciones');

    if (boton) boton.addEventListener('click', alternarNotificaciones);
    if (marcar) marcar.addEventListener('click', marcarTodasLeidas);

    if (panel) {
      panel.addEventListener('click', function (e) {
        var item = e.target.closest('[data-notif]');
        if (!item) return;
        var id = item.getAttribute('data-notif');
        api().marcarLeidas(id).then(function (datos) {
          T.sinLeer = datos.sinLeer || 0;
          T.notificaciones = T.notificaciones.map(function (n) {
            return n.id === id ? Object.assign({}, n, { leida: true }) : n;
          });
          renderNotificaciones();
        }).catch(function () {});
      });
    }

    document.addEventListener('click', function (e) {
      if (!panel || panel.classList.contains('oculto')) return;
      if (e.target.closest('#notifContenedor')) return;
      panel.classList.add('oculto');
      if (boton) boton.setAttribute('aria-expanded', 'false');
    });

    document.getElementById('entregaCerrar').addEventListener('click', cerrarEntrega);
    document.getElementById('entregaCancelar').addEventListener('click', cerrarEntrega);
    document.getElementById('entregaEnviar').addEventListener('click', enviarEntrega);
    document.getElementById('modalEntrega').addEventListener('click', function (e) {
      if (e.target === this) cerrarEntrega();
    });
  }

  /** Carga inicial tras iniciar sesión. */
  function cargarTodo() {
    return Promise.all([
      cargarTareas().catch(function () {}),
      cargarEntregas().catch(function () {}),
      cargarCalificaciones().catch(function () {}),
      cargarNotificaciones().catch(function () {})
    ]);
  }

  /** Contadores para el inicio y los badges del menú. */
  function resumen() {
    return {
      tareas: T.tareas.length,
      entregas: T.entregas.length,
      calificaciones: T.calificaciones.length,
      porRevisar: T.entregas.filter(function (e) {
        return e.estado === 'entregada' || e.estado === 'fuera_de_plazo';
      }).length
    };
  }

  window.TareasUI = {
    configurar: configurarTareas,
    cargarTodo: cargarTodo,
    cargarTareas: cargarTareas,
    cargarEntregas: cargarEntregas,
    cargarCalificaciones: cargarCalificaciones,
    cargarNotificaciones: cargarNotificaciones,
    render: renderTareas,
    renderEntregas: renderEntregas,
    renderCalificaciones: renderCalificaciones,
    renderNotificaciones: renderNotificaciones,
    resumen: resumen
  };
})();
