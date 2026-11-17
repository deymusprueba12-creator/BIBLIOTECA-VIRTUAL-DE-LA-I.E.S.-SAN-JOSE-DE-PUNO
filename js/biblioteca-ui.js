/*
 * biblioteca-ui.js
 * ----------------
 * Sección Biblioteca: subida con clasificación asistida, corrección manual,
 * búsqueda, filtros por área y descarga autenticada.
 *
 * La clasificación es solo una ayuda: el docente ve el área propuesta, su
 * confianza y los motivos, y puede cambiarla antes de publicar. El servidor
 * guarda la decisión final y aplica los permisos.
 */
(function () {
  'use strict';

  var UI = {
    libros: [],
    areaSugerida: null,
    analisis: null,
    editando: null,
    zona: null,
    temporizadorBusqueda: null,
    temporizadorAnalisis: null
  };

  var extensionesPermitidas = ['pdf', 'doc', 'docx'];

  function api() { return window.HEMEROTECA_API; }
  function clasificador() { return window.Clasificador; }

  function etiquetaArea(id) {
    var perfil = clasificador() && clasificador().perfiles.filter(function (p) { return p.id === id; })[0];
    return perfil ? perfil.etiqueta : id;
  }

  function colorArea(id) {
    var areas = window.AREAS || [];
    var area = areas.filter(function (a) { return a.id === id; })[0];
    return area ? area.color : '#4f46e5';
  }

  function nombreArea(id) {
    var areas = window.AREAS || [];
    var area = areas.filter(function (a) { return a.id === id; })[0];
    return area ? area.nombre : etiquetaArea(id);
  }

  function rellenarAreas() {
    var select = document.getElementById('libroArea');
    if (!select) return;
    var valor = select.value;
    var opciones = ['<option value="">Selecciona un área</option>'];
    (window.AREAS || []).forEach(function (area) {
      opciones.push('<option value="' + area.id + '">' + esc(area.nombre) + '</option>');
    });
    select.innerHTML = opciones.join('');
    if (valor) select.value = valor;
  }

  /* ------------------------------------------------------------------ */
  /* Clasificación                                                       */
  /* ------------------------------------------------------------------ */

  function mostrarPanel(titulo, detalle, confianza, motivos, nivel) {
    var panel = document.getElementById('clasificacionPanel');
    if (!panel) return;
    panel.classList.remove('oculto');
    document.getElementById('clasificacionTitulo').textContent = titulo;
    document.getElementById('clasificacionDetalle').textContent = detalle;

    var etiqueta = document.getElementById('clasificacionConfianza');
    etiqueta.textContent = confianza > 0 ? confianza + '% · ' + nivel : 'Sin datos suficientes';
    etiqueta.className = 'tag ' + (confianza >= 70 ? 'tag-verde' : confianza >= 45 ? 'tag-naranja' : 'tag-azul');

    var barra = document.getElementById('clasificacionBarra');
    if (barra) {
      barra.style.width = Math.max(0, Math.min(100, confianza)) + '%';
      barra.className = confianza >= 70 ? 'ok' : confianza >= 45 ? 'media' : 'baja';
    }

    var lista = document.getElementById('clasificacionMotivos');
    if (lista) {
      lista.innerHTML = (motivos || []).map(function (m) {
        return '<li><b>' + esc(m.palabra) + '</b> en ' + esc(m.campo) + '</li>';
      }).join('');
      lista.classList.toggle('oculto', !(motivos && motivos.length));
    }
  }

  function ocultarPanel() {
    var panel = document.getElementById('clasificacionPanel');
    if (panel) panel.classList.add('oculto');
  }

  /** Analiza el archivo actual y propone un área. */
  function analizar(archivo, conTexto) {
    var titulo = document.getElementById('libroTitulo').value.trim();
    var autor = document.getElementById('libroAutor').value.trim();
    var descripcion = document.getElementById('libroDesc').value.trim();

    function aplicar(texto, aviso) {
      var resultado = clasificador().clasificar({
        titulo: titulo,
        autor: autor,
        descripcion: descripcion,
        nombreArchivo: archivo ? archivo.name : '',
        texto: texto || ''
      });

      UI.analisis = resultado;
      UI.areaSugerida = resultado.area;

      var select = document.getElementById('libroArea');

      if (resultado.area) {
        if (select && !UI.editando) select.value = resultado.area;
        var razon = resultado.motivos.length
          ? 'Señales: ' + resultado.motivos.map(function (m) { return m.palabra; }).join(', ') + '.'
          : 'Coincidencia por el nombre del área en el documento.';
        if (aviso) razon += ' ' + aviso;
        mostrarPanel(
          'Área sugerida: ' + etiquetaArea(resultado.area),
          razon + ' Puedes cambiarla antes de publicar.',
          resultado.confianza,
          resultado.motivos,
          clasificador().nivelConfianza(resultado.confianza)
        );
      } else {
        if (select) select.value = '';
        mostrarPanel(
          'No hay información suficiente',
          (aviso || '') + ' Elige el área manualmente; no se asignará al azar.',
          0,
          [],
          'sin datos'
        );
      }
    }

    if (conTexto && archivo && extensionDe(archivo.name) === 'pdf' && window.PDFTexto && window.PDFTexto.disponible()) {
      mostrarPanel('Analizando el contenido del PDF…', 'Leyendo las primeras páginas.', 0, [], 'sin datos');
      window.PDFTexto.extraer(archivo).then(function (lectura) {
        if (lectura.vacio) {
          aplicar('', 'El PDF no tiene texto seleccionable (puede ser un escaneo).');
        } else {
          aplicar(lectura.texto, lectura.truncado ? 'Se analizaron las primeras páginas.' : '');
        }
      }).catch(function (err) {
        aplicar('', 'No se pudo leer el PDF: ' + (err.message || 'archivo dañado') + '.');
      });
      return;
    }

    aplicar('', archivo && extensionDe(archivo.name) !== 'pdf'
      ? 'Solo los PDF permiten analizar el contenido completo.'
      : '');
  }

  function extensionDe(nombre) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(nombre || ''));
    return m ? m[1].toLowerCase() : '';
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  function renderFiltros() {
    var contenedor = document.getElementById('filtrosCategoria');
    if (!contenedor) return;
    var presentes = {};
    UI.libros.forEach(function (l) { presentes[l.area] = true; });

    var html = '<button type="button" class="filtro' + (estado.filtros.libro === 'todos' ? ' activo' : '') + '" data-filtro="todos">Todas</button>';
    (window.AREAS || []).forEach(function (area) {
      if (!presentes[area.id]) return;
      html += '<button type="button" class="filtro' + (estado.filtros.libro === area.id ? ' activo' : '') +
        '" data-filtro="' + esc(area.id) + '" style="--filtro-color:' + esc(area.color) + '">' +
        esc(etiquetaArea(area.id)) + ' <em class="filtro-cuenta">' + UI.libros.filter(function (l) { return l.area === area.id; }).length + '</em></button>';
    });
    contenedor.innerHTML = html;
  }

  function tarjeta(libro) {
    var etiqueta = libro.clasificacion === 'auto'
      ? '<span class="tag tag-verde" title="Clasificación automática">Auto · ' + Math.round(libro.confianza) + '%</span>'
      : '<span class="tag tag-azul" title="Área elegida o corregida por el docente">Área confirmada</span>';

    var borrador = libro.publicado ? '' : '<span class="tag tag-naranja">Borrador</span>';
    var autor = libro.autor ? '<span class="libro-autor">' + esc(libro.autor) + '</span>' : '';
    var descripcion = libro.descripcion
      ? '<p class="card-desc">' + esc(libro.descripcion) + '</p>'
      : '';

    var accionesDoc = esDocente()
      ? '<button type="button" class="btn btn-sm btn-soft" data-accion="editar">Editar</button>' +
        '<button type="button" class="btn btn-sm btn-peligro" data-accion="eliminar" aria-label="Eliminar libro">Eliminar</button>'
      : '';
    var esPdf = libro.archivo && String(libro.archivo.nombre || '').toLowerCase().endsWith('.pdf');
    var botonLeer = esPdf
      ? '<button type="button" class="btn btn-sm btn-primario" data-accion="leer">Leer</button>'
      : '';

    return '<article class="card card-libro" data-id="' + esc(libro.id) + '">' +
      '<div class="card-media libro-media" style="--area-color:' + esc(colorArea(libro.area)) + '">' +
        '<span class="tipo-ico" aria-hidden="true">&#128213;</span>' +
        '<span class="card-area" style="background:' + esc(colorArea(libro.area)) + '">' + esc(etiquetaArea(libro.area)) + '</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3 class="card-titulo">' + esc(libro.titulo) + '</h3>' +
        autor + descripcion +
        '<div class="card-meta">' + etiqueta + borrador +
          (libro.archivo ? '<span class="tag">' + esc(String(libro.archivo.nombre).split('.').pop().toUpperCase()) + '</span>' : '') +
        '</div>' +
        '<div class="card-foot">' +
          botonLeer +
          '<button type="button" class="btn btn-sm btn-soft" data-accion="descargar">Descargar</button>' +
          accionesDoc +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderGruposLibros(lista) {
    var areas = window.AREAS || (typeof AREAS !== 'undefined' ? AREAS : []);
    var conocidos = {};
    var bloques = areas.map(function (area) {
      conocidos[area.id] = true;
      var items = lista.filter(function (libro) { return libro.area === area.id; });
      if (!items.length) return '';
      return '<section class="area-contenido area-contenido-total" style="--area-color:' + esc(area.color || '#4f46e5') + '" aria-labelledby="libros-area-' + esc(area.id) + '">' +
        '<div class="area-contenido-head"><span class="area-contenido-dot"></span><h3 class="area-contenido-titulo" id="libros-area-' + esc(area.id) + '">' + esc(area.nombre) + '</h3>' +
        '<span class="area-contenido-cuenta">' + items.length + ' ' + (items.length === 1 ? 'libro' : 'libros') + '</span></div>' +
        '<div class="grid">' + items.map(tarjeta).join('') + '</div></section>';
    }).join('');
    var otros = lista.filter(function (libro) { return !conocidos[libro.area]; });
    if (otros.length) {
      bloques += '<section class="area-contenido area-contenido-total" style="--area-color:#64748b" aria-labelledby="libros-area-otras"><div class="area-contenido-head"><span class="area-contenido-dot"></span><h3 class="area-contenido-titulo" id="libros-area-otras">Otras áreas</h3><span class="area-contenido-cuenta">' + otros.length + ' ' + (otros.length === 1 ? 'libro' : 'libros') + '</span></div><div class="grid">' + otros.map(tarjeta).join('') + '</div></section>';
    }
    return bloques;
  }

  function render() {
    renderFiltros();
    var contenedor = document.getElementById('gridLibros');
    if (!contenedor) return;

    if (!UI.libros.length) {
      contenedor.innerHTML = vacio(
        '📚',
        'No hay libros en esta vista',
        esDocente()
          ? 'Sube el primer libro en PDF, DOC o DOCX. El sistema propondrá un área curricular y podrás corregirla.'
          : 'El docente todavía no ha publicado libros. Vuelve más tarde.'
      );
    } else {
      contenedor.innerHTML = renderGruposLibros(UI.libros);
    }

    var nota = document.getElementById('notaBiblioteca');
    if (nota) {
      var borradores = UI.libros.filter(function (l) { return !l.publicado; }).length;
      nota.textContent = esDocente()
        ? UI.libros.length + ' libro(s) en esta vista' + (borradores ? ' · ' + borradores + ' sin publicar' : '') + '.'
        : UI.libros.length + ' libro(s) disponibles.';
    }

    var badge = document.getElementById('badgeLibros');
    if (badge) badge.textContent = UI.libros.length;
  }

  function vacio(icono, titulo, texto) {
    return '<div class="vacio"><span class="ico" aria-hidden="true">' + icono + '</span>' +
      '<h3>' + esc(titulo) + '</h3><p>' + esc(texto) + '</p></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Datos                                                               */
  /* ------------------------------------------------------------------ */

  function cargar(filtros) {
    var f = filtros || {};
    var area = f.area !== undefined ? f.area : (estado.filtros.libro === 'todos' ? '' : estado.filtros.libro);
    var q = f.q !== undefined ? f.q : estado.busqueda.libro;

    return api().libros({ area: area, q: q }).then(function (libros) {
      UI.libros = libros;
      estado.libros = libros;
      render();
      return libros;
    }).catch(function (err) {
      var contenedor = document.getElementById('gridLibros');
      if (contenedor) {
        contenedor.innerHTML = '<div class="vacio"><span class="ico">⚠️</span><h3>No se pudo cargar la biblioteca</h3><p>' +
          esc(err.message) + '</p><button type="button" class="btn btn-soft" id="btnReintentarLibros">Reintentar</button></div>';
        var boton = document.getElementById('btnReintentarLibros');
        if (boton) boton.addEventListener('click', function () { cargar(); });
      }
      throw err;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Formulario                                                          */
  /* ------------------------------------------------------------------ */

  function limpiarFormulario() {
    UI.editando = null;
    UI.areaSugerida = null;
    UI.analisis = null;
    var campo = document.getElementById('libroEditando');
    if (campo) campo.value = '';
    var aviso = document.getElementById('avisoEdicionLibro');
    if (aviso) aviso.classList.add('oculto');
    var boton = document.getElementById('btnGuardarLibro');
    if (boton) boton.textContent = 'Guardar libro';
    ocultarPanel();
  }

  function editar(id) {
    var libro = UI.libros.filter(function (l) { return l.id === id; })[0];
    if (!libro) return;
    if (UI.zona) UI.zona.limpiarSilencioso();

    UI.editando = id;
    document.getElementById('libroTitulo').value = libro.titulo || '';
    document.getElementById('libroAutor').value = libro.autor || '';
    document.getElementById('libroDesc').value = libro.descripcion || '';
    document.getElementById('libroArea').value = libro.area;
    document.getElementById('libroPublicado').checked = !!libro.publicado;
    document.getElementById('libroEditando').value = id;
    document.getElementById('btnGuardarLibro').textContent = 'Guardar cambios';
    document.getElementById('avisoEdicionLibro').classList.remove('oculto');
    document.getElementById('libroTitulo').focus();
    document.getElementById('sec-libros').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelarEdicion() {
    limpiarFormulario();
    var form = document.getElementById('formLibro');
    if (form) form.reset();
    if (UI.zona) UI.zona.limpiarSilencioso();
    document.getElementById('libroPublicado').checked = true;
  }

  function guardar(evento) {
    evento.preventDefault();
    if (!esDocente()) {
      toast('Solo el personal docente puede publicar libros.', 'alerta');
      return;
    }

    var titulo = document.getElementById('libroTitulo').value.trim();
    var autor = document.getElementById('libroAutor').value.trim();
    var descripcion = document.getElementById('libroDesc').value.trim();
    var area = document.getElementById('libroArea').value;
    var publicado = document.getElementById('libroPublicado').checked;
    var archivos = UI.zona ? UI.zona.archivos() : [];

    if (!titulo) { toast('Escribe el título del libro.', 'alerta'); document.getElementById('libroTitulo').focus(); return; }
    if (!area) { toast('Selecciona el área curricular.', 'alerta'); document.getElementById('libroArea').focus(); return; }

    var datos = {
      titulo: titulo,
      autor: autor,
      descripcion: descripcion,
      area: area,
      publicado: publicado
    };

    if (UI.editando) {
      var esCorreccion = UI.areaSugerida && area !== UI.areaSugerida;
      datos.clasificacion = esCorreccion ? 'manual' : 'auto';
      datos.confianza = esCorreccion ? 0 : (UI.analisis ? UI.analisis.confianza : 0);

      progresoMostrar('Guardando cambios…', 'Actualizando los datos del libro.');
      api().actualizarLibro(UI.editando, datos).then(function () {
        progresoOcultar();
        toast('Libro actualizado.', 'ok');
        cancelarEdicion();
        return cargar();
      }).catch(function (err) {
        progresoOcultar();
        toast(err.message, 'error', 7000);
      });
      return;
    }

    if (!archivos.length) { toast('Selecciona el archivo del libro.', 'alerta'); return; }

    var errorArchivo = validarArchivo(archivos[0], extensionesPermitidas, limiteBytes());
    if (errorArchivo) { toast(errorArchivo, 'error', 7000); return; }

    var fd = new FormData();
    fd.append('titulo', titulo);
    fd.append('autor', autor);
    fd.append('descripcion', descripcion);
    fd.append('area', area);
    fd.append('publicado', publicado ? 'true' : 'false');
    fd.append('clasificacion', UI.areaSugerida && area === UI.areaSugerida ? 'auto' : 'manual');
    fd.append('confianza', UI.areaSugerida && area === UI.areaSugerida && UI.analisis ? String(UI.analisis.confianza) : '0');
    fd.append('archivo', archivos[0]);

    progresoMostrar('Subiendo el libro…', 'Analizando y guardando «' + archivos[0].name + '».');
    api().crearLibro(fd).then(function (libro) {
      progresoOcultar();
      toast('Libro «' + libro.titulo + '» publicado en ' + etiquetaArea(libro.area) + '.', 'ok', 6000);
      cancelarEdicion();
      estado.filtros.libro = 'todos';
      return cargar();
    }).catch(function (err) {
      progresoOcultar();
      if (err.estado === 409) toast(err.message, 'alerta', 9000);
      else if (err.estado === 415) toast('El archivo no es válido. Debe ser un PDF, DOC o DOCX real.', 'error', 8000);
      else toast(err.message, 'error', 8000);
    });
  }

  function limiteBytes() {
    var max = (window.HEMEROTECA_CONFIG && window.HEMEROTECA_CONFIG.maxMb) || 1024;
    return max * 1024 * 1024;
  }

  /* ------------------------------------------------------------------ */
  /* Eventos                                                             */
  /* ------------------------------------------------------------------ */

  function configurar() {
    rellenarAreas();
    var max = (window.HEMEROTECA_CONFIG && window.HEMEROTECA_CONFIG.maxMb) || 1024;
    var chip = document.getElementById('chipMaxLibro');
    if (chip) chip.textContent = max + ' MB';

    UI.zona = crearZonaArchivo({
      drop: '#dropLibro',
      input: '#inputLibro',
      txt: '#dropLibroTxt',
      info: '#dropLibroInfo',
      textoPorDefecto: 'Arrastra el PDF aquí o haz clic para elegir',
      infoPorDefecto: '.pdf · .doc · .docx',
      alCambiar: function (archivos) {
        if (!archivos.length) { ocultarPanel(); return; }
        var archivo = archivos[0];
        if (UI.editando) {
          toast('Para reemplazar el archivo, crea un libro nuevo y elimina el anterior.', 'info', 7000);
          UI.zona.limpiarSilencioso();
          return;
        }
        if (extensionDe(archivo.name) === 'pdf') {
          if (!document.getElementById('libroTitulo').value.trim()) {
            document.getElementById('libroTitulo').value = nombreDesdeArchivo(archivo.name);
          }
          analizar(archivo, true);
        } else {
          analizar(archivo, false);
        }
      },
      alLimpiar: function () {
        if (!UI.editando) limpiarFormulario();
      }
    });

    document.getElementById('formLibro').addEventListener('submit', guardar);
    document.getElementById('btnCancelarEdicion').addEventListener('click', cancelarEdicion);
    document.getElementById('btnLimpiarLibro').addEventListener('click', function () {
      setTimeout(cancelarEdicion, 0);
    });

    document.getElementById('libroArea').addEventListener('change', function () {
      if (!UI.analisis || !UI.analisis.area) return;
      var manual = this.value !== UI.analisis.area;
      var etiqueta = document.getElementById('clasificacionConfianza');
      if (manual) {
        etiqueta.textContent = 'Corrección manual';
        etiqueta.className = 'tag tag-azul';
      }
    });

    ['libroTitulo', 'libroAutor', 'libroDesc'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', function () {
        if (UI.editando) return;
        var archivos = UI.zona ? UI.zona.archivos() : [];
        clearTimeout(UI.temporizadorAnalisis);
        UI.temporizadorAnalisis = setTimeout(function () {
          if (archivos.length) analizar(archivos[0], false);
        }, 500);
      });
    });

    document.getElementById('buscarLibro').addEventListener('input', function () {
      var valor = this.value.trim();
      estado.busqueda.libro = valor;
      clearTimeout(UI.temporizadorBusqueda);
      UI.temporizadorBusqueda = setTimeout(function () { cargar({ q: valor }).catch(function () {}); }, 350);
    });

    document.getElementById('filtrosCategoria').addEventListener('click', function (e) {
      var boton = e.target.closest('.filtro');
      if (!boton) return;
      estado.filtros.libro = boton.getAttribute('data-filtro');
      cargar({ area: estado.filtros.libro === 'todos' ? '' : estado.filtros.libro }).catch(function () {});
    });

    document.getElementById('gridLibros').addEventListener('click', function (e) {
      var boton = e.target.closest('[data-accion]');
      if (!boton) return;
      var tarjeta = boton.closest('.card');
      if (!tarjeta) return;
      var id = tarjeta.getAttribute('data-id');
      var libro = UI.libros.filter(function (l) { return l.id === id; })[0];
      if (!libro) return;
      var accion = boton.getAttribute('data-accion');

      if (accion === 'leer') {
        boton.disabled = true;
        try {
          if (window.abrirVisorServidor) { window.abrirVisorServidor(libro); }
          else toast('El visor no está disponible.', 'error');
        } catch (err) {
          toast(err.message || 'No se pudo abrir el libro.', 'error', 7000);
        } finally {
          boton.disabled = false;
        }
      } else if (accion === 'descargar') {
        boton.disabled = true;
        api().descargarLibro(libro).then(function () {
          boton.disabled = false;
          toast('Descarga iniciada.', 'ok');
        }).catch(function (err) {
          boton.disabled = false;
          toast(err.message, 'error', 7000);
        });
      } else if (accion === 'editar' && esDocente()) {
        editar(id);
      } else if (accion === 'eliminar' && esDocente()) {
        confirmar('Eliminar libro', 'Se eliminará «' + libro.titulo + '» y su archivo del servidor. Esta acción no se puede deshacer.', 'Eliminar', true)
          .then(function (ok) {
            if (!ok) return;
            api().eliminarLibro(id).then(function () {
              toast('Libro eliminado.', 'ok');
              if (UI.editando === id) cancelarEdicion();
              return cargar();
            }).catch(function (err) { toast(err.message, 'error', 7000); });
          });
      }
    });
  }

  function verArea(areaId) {
    estado.filtros.libro = areaId;
    return cargar({ area: areaId });
  }

  function nombreDesdeArchivo(nombre) {
    return String(nombre || '')
      .replace(/\.[A-Za-z0-9]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);
  }

  window.BibliotecaUI = {
    configurar: configurar,
    cargar: cargar,
    render: render,
    editar: editar,
    cancelarEdicion: cancelarEdicion,
    verArea: verArea,
    libros: function () { return UI.libros; }
  };
})();
