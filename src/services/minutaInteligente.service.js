const PizZip = require('pizzip');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');

/** Utilidad para obtener el texto plano de un nodo preservando orden */
function getParagraphText(pNode) {
  let text = '';
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    for (const k of Object.keys(node)) {
      if (k === ':@') continue;
      const v = node[k];
      if (k === 'w:t') {
        if (Array.isArray(v)) {
          for (const it of v) {
            if (typeof it === 'string') text += it;
            else if (it && typeof it === 'object' && '#text' in it) text += String(it['#text'] ?? '');
          }
        } else if (typeof v === 'string') text += v;
        else if (v && typeof v === 'object' && '#text' in v) text += String(v['#text'] ?? '');
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'object') walk(v);
    }
  }
  walk(pNode);
  return text.trim();
}

/** Extrae todo el texto del documento para la IA */
function extractTextForAI(buffer) {
  const zip = new PizZip(buffer);
  const docXml = zip.file('word/document.xml')?.asText();
  if (!docXml) return '';

  const parserPO = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true, trimValues: false });
  const docObj = parserPO.parse(docXml);
  const docNode = docObj.find(n => n['w:document']);
  if (!docNode) return '';
  const bodyNode = docNode['w:document'].find(n => n['w:body']);
  if (!bodyNode) return '';

  const children = bodyNode['w:body'] || [];
  let fullText = '';
  children.forEach(child => {
    if (child['w:p']) {
      const pText = getParagraphText(child);
      if (pText) fullText += pText + '\n';
    }
  });
  return fullText;
}

function applyCustomFormat(nodes, formatOptions) {
  const { fuente, tamaño, interlineado } = formatOptions;

  function walk(n) {
    if (!n || typeof n !== 'object') return;

    // Modificar interlineado y propiedades de texto en w:p
    if ('w:p' in n && Array.isArray(n['w:p'])) {
      let pChildren = n['w:p'];
      let pPrNode = pChildren.find(child => typeof child === 'object' && 'w:pPr' in child);
      if (!pPrNode) {
        pPrNode = { 'w:pPr': [] };
        pChildren.unshift(pPrNode);
      }
      let prChildren = pPrNode['w:pPr'];
      if (!Array.isArray(prChildren)) prChildren = pPrNode['w:pPr'] = prChildren ? [prChildren] : [];
      
      // Remover interlineado viejo si enviaron nuevo
      if (interlineado) {
        for (let i = prChildren.length - 1; i >= 0; i--) {
          const key = Object.keys(prChildren[i]).find(k => k !== ':@');
          if (key === 'w:spacing') prChildren.splice(i, 1);
        }
        const lineSpacingTwips = Math.round(parseFloat(interlineado) * 240);
        prChildren.push({ 'w:spacing': [], ':@': { 'w:line': String(lineSpacingTwips), 'w:lineRule': 'auto' } });
      }

      // Forzar fuente y tamaño en el párrafo (w:rPr dentro de w:pPr)
      if (fuente || tamaño) {
        let pRPrNode = prChildren.find(child => typeof child === 'object' && 'w:rPr' in child);
        if (!pRPrNode) {
          pRPrNode = { 'w:rPr': [] };
          prChildren.push(pRPrNode);
        }
        let pRPrChildren = pRPrNode['w:rPr'];
        if (!Array.isArray(pRPrChildren)) pRPrChildren = pRPrNode['w:rPr'] = pRPrChildren ? [pRPrChildren] : [];

        for (let i = pRPrChildren.length - 1; i >= 0; i--) {
          const key = Object.keys(pRPrChildren[i]).find(k => k !== ':@');
          if (key === 'w:rFonts' && fuente) pRPrChildren.splice(i, 1);
          if ((key === 'w:sz' || key === 'w:szCs') && tamaño) pRPrChildren.splice(i, 1);
        }

        if (fuente) {
          pRPrChildren.push({ 'w:rFonts': [], ':@': { 'w:ascii': fuente, 'w:hAnsi': fuente, 'w:cs': fuente } });
        }
        if (tamaño) {
          const halfPt = String(Math.round(parseFloat(tamaño) * 2));
          pRPrChildren.push({ 'w:sz': [], ':@': { 'w:val': halfPt } });
          pRPrChildren.push({ 'w:szCs': [], ':@': { 'w:val': halfPt } });
        }
      }
    }

    // Modificar fuente y tamaño en w:r
    if ('w:r' in n && Array.isArray(n['w:r'])) {
      let rChildren = n['w:r'];
      let rPrNode = rChildren.find(child => typeof child === 'object' && 'w:rPr' in child);
      if (!rPrNode) {
        rPrNode = { 'w:rPr': [] };
        rChildren.unshift(rPrNode);
      }
      let prChildren = rPrNode['w:rPr'];
      if (!Array.isArray(prChildren)) prChildren = rPrNode['w:rPr'] = prChildren ? [prChildren] : [];

      for (let i = prChildren.length - 1; i >= 0; i--) {
        const key = Object.keys(prChildren[i]).find(k => k !== ':@');
        if (key === 'w:rFonts' && fuente) prChildren.splice(i, 1);
        if ((key === 'w:sz' || key === 'w:szCs') && tamaño) prChildren.splice(i, 1);
      }

      if (fuente) {
        prChildren.push({ 'w:rFonts': [], ':@': { 'w:ascii': fuente, 'w:hAnsi': fuente, 'w:cs': fuente } });
      }
      if (tamaño) {
        // tamaño viene en pt, docx usa medios pt (ej 12 -> 24)
        const halfPt = String(Math.round(parseFloat(tamaño) * 2));
        prChildren.push({ 'w:sz': [], ':@': { 'w:val': halfPt } });
        prChildren.push({ 'w:szCs': [], ':@': { 'w:val': halfPt } });
      }
    }

    // Convertir texto a mayúsculas en w:t
    if ('w:t' in n) {
      const tVal = n['w:t'];
      if (Array.isArray(tVal)) {
        for (let i = 0; i < tVal.length; i++) {
          if (typeof tVal[i] === 'string') {
            tVal[i] = tVal[i].toUpperCase();
          } else if (tVal[i] && typeof tVal[i] === 'object' && '#text' in tVal[i]) {
            tVal[i]['#text'] = String(tVal[i]['#text']).toUpperCase();
          }
        }
      } else if (typeof tVal === 'string') {
        n['w:t'] = tVal.toUpperCase();
      } else if (tVal && typeof tVal === 'object' && '#text' in tVal) {
        tVal['#text'] = String(tVal['#text']).toUpperCase();
      }
    }

    for (const k of Object.keys(n)) {
      if (k === ':@') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'object') walk(v);
    }
  }
  nodes.forEach(walk);
}

