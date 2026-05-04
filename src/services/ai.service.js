const { OpenAI } = require('openai');

// Instancia global (requiere OPENAI_API_KEY en .env)
const openai = new OpenAI();

/**
 * Llama a GPT-4o para identificar el inicio y fin de la minuta en un texto dado.
 * @param {string} textoDocumento - El texto crudo extraído del DOCX
 * @param {string} reglasPrompt - Las reglas obtenidas de la base de datos (p_prompt_minuta)
 * @returns {Promise<{texto_inicio: string, texto_fin: string}>}
 */
async function detectarLimitesMinuta(textoDocumento, reglasPrompt) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Eres un asistente legal experto. Tu trabajo es analizar un documento notarial y detectar exactamente dónde empieza y dónde termina la minuta real (excluyendo encabezados o pie de página innecesarios, según las reglas indicadas).
Debes devolver un JSON válido con dos propiedades:
"texto_inicio": Un extracto exacto (de 1 a 3 oraciones completas) del texto que marca el comienzo real de la minuta. Debe ser idéntico carácter por carácter a como aparece en el documento para que podamos hacer un substring exacto.
"texto_fin": Un extracto exacto (de 1 a 3 oraciones completas) del texto que marca el final de la minuta.

Reglas adicionales para esta minuta:
${reglasPrompt}`
        },
        {
          role: 'user',
          content: `Aquí tienes el documento crudo:\n\n${textoDocumento}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1 // Baja temperatura para mayor precisión
    });

    const content = response.choices[0].message.content;
    const jsonResult = JSON.parse(content);

    return {
      texto_inicio: jsonResult.texto_inicio,
      texto_fin: jsonResult.texto_fin
    };
  } catch (error) {
    console.error('[AI Service] Error detectando límites:', error);
    throw new Error('No se pudo procesar el documento con Inteligencia Artificial.');
  }
}

module.exports = {
  detectarLimitesMinuta
};
