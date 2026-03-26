# API-INSEROS

## Descripción del Proyecto
Esta aplicación es un servicio backend escrito en Node.js (Express) que permite manipular y componer documentos de Word (`.docx`). Principalmente, facilita la inserción de fragmentos predefinidos (conocidos como "insertos") y anexar texto de tipo "minuta" en un documento DOCX base (todo procesado de forma efímera en RAM/Memoria sin guardar basura en el disco). Consigue esto buscando marcadores exactos como `[INSERTOS]` o `[MINUTA]` para realizar reemplazos estructurales del texto y fusionándolo a nivel de nodos XML nativos del documento.

El proyecto también incluye una interfaz visual de cliente en vanilla html (`public/index.html`) para probar y consumir la API cómodamente mediante el navegador.

## Arquitectura y Estructura
El proyecto está bien definido y sigue un patrón de diseño que separa firmemente las responsabilidades:

* `src/routes/`: Define enrutadores Express, delegando y centralizando endpoints y sus validaciones multipart (`multer`).
* `src/controllers/`: Modera la parte de HTTP, validando los requests (`req`, `res`) y coordinando el flujo general.
* `src/services/`: Contiene el núcleo procesador central interactuando con las librerías `pizzip` y `fast-xml-parser` para extraer, limpiar, fusionar (`merge`) y modificar el DOCX de forma recursiva.
* `public/`: Contiene el frontend que dialoga e interactúa asíncronamente con la REST API.

## Especificaciones API (OpenAPI)
El proyecto ha sido rediseñado para cumplir un estándar sólido de **API-First**, de esta forma los clientes se acoplarán con facilidad usando una Interfaz de Reglas unificada. 

Todo el detalle canónico de parámetros, esquemas formales y códigos de respuesta se encuentra documentado en el archivo formal adjunto al repositorio: [openapi.yaml](./openapi.yaml). 

Las rutas principales ahora utilizan el prefijo `/api/v1/` para producción:

1. **`GET /api/v1/insertos`**: Lista los insertos disponibles.
   - *Respuesta*: JSON con el listado de IDs y nombres de archivos.

2. **`POST /api/v1/compose`**: Mezcla el documento base con múltiples insertos.
   - *Parámetros (Multipart)*:
     - `file`: Documento DOCX base.
     - `insertIds`: String o Array JSON con IDs (ej. `"1,2"` o `"[1,2]"`).
     - `pageBreakBetween` (opcional): `"true"` para insertar saltos de página entre cada inserto.

3. **`POST /api/v1/minuta`**: Inserta un documento (minuta) en un marcador específico.
   - *Parámetros (Multipart)*:
     - `minuta`: Documento DOCX a inyectar.
     - `destino`: Documento DOCX donde se inyectará.
     - `placeholder` (opcional): Marcador de búsqueda (default `[MINUTA]`).
     - `pageBreakBefore` / `pageBreakAfter` (opcionales): `"true"` para saltos de página.

4. **`POST /api/v1/inspect`**: Valida marcadores en un documento.
   - *Parámetros (Multipart)*: `file` (DOCX).

5. **`POST /api/v1/consolidar`**: **(Nuevo)** Lógica unificada de `compose` + `minuta`.
   - *Parámetros (Multipart)*:
     - `file`: Documento base (debe tener `[INSERTOS]` y `[MINUTA]`).
     - `minuta`: Documento a inyectar en el marcador de minuta.
     - `inserto_id` (opcional): IDs de los fragmentos para el marcador de insertos. Si no se envía, se ignora el paso de insertos pero se procesa la minuta.
     - `pageBreakBetween`, `pageBreakBefore`, `pageBreakAfter`: Control de saltos de página.


## Despliegue en Servidor Linux (Criterios y Recomendaciones)
Considera puntalmente los siguientes requisitos para un entorno de Producción en el servidor Linux usando Systemd/PM2:
1. **Node.js**: Asegúrate de tener una versión LTS de Node moderna (v18.x o superior).
2. **Dependencias de Producción**: Instala los paquetes nativos cuidando de omitir las versiones de desarrollo: `npm install --omit=dev`.
3. **Módulo de Reinicio PM2**: Mantiene el proceso siempre encendido pase lo que pase:
   ```bash
   pm2 start server.js --name "api-insertos-backend"
   pm2 save
   pm2 startup
   ```
4. **Proxy Reverso (NGINX)**: Necesario encadenarlo detrás un servidor proxy web local como *Nginx* en puertos estándar. La API estará disponible en producción bajo la URL principal: `http://161.132.68.187:8011`.
5. **Permisos de Archivos**: Valida repetidas veces que el usuario o daemon que arranca la App (p. Ej `www-data`) tenga derechos totales de lectura a la ruta de tus minutas/archivos o te marcará `Forbidden/ENOENT`.
