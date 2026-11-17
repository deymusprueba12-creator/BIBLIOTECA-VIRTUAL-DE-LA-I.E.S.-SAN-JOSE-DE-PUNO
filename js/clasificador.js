/*
 * clasificador.js
 * ---------------
 * Clasificación asistida de libros por área curricular.
 *
 * No decide al azar ni se fía solo del nombre del archivo:
 *   - puntúa palabras clave en título, nombre de archivo, descripción y texto;
 *   - pesa más lo que aparece en el título que lo que aparece en el cuerpo;
 *   - calcula una confianza explicable a partir de la ventaja sobre la
 *     segunda área y de la cantidad de señales encontradas;
 *   - si no hay señales suficientes, devuelve `suficiente: false` para que la
 *     interfaz pida una selección manual.
 *
 * El resultado SIEMPRE es una sugerencia: el docente puede corregirla y el
 * servidor guarda la clasificación definitiva.
 */
(function () {
  'use strict';

  /**
   * Cada área tiene palabras con peso. Las expresiones de varias palabras
   * pesan más porque son menos ambiguas.
   */
  var PERFILES = [
    {
      id: 'matematica',
      nombre: 'Área de Matemática',
      etiqueta: 'Matemática',
      palabras: [
        ['matematica', 3], ['matematicas', 3], ['algebra', 3], ['aritmetica', 3],
        ['geometria', 3], ['trigonometria', 3], ['calculo', 3], ['ecuacion', 2],
        ['ecuaciones', 2], ['funcion cuadratica', 3], ['funciones', 2], ['polinomio', 2],
        ['fraccion', 2], ['fracciones', 2], ['probabilidad', 2], ['estadistica', 2],
        ['derivada', 2], ['integral', 2], ['teorema', 2], ['triangulo', 2],
        ['angulo', 2], ['perimetro', 2], ['logaritmo', 2], ['matriz', 2],
        ['conjunto numerico', 3], ['proporcionalidad', 2], ['razon', 1],
        ['problema matematico', 3], ['operaciones basicas', 2], ['numero decimal', 2]
      ]
    },
    {
      id: 'comunicacion',
      nombre: 'Área de Comunicación',
      etiqueta: 'Comunicación',
      palabras: [
        ['comunicacion', 3], ['lengua', 2], ['lenguaje', 2], ['literatura', 3],
        ['comprension lectora', 3], ['produccion de textos', 3], ['texto', 1],
        ['lectura', 2], ['escritura', 2], ['narrativa', 2], ['poesia', 3],
        ['poema', 2], ['cuento', 2], ['novela', 2], ['ensayo', 2],
        ['gramatica', 2], ['ortografia', 2], ['sintaxis', 2], ['oracion', 1],
        ['parrafo', 1], ['dialogo', 1], ['argumentacion', 2], ['redaccion', 2],
        ['discurso', 2], ['genero literario', 3], ['autor literario', 2], ['obra literaria', 3]
      ]
    },
    {
      id: 'ingles',
      nombre: 'Área de Inglés como Lengua Extranjera',
      etiqueta: 'Inglés',
      palabras: [
        ['ingles', 3], ['english', 3], ['english language', 3], ['vocabulary', 3],
        ['grammar', 2], ['verb to be', 3], ['past simple', 3], ['present simple', 3],
        ['listening', 3], ['speaking', 3], ['reading comprehension', 2], ['phrasal verb', 3],
        ['lesson', 1], ['unit', 1], ['worksheet', 2], ['review', 1],
        ['the', 0], ['and', 0], ['is', 0], ['are', 0]
      ]
    },
    {
      id: 'arte',
      nombre: 'Área de Arte y Cultura',
      etiqueta: 'Arte y Cultura',
      palabras: [
        ['arte', 2], ['artistico', 3], ['artistica', 3], ['cultura', 1],
        ['dibujo', 3], ['pintura', 3], ['escultura', 3], ['música', 3],
        ['musica', 3], ['danza', 3], ['teatro', 3], ['color', 1],
        ['lienzo', 2], ['museo', 2], ['patrimonio', 2], ['creatividad', 2],
        ['composicion artistica', 3], ['ritmo', 2], ['instrumento musical', 3],
        ['fotografia', 2], ['cine', 2], ['ceramica', 2], ['tejido', 2]
      ]
    },
    {
      id: 'ccss',
      nombre: 'Área de Ciencias Sociales',
      etiqueta: 'Ciencias Sociales',
      palabras: [
        ['ciencias sociales', 4], ['historia', 3], ['historico', 2], ['geografia', 3],
        ['economia', 2], ['politica', 2], ['sociedad', 2], ['imperio inca', 3],
        ['inca', 2], ['colonia', 2], ['independencia', 2], ['guerra', 2],
        ['revolucion', 2], ['territorio', 2], ['mapa', 1], ['continente', 2],
        ['peru', 1], ['mundo contemporaneo', 3], ['culturas prehispanicas', 3],
        ['conquista', 2], ['republica', 2], ['globalizacion', 2]
      ]
    },
    {
      id: 'dpcc',
      nombre: 'Área de Desarrollo Personal, Ciudadanía y Cívica',
      etiqueta: 'Desarrollo Personal, Ciudadanía y Cívica',
      palabras: [
        ['desarrollo personal', 4], ['ciudadania', 3], ['civica', 3], ['derechos humanos', 3],
        ['deberes', 2], ['valores', 2], ['etica', 2], ['moral', 2],
        ['identidad', 2], ['autoestima', 3], ['emociones', 2], ['convivencia', 3],
        ['democracia', 3], ['participacion ciudadana', 3], ['constitucion', 2],
        ['igualdad', 2], ['equidad', 2], ['bullying', 2], ['proyecto de vida', 3],
        ['toma de decisiones', 2], ['salud mental', 2], ['prevencion', 2]
      ]
    },
    {
      id: 'efisica',
      nombre: 'Área de Educación Física',
      etiqueta: 'Educación Física',
      palabras: [
        ['educacion fisica', 4], ['deporte', 3], ['deportes', 3], ['atletismo', 3],
        ['futbol', 3], ['voley', 3], ['basquet', 3], ['natacion', 3],
        ['gimnasia', 3], ['ejercicio fisico', 3], ['entrenamiento', 2], ['nutricion', 2],
        ['motricidad', 3], ['calentamiento', 2], ['resistencia', 1], ['flexibilidad', 2],
        ['olimpiadas', 2], ['juego motor', 3], ['salud corporal', 3], ['postura', 1]
      ]
    },
    {
      id: 'religiosa',
      nombre: 'Área de Educación Religiosa',
      etiqueta: 'Educación Religiosa',
      palabras: [
        ['educacion religiosa', 4], ['religion', 3], ['religioso', 2], ['dios', 2],
        ['jesus', 3], ['cristo', 3], ['cristiano', 3], ['catolico', 3],
        ['biblia', 3], ['evangelio', 3], ['iglesia', 2], ['espiritual', 2],
        ['oracion', 2], ['sacramento', 3], ['teologia', 3], ['apostol', 2],
        ['parroquia', 2], ['ecumenismo', 3], ['fe cristiana', 3], ['valores cristianos', 3]
      ]
    },
    {
      id: 'cyt',
      nombre: 'Área de Ciencia y Tecnología',
      etiqueta: 'Ciencia y Tecnología',
      palabras: [
        ['ciencia y tecnologia', 4], ['ciencia', 2], ['tecnologia', 2], ['biologia', 3],
        ['fisica', 3], ['quimica', 3], ['celula', 3], ['organismo', 2],
        ['ecosistema', 3], ['materia', 2], ['energia', 2], ['fuerza', 2],
        ['movimiento', 2], ['atomo', 3], ['molecula', 3], ['experimento', 3],
        ['laboratorio', 3], ['investigacion cientifica', 3], ['medio ambiente', 2],
        ['contaminacion', 2], ['cuerpo humano', 3], ['genetica', 3],
        ['electricidad', 2], ['magnetismo', 2], ['robotica', 3], ['ecologia', 2]
      ]
    },
    {
      id: 'ept',
      nombre: 'Área de Educación para el Trabajo',
      etiqueta: 'Educación para el Trabajo',
      palabras: [
        ['educacion para el trabajo', 4], ['emprendimiento', 3], ['empresa', 2],
        ['negocio', 2], ['proyecto productivo', 3], ['taller', 1], ['oficio', 2],
        ['manufactura', 3], ['informatica', 2], ['computacion', 2], ['software', 2],
        ['programacion', 3], ['diseno', 1], ['marketing', 3], ['contabilidad', 3],
        ['gestion', 1], ['herramientas', 1], ['carpinteria', 3], ['cocina', 2],
        ['manualidades', 3], ['plan de negocio', 4], ['hoja de calculo', 2]
      ]
    },
    {
      id: 'castellano',
      nombre: 'Área de Castellano como Segunda Lengua',
      etiqueta: 'Castellano como Segunda Lengua',
      palabras: [
        ['castellano como segunda lengua', 5], ['segunda lengua', 4], ['castellano', 3],
        ['quechua', 3], ['aimara', 3], ['bilingue', 4], ['intercultural', 4],
        ['lengua materna', 4], ['oralidad', 3], ['alfabeto', 2], ['fonologia', 3],
        ['morfologia', 3], ['lexico', 2], ['variacion linguistica', 4],
        ['prestamo linguistico', 4], ['comunicacion intercultural', 4],
        ['lengua originaria', 4], ['aprendizaje del castellano', 4]
      ]
    }
  ];

  var PESO_CAMPO = { titulo: 3, archivo: 2, descripcion: 2, texto: 1 };

  function normalizar(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function contarOcurrencias(texto, palabra) {
    if (!texto || !palabra) return 0;
    var objetivo = ' ' + palabra + ' ';
    var donde = ' ' + texto + ' ';
    var total = 0;
    var desde = 0;
    while (true) {
      var pos = donde.indexOf(objetivo, desde);
      if (pos === -1) break;
      total += 1;
      desde = pos + objetivo.length - 1;
      if (total >= 4) break;
    }
    return total;
  }

  /**
   * Clasifica un libro.
   * @param {{titulo?:string, autor?:string, descripcion?:string,
   *          nombreArchivo?:string, texto?:string}} entrada
   * @returns {{area:string|null, nombre:string|null, etiqueta:string|null,
   *            confianza:number, suficiente:boolean, motivos:Array,
   *            puntajes:Array, textoAnalizado:boolean}}
   */
  function clasificar(entrada) {
    var datos = entrada || {};
    var campos = {
      titulo: normalizar(datos.titulo),
      archivo: normalizar(datos.nombreArchivo),
      descripcion: normalizar([datos.descripcion, datos.autor].join(' ')),
      texto: normalizar(String(datos.texto || '').slice(0, 30000))
    };

    var resultados = PERFILES.map(function (perfil) {
      var puntaje = 0;
      var motivos = [];

      perfil.palabras.forEach(function (par) {
        var palabra = normalizar(par[0]);
        var fuerza = par[1];
        if (!palabra || !fuerza) return;

        Object.keys(campos).forEach(function (campo) {
          var ocurrencias = contarOcurrencias(campos[campo], palabra);
          if (!ocurrencias) return;

          var aporte = fuerza * PESO_CAMPO[campo] * Math.min(ocurrencias, 2);
          puntaje += aporte;
          motivos.push({ palabra: par[0], campo: campo, aporte: aporte });
        });
      });

      // El nombre del área dentro del texto es la señal más fuerte.
      if (campos.texto.indexOf(normalizar(perfil.etiqueta)) !== -1) {
        puntaje += 10;
        motivos.push({ palabra: perfil.etiqueta, campo: 'texto', aporte: 10 });
      }

      motivos.sort(function (a, b) { return b.aporte - a.aporte; });

      return {
        area: perfil.id,
        nombre: perfil.nombre,
        etiqueta: perfil.etiqueta,
        puntaje: puntaje,
        motivos: motivos.slice(0, 4)
      };
    });

    resultados.sort(function (a, b) { return b.puntaje - a.puntaje; });

    var primero = resultados[0];
    var segundo = resultados[1] || { puntaje: 0 };

    // Sin señales reales no se inventa un área.
    if (primero.puntaje < 4) {
      return {
        area: null,
        nombre: null,
        etiqueta: null,
        confianza: 0,
        suficiente: false,
        motivos: [],
        puntajes: resultados.filter(function (r) { return r.puntaje > 0; }).slice(0, 3),
        textoAnalizado: !!datos.texto
      };
    }

    var separacion = (primero.puntaje - segundo.puntaje) / primero.puntaje;
    var volumen = Math.min(1, primero.puntaje / 14);
    var confianza = Math.round(35 + 40 * separacion + 25 * volumen);
    confianza = Math.max(20, Math.min(97, confianza));

    var suficiente = primero.puntaje >= 5 && separacion >= 0.15;

    return {
      area: primero.area,
      nombre: primero.nombre,
      etiqueta: primero.etiqueta,
      confianza: suficiente ? confianza : Math.min(confianza, 44),
      suficiente: suficiente,
      motivos: primero.motivos,
      puntajes: resultados.filter(function (r) { return r.puntaje > 0; }).slice(0, 3),
      textoAnalizado: !!datos.texto
    };
  }

  /** Etiqueta legible para una confianza numérica. */
  function nivelConfianza(confianza) {
    if (confianza >= 70) return 'alta';
    if (confianza >= 45) return 'media';
    if (confianza > 0) return 'baja';
    return 'sin datos';
  }

  window.Clasificador = {
    perfiles: PERFILES,
    clasificar: clasificar,
    nivelConfianza: nivelConfianza,
    normalizar: normalizar
  };
})();
