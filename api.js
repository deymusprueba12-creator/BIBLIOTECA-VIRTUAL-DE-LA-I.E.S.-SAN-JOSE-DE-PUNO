/*
 * api.js adaptado para SUPABASE
 */
(function () {
  'use strict';

  // Usamos el cliente de Supabase que ya creaste en script.js
  var supabase = window.supabaseClient; 
  
  if (!supabase) {
    console.error("No se encontró el cliente de Supabase. Revisa script.js");
  }

  // Objeto simulado para mantener compatibilidad con el resto de tu código
  window.HEMEROTECA_API = {
    base: 'supabase',
    haySesion: function() { return true; },
    token: function() { return 'supabase-token'; },
    usuarioGuardado: function() { return null; },
    guardarSesion: function() {},
    limpiarSesion: function() {},

    // ----- LIBROS (Ahora usa Supabase) -----
    libros: function (filtros) {
      var consulta = supabase.from('libros').select('*').order('fecha', { ascending: false });
      
      // Si hay búsqueda, la aplicamos
      if (filtros && filtros.q) {
        consulta = consulta.or(`titulo.ilike.%${filtros.q}%,autor.ilike.%${filtros.q}%,descripcion.ilike.%${filtros.q}%`);
      }
      if (filtros && filtros.area) {
        consulta = consulta.eq('area', filtros.area);
      }

      return consulta.then(function (respuesta) {
        if (respuesta.error) throw respuesta.error;
        return respuesta.data;
      });
    },

    crearLibro: function (formData) {
      // 1. Extraemos el archivo del FormData
      var archivo = formData.get('archivo'); // Asegúrate de que tu input file se llame 'archivo'
      if (!archivo) return Promise.reject(new Error("No se seleccionó ningún archivo."));

      // 2. Creamos un nombre único para el archivo
      var nombreArchivo = Date.now() + '_' + archivo.name.replace(/\s+/g, '_');

      // 3. Subimos el archivo al bucket 'sanjome'
      return supabase.storage.from('sanjome').upload(nombreArchivo, archivo)
        .then(function (respuestaSubida) {
          if (respuestaSubida.error) throw respuestaSubida.error;

          // 4. Obtenemos la URL pública del archivo
          var urlPublica = supabase.storage.from('sanjome').getPublicUrl(nombreArchivo).data.publicUrl;

          // 5. Guardamos los datos en la tabla 'libros'
          var datosLibro = {
            titulo: formData.get('titulo') || 'Sin título',
            autor: formData.get('autor') || 'Anónimo',
            descripcion: formData.get('descripcion') || '',
            area: formData.get('area') || '',
            archivo_url: urlPublica,
            nombre_archivo: archivo.name,
            tamano: archivo.size,
            publicado: true
          };

          return supabase.from('libros').insert([datosLibro]).select();
        })
        .then(function (respuestaDB) {
          if (respuestaDB.error) throw respuestaDB.error;
          return respuestaDB.data[0]; // Retornamos el libro recién creado
        });
    },

    eliminarLibro: function (id) {
      return supabase.from('libros').delete().eq('id', id).then(function (resp) {
        if (resp.error) throw resp.error;
        return true;
      });
    },

    descargarLibro: function (libro) {
      // Abrimos el enlace del archivo en una nueva pestaña
      if (libro.archivo_url) {
        window.open(libro.archivo_url, '_blank');
      } else {
        alert('Este libro no tiene un archivo asociado.');
      }
    },
    
    // ----- EL RESTO DE FUNCIONES (Tareas, etc.) -----
    // Por ahora las dejamos vacías para que no den error, 
    // luego las adaptaremos a Supabase si quieres.
    tareas: function() { return Promise.resolve([]); },
    crearTarea: function() { return Promise.reject("Próximamente"); },
    actualizarTarea: function() { return Promise.reject("Próximamente"); },
    eliminarTarea: function() { return Promise.reject("Próximamente"); },
    entregas: function() { return Promise.resolve([]); },
    calificaciones: function() { return Promise.resolve([]); },
    notificaciones: function() { return Promise.resolve([]); }
  };
})();
