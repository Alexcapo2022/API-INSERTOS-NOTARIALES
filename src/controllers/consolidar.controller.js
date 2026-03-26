const { composeInMemory, countInsertosPlaceholders } = require('../services/composeOnce.service');
const { mergeMinutaInMemory, countPlaceholder } = require('../services/minuta.service');

function parseIds(raw) {
  if (!raw) return { ids: [], error: null };
  if (Array.isArray(raw)) {
    const results = raw.map(parseIds);
    const err = results.find(r => r.error);
    if (err) return err;
    return { ids: results.flatMap(r => r.ids), error: null };
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return { ids: [], error: null };
    let tokens = [];
    if (s.startsWith('[')) { 
      try { 
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) tokens = parsed;
        else tokens = [parsed];
      } catch {
        return { ids: [], error: 'El formato JSON de inserto_id es inválido.' };
      } 
    } else {
      tokens = s.split(/[,\s]+/);
    }
    
    const ids = [];
    for (const t of tokens) {
      if (t === null || t === undefined || String(t).trim() === '') continue;
      const n = Number(t);
      if (Number.isNaN(n)) {
        return { ids: [], error: `ID inválido detectado: "${t}". Solo se permiten números.` };
      }
      ids.push(n);
    }
    return { ids, error: null };
  }
  return { ids: [], error: 'El tipo de dato de inserto_id no es soportado.' };
}

/**
 * POST /api/v1/consolidar
 * form-data:
 *  - file: DOCX base (File)
 *  - minuta: DOCX adjunto (File)
 *  - inserto_id: (Opcional) String de ids ("1,2" o "[1,2]")
 *  - placeholder: (Opcional) String default "[MINUTA]"
 *  - pageBreakBefore: (Opcional) "true"
 *  - pageBreakAfter: (Opcional) "true"
 *  - pageBreakBetween: (Opcional) "true"
 */
async function consolidar(req, res) {
  try {
    const body = req.body || {};
    
    // 0. Validación de Seguridad: Solo parámetros permitidos
    const allowedKeys = ['inserto_id', 'insertIds', 'ids', 'insertosIds', 'placeholder', 'pageBreakBefore', 'pageBreakAfter', 'pageBreakBetween'];
    const extraKeys = Object.keys(body).filter(k => !allowedKeys.includes(k));
    if (extraKeys.length > 0) {
      console.warn('[consolidar] parámetros no permitidos:', extraKeys);
      return res.status(400).json({ 
        error: 'Petición rechazada por seguridad: parámetros no permitidos detectados.',
        invalidFields: extraKeys 
      });
    }

    const files = req.files || {};
    const file = files.file?.[0];
    const minuta = files.minuta?.[0];
    
    // Validación de IDs estricta
    const { ids, error: idError } = parseIds(body.inserto_id ?? body.insertIds ?? body.ids ?? body.insertosIds);
    if (idError) {
      console.warn('[consolidar] error en IDs:', idError);
      return res.status(400).json({ error: idError });
    }

    console.log('[consolidar] → entrada', {
      file: file ? { name: file.originalname, size: file.size } : null,
      minuta: minuta ? { name: minuta.originalname, size: minuta.size } : null,
      inserto_id: ids
    });

    if (!file || !minuta) {
      console.warn('[consolidar] faltan archivos file o minuta');
      return res.status(400).json({ error: 'Envía ambos archivos en form-data: "file" (base) y "minuta" (.docx).' });
    }

    const placeholder = (body.placeholder || '[MINUTA]').trim();
    const before = ['1','true','on','yes'].includes(String(body.pageBreakBefore || '').toLowerCase());
    const after  = ['1','true','on','yes'].includes(String(body.pageBreakAfter  || '').toLowerCase());
    const between = ['1','true','on','yes'].includes(String(body.pageBreakBetween  || '').toLowerCase());

    let currentBuffer = file.buffer;

    // 1. Validar e inyectar [INSERTOS] (Si hay IDs)
    if (ids.length > 0) {
      const { exact: exactI, mixed: mixedI } = await countInsertosPlaceholders(currentBuffer);
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

      currentBuffer = await composeInMemory(currentBuffer, ids, { pageBreakBetween: between });

      // Post-check insertos
      const postIns = await countInsertosPlaceholders(currentBuffer);
      if (postIns.exact > 0) {
        console.error('[consolidar] aún hay placeholders [INSERTOS] tras componer');
        return res.status(500).json({ error: 'No se pudo insertar en los marcadores [INSERTOS].' });
      }
    } else {
      console.log('[consolidar] No se enviaron inserto_id; se omite paso de composición de insertos.');
    }

    // 2. Validar e inyectar [MINUTA]
    const { exact: exactM, mixed: mixedM } = countPlaceholder(currentBuffer, placeholder);
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

    // Fusionar Minuta
    currentBuffer = mergeMinutaInMemory(currentBuffer, minuta.buffer, {
      placeholder,
      pageBreakBefore: before,
      pageBreakAfter: after
    });

    // Post-check minuta
    const postMin = countPlaceholder(currentBuffer, placeholder);
    if (postMin.exact > 0) {
      console.error('[consolidar] aún hay placeholders [MINUTA] tras componer');
      return res.status(500).json({ error: `No se pudo insertar en el marcador ${placeholder}.` });
    }

    res.setHeader('X-Consolidar-Processed-Ids', ids.length.toString());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="consolidado_${Date.now()}.docx"`);
    return res.send(currentBuffer);

  } catch (err) {
    console.error('[consolidar] ERROR ', err);
    return res.status(500).json({ error: 'No se pudo consolidar el documento' });
  }
}

module.exports = { consolidar };
