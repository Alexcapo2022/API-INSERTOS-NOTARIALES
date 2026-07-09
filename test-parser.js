const { XMLParser, XMLBuilder } = require('fast-xml-parser');

// Simulated Word document XML
const xmlData = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
        <w:p>
            <w:r>
                <w:t>01234567</w:t>
            </w:r>
        </w:p>
        <w:p>
            <w:r>
                <w:t>100.50</w:t>
            </w:r>
        </w:p>
        <w:p>
            <w:r>
                <w:t>true</w:t>
            </w:r>
        </w:p>
        <w:p>
            <w:r>
                <w:t>Símbolos: &amp; &lt; &gt; " '</w:t>
            </w:r>
        </w:p>
    </w:body>
</w:document>`;

// 1. OLD BEHAVIOR (Without parseTagValue: false)
const oldParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true, trimValues: false });
const oldParsed = oldParser.parse(xmlData);

const oldBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true, suppressEmptyNode: true });
const oldXml = oldBuilder.build(oldParsed);

// 2. NEW BEHAVIOR (With parseTagValue: false)
const newParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true, trimValues: false, parseTagValue: false });
const newParsed = newParser.parse(xmlData);

const newBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true, suppressEmptyNode: true });
const newXml = newBuilder.build(newParsed);

console.log("=== PRUEBA UNITARIA DEL PARSER XML ===");
console.log("1. TEST DNI CON CERO A LA IZQUIERDA (01234567):");
console.log("OLD XML:", oldXml.includes("01234567") ? "PASSED" : "FAILED - Ceros perdidos! => " + oldXml.match(/1234567/)[0]);
console.log("NEW XML:", newXml.includes("01234567") ? "PASSED" : "FAILED");

console.log("\n2. TEST DECIMALES (100.50):");
console.log("OLD XML:", oldXml.includes("100.50") ? "PASSED" : "FAILED - Convertido a número => " + oldXml.match(/100.5/)[0]);
console.log("NEW XML:", newXml.includes("100.50") ? "PASSED" : "FAILED");

console.log("\n3. TEST BOOLEANOS (true):");
console.log("OLD XML:", oldXml.includes("true") ? "PASSED" : "FAILED - Posible conversión booleana");
console.log("NEW XML:", newXml.includes("true") ? "PASSED" : "FAILED");

console.log("\n=== CONCLUSIÓN ===");
if (newXml.includes("01234567") && newXml.includes("100.50")) {
    console.log("✅ El nuevo parser respeta 100% los Strings puros. No muta ni borra contenido.");
} else {
    console.log("❌ Sigue habiendo un problema de mutación de datos.");
}
