// src/data/leerColaboradores.js
// Lectura del archivo de colaboradores (.csv o .xlsx) en JS puro, sin
// dependencias. Solo se extraen las columnas A (SAP) y B (nombre); el resto de
// columnas del archivo se descarta en el cliente (decisión del Ticket 21).

const MAX_CELDA = 200;

function recortarCelda(valor) {
  return typeof valor === 'string' ? valor.trim().slice(0, MAX_CELDA) : '';
}

function vacio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

// ==========================================
// CSV
// ==========================================

function dividirLineaCsv(linea, delimitador) {
  const campos = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i];

    if (caracter === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (caracter === delimitador && !entreComillas) {
      campos.push(campo);
      campo = '';
    } else {
      campo += caracter;
    }
  }

  campos.push(campo);
  return campos;
}

function detectarDelimitador(limpio) {
  const candidatos = [';', ',', '\t'];
  let mejor = candidatos[0];
  let maximo = 1;

  candidatos.forEach((delimitador) => {
    let presentes = 0;
    for (const linea of limpio.split('\n').slice(0, 5)) {
      presentes += dividirLineaCsv(linea, delimitador).length;
    }
    if (presentes > maximo) {
      maximo = presentes;
      mejor = delimitador;
    }
  });

  return mejor;
}

function aFilasCsv(texto) {
  const limpio = texto.replace(/^\uFEFF/, '');
  const delimitador = detectarDelimitador(limpio);

  return limpio.split(/\r\n|\r|\n/).reduce((acumulado, linea) => {
    if (linea !== '') acumulado.push(dividirLineaCsv(linea, delimitador));
    return acumulado;
  }, []);
}

// ==========================================
// XLSX (ZIP + XML con APIs nativas del navegador)
// ==========================================

function decodificarTexto(buffer) {
  return new TextDecoder('utf-8').decode(buffer);
}

function entradasZip(archivo) {
  const vista = new DataView(archivo);
  const finEocd = buscarEocd(vista);

  const entradas = [];
  let offset = vista.getUint32(finEocd + 16, true);

  for (let i = 0; i < vista.getUint16(finEocd + 10, true); i += 1) {
    if (vista.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Archivo comprimido con estructura no reconocida.');
    }

    const tamNombre = vista.getUint16(offset + 28, true);
    const tamExtra = vista.getUint16(offset + 30, true);
    const tamComentario = vista.getUint16(offset + 32, true);

    entradas.push({
      nombre: decodificarTexto(archivo.slice(offset + 46, offset + 46 + tamNombre)),
      metodo: vista.getUint16(offset + 10, true),
      tamComprimido: vista.getUint32(offset + 20, true),
      datosInicio: vista.getUint32(offset + 42, true),
      tamExtra,
      tamComentario,
    });

    offset += 46 + tamNombre + tamExtra + tamComentario;
  }

  return entradas;
}

// El EOCD es la única marca de fin; su comentario declarado debe empalmar
// exactamente con el tamaño total del archivo.
function buscarEocd(vista) {
  const largo = vista.byteLength;
  for (let i = largo - 22; i >= 0 && i >= largo - 22 - 65535; i -= 1) {
    if (
      vista.getUint32(i, true) === 0x06054b50 &&
      vista.getUint16(i + 8, true) === vista.getUint16(i + 10, true) &&
      i + 22 + vista.getUint16(i + 20, true) === largo
    ) {
      return i;
    }
  }
  throw new Error('No se encontró el directorio del archivo comprimido.');
}

function saltarCabeceraLocal(archivo, entrada) {
  const vista = new DataView(archivo, entrada.datosInicio, 30);
  const tamNombre = vista.getUint16(26, true);
  const tamExtra = vista.getUint16(28, true);
  return entrada.datosInicio + 30 + tamNombre + tamExtra;
}

async function descomprimirEntrada(archivo, entrada) {
  const datos = archivo.slice(entrada.datosInicio, entrada.datosInicio + entrada.tamComprimido);

  if (entrada.metodo === 0) {
    return datos;
  }

  if (entrada.metodo !== 8) {
    throw new Error(`Método de compresión no soportado (${entrada.metodo}).`);
  }

  const respuesta = new Response(datos.stream().pipeThrough(new DecompressionStream('deflate-raw')));
  return respuesta.arrayBuffer();
}

function indiceColumna(referencia) {
  const letras = (referencia ?? '').replace(/[0-9]/g, '');
  let indice = 0;
  for (const letra of letras) {
    indice = indice * 26 + (letra.charCodeAt(0) - 64);
  }
  return indice - 1;
}

function valorCelda(celda, textos) {
  const tipo = celda.getAttribute('t');
  const valorXml = celda.querySelector('v');

  if (tipo === 's' && valorXml) {
    return textos[parseInt(valorXml.textContent, 10)] ?? '';
  }
  if (tipo === 'inlineStr') {
    return [...celda.getElementsByTagName('t')].map((nodo) => nodo.textContent).join('');
  }
  return valorXml ? valorXml.textContent : '';
}

function filasHoja(xml, textos) {
  const hoja = new DOMParser().parseFromString(xml, 'text/xml');

  return [...hoja.getElementsByTagName('row')].map((fila) => {
    const columnas = [''];
    [...fila.getElementsByTagName('c')].forEach((celda) => {
      const indice = indiceColumna(celda.getAttribute('r'));
      if (indice >= 0 && indice < 2) {
        columnas[indice] = valorCelda(celda, textos);
      }
    });
    return columnas;
  });
}

async function aFilasXlsx(archivo) {
  const directorio = entradasZip(archivo);

  const datosEntrada = async (nombre) => {
    const entrada = directorio.find((elemento) => elemento.nombre === nombre);
    if (!entrada) throw new Error(`No se encontró la entrada ${nombre} del archivo.`);
    entrada.datosInicio = saltarCabeceraLocal(archivo, entrada);
    return decodificarTexto(await descomprimirEntrada(archivo, entrada));
  };

  const xmlTextos = new DOMParser().parseFromString(
    await datosEntrada('xl/sharedStrings.xml'),
    'text/xml'
  );
  const textos = [...xmlTextos.getElementsByTagName('si')].map((nodo) =>
    [...nodo.getElementsByTagName('t')].map((interno) => interno.textContent).join('')
  );

  const xmlHoja = await datosEntrada('xl/worksheets/sheet1.xml');
  return filasHoja(xmlHoja, textos);
}

// ==========================================
// Filtrado y apego al formato de salida
// ==========================================

function esEncabezado(sap, nombre) {
  const par = `${sap} ${nombre}`.toLowerCase();
  return par.includes('sap') || par.includes('pers.') || par.includes('personal');
}

export async function leerColaboradores(archivo) {
  const esXlsx = /\.xlsx$/i.test(archivo.name) || archivo.type.includes('spreadsheetml');

  const matriz = esXlsx
    ? await aFilasXlsx(await archivo.arrayBuffer())
    : aFilasCsv(await archivo.text());

  const filas = [];
  let omitidasVacias = 0;

  matriz.forEach((columnas, indice) => {
    const sap = recortarCelda(columnas[0]);
    const nombre = recortarCelda(columnas[1]);

    if (vacio(sap) && vacio(nombre)) {
      omitidasVacias += 1;
      return;
    }

    if (indice === 0 && esEncabezado(sap, nombre)) {
      omitidasVacias += 1;
      return;
    }

    filas.push({ sap, nombre });
  });

  return { filas, leidas: filas.length, omitidasVacias };
}
