/**
 * Definición de valores permitidos (Enums) y función de validación
 * para los parámetros de formato de la Minuta.
 */

const ALLOWED_FONTS = [
  'Arial', 
  'Times New Roman', 
  'Verdana', 
  'Calibri', 
  'Tahoma', 
  'Courier New'
];

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 72;

const ALLOWED_LINE_SPACING = [1, 1.15, 1.5, 2, 2.5, 3];

function validateFormatOptions(options) {
  const errors = [];
  const { fuente, interlineado, margenes } = options;
  const tamaño = options.tamaño || options.tamano; // Soportar ambos

  // Validar Fuente
  if (fuente) {
    // Busca ignorando mayúsculas/minúsculas
    const isValidFont = ALLOWED_FONTS.some(f => f.toLowerCase() === fuente.toLowerCase());
    if (!isValidFont) {
      errors.push(`Fuente '${fuente}' no permitida. Opciones válidas: ${ALLOWED_FONTS.join(', ')}`);
    }
  }

  // Validar Tamaño
  if (tamaño) {
    const size = parseFloat(tamaño);
    if (isNaN(size) || size < MIN_FONT_SIZE || size > MAX_FONT_SIZE) {
      errors.push(`Tamaño '${tamaño}' inválido. Debe ser un número entre ${MIN_FONT_SIZE} y ${MAX_FONT_SIZE}.`);
    }
  }

  // Validar Interlineado
  if (interlineado) {
    const spacing = parseFloat(interlineado);
    if (!ALLOWED_LINE_SPACING.includes(spacing)) {
      errors.push(`Interlineado '${interlineado}' no permitido. Opciones válidas: ${ALLOWED_LINE_SPACING.join(', ')}`);
    }
  }

  // Validar Márgenes
  if (margenes) {
    try {
      const parsed = typeof margenes === 'string' ? JSON.parse(margenes) : margenes;
      if (!Array.isArray(parsed) || parsed.length !== 4) {
        errors.push('Márgenes inválidos. Debe ser un arreglo exactamente de 4 números.');
      } else if (parsed.some(val => isNaN(parseFloat(val)))) {
        errors.push('Márgenes inválidos. Todos los valores dentro del arreglo deben ser numéricos.');
      }
    } catch (e) {
      errors.push('Formato de márgenes inválido. Debe ser un arreglo JSON válido. Ej: "[2.5, 2.5, 3, 3]"');
    }
  }

  return errors;
}

module.exports = {
  ALLOWED_FONTS,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  ALLOWED_LINE_SPACING,
  validateFormatOptions
};
