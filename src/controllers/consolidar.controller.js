const { composeInMemory, countInsertosPlaceholders } = require('../services/composeOnce.service');
const { mergeMinutaInMemory, countPlaceholder } = require('../services/minuta.service');

function parseIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap(parseIds);
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith('[')) { try { return JSON.parse(s); } catch {} }
    return s.split(/[,\s]+/).map(Number).filter(n => !Number.isNaN(n));
  }
  return [];
}

/**
 * POST /api/v1/consolidar
 * form-data:
 *  - file: DOCX base (File)
 *  - minuta: DOCX adjunto (File)
 *  - insertIds: String de ids ("1,2" o "[1,2]")
 *  - placeholder: (Opcional) String default "[MINUTA]"
 *  - pageBreakBefore: (Opcional) "true"
 *  - pageBreakAfter: (Opcional) "true"
 *  - pageBreakBetween: (Opcional) "true"
 */
async function consolidar(req, res) {
  try {
    const files = req.files || {};
    const file = files.file?.[0];
    const minuta = files.minuta?.[0];
    const body = req.body || {};
    const ids = parseIds(body.insertIds ?? body.ids ?? body.insertosIds);

    console.log('[consolidar] → entrada', {
      file: file ? { name: file.originalname, size: file.size } : null,
      minuta: minuta ? { name: minuta.originalname, size: minuta.size } : null,
      ids
    });

    if (!file || !minuta) {
      console.warn('[consolidar] faltan archivos file o minuta');
      return res.status(400).json({ error: 'Envía ambos archivos en form-data: "file" (base) y "minuta" (.docx).' });
    }
    if (!ids.length) {
      console.warn('[consolidar] faltan insertIds');
      return res.status(400).json({ error: 'Envía al menos un ID en insertIds (ej. 1,3,5 o [1,3,5]).' });
    }

    const placeholder = (body.placeholder || '[MINUTA]').trim();
    const before = ['1','true','on','yes'].includes(String(body.pageBreakBefore || '').toLowerCase());
    const after  = ['1','true','on','yes'].includes(String(body.pageBreakAfter  || '').toLowerCase());
    const between = ['1','true','on','yes'].includes(String(body.pageBreakBetween  || '').toLowerCase());

    // 1. Validar [INSERTOS]
    const { exact: exactI, mixed: mixedI } = await countInsertosPlaceholders(file.buffer);
    if (exactI === 0 && mixedI === 0) {
      return res.status(400).json({
        error: 'El documento base no contiene el marcador requerido para insertos.',
        marker: '[INSERTOS]',
        found: false
      });
    }
    if (mixedI > 0) {
      return res.status(400).json({
        error: 'El marcador [INSERTOS] debe estar solo en su propio párrafo (sin texto antes/después).',
        marker: '[INSERTOS]',
        mixed: mixedI
      });
    }

    // 2. Validar [MINUTA]
    const { exact: exactM, mixed: mixedM } = countPlaceholder(file.buffer, placeholder);
    if (exactM === 0 && mixedM === 0) {
      return res.status(400).json({
        error: `El documento base no contiene el marcador requerido para la minuta.`,
        marker: placeholder,
        found: false
      });
    }
    if (mixedM > 0) {
      return res.status(400).json({
        error: `El marcador ${placeholder} debe estar solo en su propio párrafo (sin texto antes/después).`,
        marker: placeholder,
        mixed: mixedM
      });
    }

    // 3. Componer Insertos
    const step1Buffer = await composeInMemory(file.buffer, ids, { pageBreakBetween: between });

    // Post-check insertos
    const postIns = await countInsertosPlaceholders(step1Buffer);
    if (postIns.exact > 0) {
      console.error('[consolidar] aún hay placeholders [INSERTOS] tras componer');
      return res.status(500).json({ error: 'No se pudo insertar en los marcadores [INSERTOS].' });
    }

    // 4. Fusionar Minuta
    const finalBuffer = mergeMinutaInMemory(step1Buffer, minuta.buffer, {
      placeholder,
      pageBreakBefore: before,
      pageBreakAfter: after
    });

    // Post-check minuta
    const postMin = countPlaceholder(finalBuffer, placeholder);
    if (postMin.exact > 0) {
      console.error('[consolidar] aún hay placeholders [MINUTA] tras componer');
      return res.status(500).json({ error: `No se pudo insertar en el marcador ${placeholder}.` });
    }

    res.setHeader('X-Consolidar-Processed-Ids', ids.length.toString());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="consolidado_${Date.now()}.docx"`);
    return res.send(finalBuffer);

  } catch (err) {
    console.error('[consolidar] ERROR ', err);
    return res.status(500).json({ error: 'No se pudo consolidar el documento' });
  }
}

module.exports = { consolidar };
