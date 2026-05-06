function normalizeText(t) {
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

const paragraphs = [
  "SÍRVASE USTED EXTENDER EN SU REGISTRO DE ESCRITURAS PÚBLICAS UNA DE FORMALIZACIÓN DE ACUERDOS QUE OTORGAN “PATBEZA S.A.C”, CON R.U.C. Nº 20492255981, REPRESENTADA POR EL SEÑOR BLADIMIR BENATE HUARCAYA, IDENTIFICADO CON D.N.I. Nº 21547038, SEÑALANDO DOMICILIO EN LA MZ. A, LOTE 20, A.H. SECTOR 1, GRUPO 13, DISTRITO DE VILLA EL SALVADOR, PROVINCIA Y DEPARTAMENTO DE LIMA; BAJO LOS TÉRMINOS Y CONDICIONES SIGUIENTES:",
  "PRIMERO: POR ACTA DE JUNTA GENERAL...",
  "LIMA, 26 DE DICIEMBRE DEL 2,013.",
  "______________________________",
  "BLADIMIR BENATE HUARCAYA",
  "JUNTA GENERAL DE ACCIONISTAS"
];

const aiTextosAEliminar = [
  'LIMA, 26 DE DICIEMBRE DEL 2,013.',
  '______________________________\nBLADIMIR BENATE HUARCAYA',
  'BLADIMIR BENATE HUARCAYA' // Simulando que la IA devuelve solo el nombre
];

let validFullTextStr = "";
const validCharToNodeIdx = [];

paragraphs.forEach((pText, idx) => {
  const normalizedPText = normalizeText(pText);
  if (normalizedPText) {
    const textToAppend = normalizedPText + " ";
    for (let i = 0; i < textToAppend.length; i++) {
      validCharToNodeIdx.push(idx);
    }
    validFullTextStr += textToAppend;
  }
});

const indicesAEliminar = new Set();
const textosEliminarNormalized = aiTextosAEliminar.map(t => normalizeText(t)).filter(t => t);

textosEliminarNormalized.forEach(searchDel => {
  let matchPos = validFullTextStr.indexOf(searchDel);
  while (matchPos !== -1) {
    const matchEndChar = matchPos + searchDel.length - 1;
    const startNodeIdx = validCharToNodeIdx[matchPos];
    const endNodeIdx = validCharToNodeIdx[matchEndChar];
    
    if (startNodeIdx !== endNodeIdx) {
      console.log(`[!] Borrando bloque multi-párrafo (${startNodeIdx} al ${endNodeIdx}) para: "${searchDel}"`);
      for (let i = startNodeIdx; i <= endNodeIdx; i++) {
        indicesAEliminar.add(i);
      }
    } else {
      const pText = normalizeText(paragraphs[startNodeIdx]);
      if (searchDel.length >= pText.length * 0.4 || pText.length < 80) {
        console.log(`[!] Borrando párrafo ${startNodeIdx} exitosamente: "${searchDel}" (Cumple ratio de seguridad)`);
        indicesAEliminar.add(startNodeIdx);
      } else {
        console.log(`[ESCUDO ACTIVADO] Se protegió el párrafo ${startNodeIdx} gigante. Ignorando coincidencia menor de: "${searchDel}"`);
      }
    }
    matchPos = validFullTextStr.indexOf(searchDel, matchPos + 1);
  }
});

console.log("\nRESULTADO FINAL DE PÁRRAFOS:");
paragraphs.forEach((pText, idx) => {
  if (indicesAEliminar.has(idx)) {
    console.log(`❌ [ELIMINADO] ${pText.substring(0, 50)}...`);
  } else {
    console.log(`✅ [CONSERVADO] ${pText.substring(0, 50)}...`);
  }
});