function normalizeText(t) {
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Reconstruye el DOCX cortando lo que no es de la minuta y aplicando formato.
 */
function processMinutaInteligente(buffer, aiLimits, formatOptions) {
  const zip = new PizZip(buffer);
  const docXmlPath = 'word/document.xml';
  const docXml = zip.file(docXmlPath)?.asText();
  if (!docXml) throw new Error("No document.xml found");

  const parserPO = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true, trimValues: false });
  const docObj = parserPO.parse(docXml);

  const docNode = docObj.find(n => n['w:document']);
  const bodyNode = docNode['w:document'].find(n => n['w:body']);
  const children = bodyNode['w:body'] || [];

  // Encuentra indices
  let startIdx = 0;
  let endIdx = children.length - 1;
  const searchStart = normalizeText(aiLimits.texto_inicio);
  const searchEnd = normalizeText(aiLimits.texto_fin);

  // Mapeamos cada caracter del texto normalizado a su nodo original
  const charToNodeIdx = [];
  let fullTextStr = '';

  children.forEach((child, idx) => {
    const pText = getParagraphText(child);
    if (pText) {
      const normalizedPText = normalizeText(pText);
      if (normalizedPText) {
        const textToAppend = normalizedPText + ' '; // 1 espacio entre párrafos
        for (let i = 0; i < textToAppend.length; i++) {
          charToNodeIdx.push(idx);
        }
        fullTextStr += textToAppend;
      }
    }
  });

  // Búsqueda del índice de inicio
  const startMatchPos = fullTextStr.indexOf(searchStart);
  if (startMatchPos !== -1) {
    startIdx = charToNodeIdx[startMatchPos];
  }

  // Búsqueda del índice de fin
  const endMatchPos = fullTextStr.lastIndexOf(searchEnd); // lastIndexOf por si hay textos repetidos, buscar el último
  if (endMatchPos !== -1) {
    const matchEndChar = endMatchPos + searchEnd.length - 1;
    endIdx = charToNodeIdx[matchEndChar];
  }

  // Slice de los hijos validos, excluyendo sectPr que siempre debe ir al final
  let validNodes = children.slice(startIdx, endIdx + 1).filter(n => !n['w:sectPr']);

  // Filtrar textos intermedios a eliminar (firmas, etc.)
  if (aiLimits.textos_a_eliminar && Array.isArray(aiLimits.textos_a_eliminar) && aiLimits.textos_a_eliminar.length > 0) {
    const textosEliminarNormalized = aiLimits.textos_a_eliminar.map(t => normalizeText(t));
    
    let validFullTextStr = '';
    const validCharToNodeIdx = [];
    
    validNodes.forEach((child, idx) => {
      const pText = getParagraphText(child);
      if (pText) {
        const normalizedPText = normalizeText(pText);
        if (normalizedPText) {
          const textToAppend = normalizedPText + ' ';
          for (let i = 0; i < textToAppend.length; i++) {
            validCharToNodeIdx.push(idx);
          }
          validFullTextStr += textToAppend;
        }
      }
    });

    const indicesAEliminar = new Set();

    textosEliminarNormalized.forEach(searchDel => {
      let matchPos = validFullTextStr.indexOf(searchDel);
      while (matchPos !== -1) {
        const matchEndChar = matchPos + searchDel.length - 1;
        const startNodeIdx = validCharToNodeIdx[matchPos];
        const endNodeIdx = validCharToNodeIdx[matchEndChar];
        
        if (startNodeIdx !== endNodeIdx) {
          // Si el bloque a eliminar abarca múltiples párrafos, es seguro borrarlos todos
          for (let i = startNodeIdx; i <= endNodeIdx; i++) {
            indicesAEliminar.add(i);
          }
        } else {
          // Si está en un solo párrafo, asegurarnos de no borrar un párrafo legal gigante entero
          // por culpa de que contiene una simple firma o fecha.
          const pText = normalizeText(getParagraphText(validNodes[startNodeIdx]));
          // Si el texto a eliminar representa al menos el 40% del párrafo, o el párrafo es pequeño (menor a 80 chars)
          if (searchDel.length >= pText.length * 0.4 || pText.length < 80) {
            indicesAEliminar.add(startNodeIdx);
          } else {
            console.warn(`[MinutaInteligente] Se evitó borrar párrafo gigante por coincidencia menor: "${searchDel}" en "${pText.substring(0, 30)}..."`);
          }
        }
        matchPos = validFullTextStr.indexOf(searchDel, matchPos + 1);
      }
    });

    validNodes = validNodes.filter((_, idx) => !indicesAEliminar.has(idx));
  }

  let sectPrNode = children.find(n => n['w:sectPr']);

  // Aplicar Formato a los Nodos válidos
  applyCustomFormat(validNodes, formatOptions);

  // Procesar Margenes en sectPr
  if (sectPrNode && formatOptions.margenes) {
    // margenes ej: "[4, 4, 4, 4]" -> [Top, Bottom, Left, Right] en cm
    try {
      let mArr = formatOptions.margenes;
      if (typeof mArr === 'string') {
        mArr = JSON.parse(mArr);
      }
      if (Array.isArray(mArr) && mArr.length >= 4) {
        // 1 cm = 567 twips
        const top = Math.round(mArr[0] * 567);
        const bottom = Math.round(mArr[1] * 567);
        const left = Math.round(mArr[2] * 567);
        const right = Math.round(mArr[3] * 567);

        let sectPrChildren = sectPrNode['w:sectPr'];
        let pgMarNode = sectPrChildren.find(c => typeof c === 'object' && 'w:pgMar' in c);
        
        if (!pgMarNode) {
          pgMarNode = { 'w:pgMar': [], ':@': {} };
          sectPrChildren.push(pgMarNode);
        }
        if (!pgMarNode[':@']) pgMarNode[':@'] = {};
        
        pgMarNode[':@']['w:top'] = String(top);
        pgMarNode[':@']['w:bottom'] = String(bottom);
        pgMarNode[':@']['w:left'] = String(left);
        pgMarNode[':@']['w:right'] = String(right);
      }
    } catch(e) {
      console.error("[MinutaInteligente] Error procesando márgenes:", e);
    }
  }

  // Reensamblar body
  if (sectPrNode) validNodes.push(sectPrNode);
  bodyNode['w:body'] = validNodes;

  const builderPO = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true, suppressEmptyNode: true });
  const newDocXml = builderPO.build(docObj);
  zip.file(docXmlPath, newDocXml);

  return zip.generate({ type: 'nodebuffer' });
}

module.exports = {
  extractTextForAI,
  processMinutaInteligente
};
