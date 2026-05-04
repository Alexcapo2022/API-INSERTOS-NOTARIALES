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

    // Modificar interlineado en w:p
    if ('w:p' in n && interlineado && Array.isArray(n['w:p'])) {
      let pChildren = n['w:p'];
      let pPrNode = pChildren.find(child => typeof child === 'object' && 'w:pPr' in child);
      if (!pPrNode) {
        pPrNode = { 'w:pPr': [] };
        pChildren.unshift(pPrNode);
      }
      let prChildren = pPrNode['w:pPr'];
      if (!Array.isArray(prChildren)) prChildren = pPrNode['w:pPr'] = prChildren ? [prChildren] : [];
      
      // Remover interlineado viejo
      for (let i = prChildren.length - 1; i >= 0; i--) {
        const key = Object.keys(prChildren[i]).find(k => k !== ':@');
        if (key === 'w:spacing') prChildren.splice(i, 1);
      }
      // Agregar nuevo: spacing en twips. (1 linea aprox = 240)
      const lineSpacingTwips = Math.round(parseFloat(interlineado) * 240);
      prChildren.push({ 'w:spacing': [], ':@': { 'w:line': String(lineSpacingTwips), 'w:lineRule': 'auto' } });
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

  // Búsqueda del índice de inicio
  for (let i = 0; i < children.length; i++) {
    const text = normalizeText(getParagraphText(children[i]));
    if (text && text.includes(searchStart)) {
      startIdx = i;
      break;
    }
  }

  // Búsqueda del índice de fin
  for (let i = children.length - 1; i >= startIdx; i--) {
    const text = normalizeText(getParagraphText(children[i]));
    if (text && text.includes(searchEnd)) {
      endIdx = i;
      break;
    }
  }

  // Slice de los hijos validos, excluyendo sectPr que siempre debe ir al final
  let validNodes = children.slice(startIdx, endIdx + 1).filter(n => !n['w:sectPr']);
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
