# PAI Digital FUMC — Fase 1

Aplicación React + TypeScript + Vite para modernizar el Plan de Acción Institucional.

## Requisitos
Node.js 22 LTS y npm.

## Ejecutar
1. Descomprimir el proyecto.
2. Abrir la carpeta `pai-digital-react` en VS Code.
3. En la terminal ejecutar `npm install`.
4. Ejecutar `npm run dev`.
5. Abrir la URL local que indique Vite (normalmente http://localhost:5173).
6. Ejecutar `npm run build` para validar la compilación.

## Estado
Solo navegación y estructura visual inicial; NO conectado a SharePoint ni Azure.
Los HTML de referencia originales se conservan en `referencias/`.

## Siguientes etapas
1. Migrar pantallas HTML a componentes React con datos de demostración claramente identificados.
2. Registrar aplicación SPA en Microsoft Entra ID, configurar MSAL y permisos Graph delegados mínimos.
3. Crear esquema de listas/bibliotecas SharePoint y servicios de datos.
4. Aplicar autorización real (no solo filtros visuales), flujos de validación y auditoría.
5. Publicar Azure Static Web Apps y configurar dominios/CI-CD.

## Seguridad
No poner secretos de cliente en variables VITE_ (son públicas en el navegador). No habilitar permisos amplios de Graph sin aprobación de TI. La seguridad de escritura entre dependencias requiere diseño específico; los filtros de UI no son barreras de autorización.
