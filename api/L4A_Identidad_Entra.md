# F2 / L4-A — Biblioteca de validación Microsoft Entra ID

Base verificada: `d68cca8`, rama `feature/arquitectura-persistencia-pai`, árbol inicial limpio.
Se revisaron README, los modelos L2/L3, tipos, scripts, pruebas y MSAL. No se encontraron
contradicciones que requirieran modificar contratos L2. No se cambió persistencia L3.

## Alcance implementado

Biblioteca backend independiente para tokens de acceso **delegados v2.0**. No se registra
ninguna función HTTP nueva ni se conecta el componente a `/api/poc/health`, que conserva
su comportamiento anónimo de diagnóstico. No hay autorización por ficha, consultas a
repositorios, login, creación de cuentas o emisión de tokens en código de ejecución.

| Archivo | Responsabilidad |
|---|---|
| application/ports/identity.ts | Contrato IdentityValidator e identidad normalizada, independientes de JOSE/HTTP |
| infrastructure/identity/config.ts | Configuración explícita, validación fail-closed y endpoints permitidos |
| infrastructure/identity/bearer.ts | Extracción estricta de un solo Bearer |
| infrastructure/identity/keys.ts | Descubrimiento OIDC y JWKS confiables, transporte acotado, caché y rotación |
| infrastructure/identity/validator.ts | Verificación criptográfica y coordinación del flujo |
| infrastructure/identity/normalize.ts | Claims ya verificados a identidad inmutable |
| infrastructure/identity/errors.ts | Errores controlados sin secretos ni transporte HTTP |

Se añadió `jose@6.2.12`, fijada en package.json y lockfile de api. Ofrece jwtVerify,
decodeProtectedHeader y createLocalJWKSet; la selección/importación de claves y la
criptografía son de esa biblioteca, no una implementación JWT manual. Es ESM y se
verificó con Node 24.22.0 y la compilación NodeNext. No se actualizaron otras versiones.

## Configuración requerida

No hay valores institucionales por defecto, archivo con credenciales ni lectura automática
del entorno. El código confiable que componga la biblioteca en una etapa futura deberá
proporcionar todos los parámetros de IdentityConfiguration:

| Parámetro | Política implementada |
|---|---|
| tenantId | GUID no nulo; se normaliza a minúsculas |
| audience | GUID no nulo del registro **de API**, no de la SPA; se rechaza el ID conocido de Graph |
| requiredScope | Un solo nombre de scope OAuth, sensible a mayúsculas; no openid/profile/email/offline_access |
| metadataUrl | Exactamente https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration |
| jwksUrl | Exactamente https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys |
| tokenVersion | Exclusivamente 2.0 |
| clockToleranceSeconds | Entero obligatorio entre 0 y 60; no hay margen ilimitado |

El emisor se deriva como `https://login.microsoftonline.com/{tenantId}/v2.0`. La configuración
se valida y copia antes de usarla. No admite common/organizations, HTTP, credenciales en
URL, consultas, fragmentos ni hosts alternativos. No hace peticiones al construir el
validador; la primera resolución de clave carga metadatos y JWKS cuando se valida un token.

En v2.0, aud debe ser exactamente el GUID de API configurado: se rechazan URI de recurso,
listas de audiencias y cualquier otro destinatario. El scope configurado corresponde al
nombre que debe figurar en scp, no al URI completo usado por MSAL al solicitarlo.

Se soporta únicamente Azure público con esos endpoints tenant-specific. Cualquier variante
de nube, claves personalizadas o URL de descubrimiento requiere revisión explícita; no
se flexibilizan las URLs utilizando claims recibidos del cliente.

## Flujo de validación

1. Aceptar un único valor Authorization de tipo string. Rechazar arrays, ausencia, valores
   fusionados con comas, controles, espacios ambiguos o tamaños superiores a 32 KiB.
   El esquema Bearer es insensible a mayúsculas; el contenido compacto tiene tres segmentos
   base64url no vacíos. No se lee X-User, X-Oid ni un header equivalente.
2. Decodificar solo el protected header para comprobar RS256 y kid no vacío/acotado. No
   considerar identidad ningún claim todavía. Rechazar jku/x5u/jwk/x5c embebidos y algoritmos
   alternativos. El kid selecciona una clave; nunca se interpreta como URL.
3. Resolver la clave exclusivamente con el proveedor confiable configurado. Exigir clave
   pública RSA de al menos 2048 bits y algoritmo/hash apropiados para RS256.
4. Ejecutar jose.jwtVerify con algoritmo permitido, issuer, audience, reloj inyectado y
   tolerancia configurada. Solo después de validar firma y claims se normaliza la identidad.
5. Exigir ver=2.0, tid exacto, oid y azp GUID no nulos, exp/nbf enteros seguros y nbf<exp.
   El scp debe ser texto con scopes separados por espacios y contener el requerido exactamente.
   idtyp=app se rechaza incluso si un token contiene scp. Roles por sí solos no dan acceso.

También se rechazan JWT sin firma, none, vencidos, aún no válidos, alterados, de otro tenant,
para Graph o para la SPA. No se intenta un modo alternativo de autenticación si fallan.
La distinción ID token/access token no se basa solo en typ=JWT: depende de audiencia,
scope delegado y las demás validaciones. Solo JWT sin typ o con typ=JWT está soportado.

## Identidad autenticada

AuthenticatedIdentity contiene tenantId, objectId, subjectKey=`tid:oid`, clientId procedente
de azp, issuer, audience, scopes y expiresAt. Se reutilizan las marcas TenantId y
DirectoryObjectId de L2 sin modificar sus definiciones. oid y clientId se normalizan a
minúsculas; los scopes se deduplican/ordenan y el resultado y su array están congelados.

No se devuelve el JWT, la clave, correo, preferred_username, upn ni roles. No se fabrica
un UserId persistido. Resolver ese par tid/oid contra usuarios de PAI, comprobar habilitación
y autorizar fichas será trabajo posterior. Un scope OAuth no es una Capability de negocio.
azp se valida estructuralmente; no se inventó una lista institucional de clientes permitidos.

## Descubrimiento y claves

El proveedor descarga solo las dos URLs configuradas. Antes de consultar JWKS comprueba
que el documento OIDC declare exactamente issuer y jwks_uri esperados. El transporte usa
redirect:error, credentials:omit, sin Authorization, timeout de 5 segundos por descarga,
contenido JSON y un máximo de 1 MiB por respuesta. No usa URLs del token para descubrir claves.

Se admiten hasta 100 claves por respuesta y se seleccionan RSA de firma/RS256. Se rechazan
material privado, referencias remotas de clave y emisores por clave incompatibles. Si una
clave publica issuer, debe coincidir con el emisor concreto o con la plantilla oficial
`https://login.microsoftonline.com/{tenantid}/v2.0`; el tid del token igualmente debe coincidir
con el configurado. JOSE exige una selección única: claves ambiguas no se aceptan.

SigningKeyProvider permite sustitución mediante código confiable, sin modo mock por entorno.
Las pruebas inyectan transporte local al proveedor, no identidades autenticadas prefabricadas.
La inyección nunca se configura mediante parámetros de petición, JWT o headers. Las funciones
auxiliares son internas a este diseño; normalizeIdentity no es un verificador de payloads.

## Caché y rotación

- Caché de metadatos/JWKS en memoria por instancia, por defecto 10 minutos. No hay claves
  fijas ni selección de la primera clave como regla de confianza.
- Una descarga en curso se comparte entre solicitudes concurrentes.
- Un kid desconocido provoca una actualización si pasó el cooldown de 30 segundos. Dentro
  del cooldown se rechaza sin otra descarga; la rotación puede tardar ese margen en aceptarse.
- Al actualizar se reemplaza el conjunto: claves retiradas dejan de estar disponibles en
  la nueva caché. Las claves importadas se resuelven por kid mediante createLocalJWKSet.
- La expiración se evalúa al recibir una solicitud, sin jobs ni timers de mantenimiento.
  TTL/cooldown se pueden inyectar técnicamente dentro de límites comprobados.
- Una caché caducada y una descarga fallida producen rechazo; no hay uso indefinido de
  claves antiguas. Una caché aún vigente puede seguir atendiendo claves conocidas hasta
  su vencimiento. Esto no equivale a revocación inmediata de claves o sesiones.

Es una política local deliberadamente fail-closed. No implementa todo el algoritmo de
resiliencia/caché de los SDK Microsoft ni promete disponibilidad productiva durante una
caída de Entra. La política operativa definitiva, supervisión y recuperación requieren
revisión antes de integrar. No hay fallback de identidad simulada en ninguna situación.

## Errores

IdentityConfigurationError indica configuración incompleta/no admitida. AuthenticationError
expone solo un código estable: INVALID_AUTHORIZATION, INVALID_TOKEN, INVALID_CLAIMS,
TOKEN_EXPIRED, TOKEN_NOT_ACTIVE, UNKNOWN_KEY o KEYS_UNAVAILABLE.

Los mensajes son genéricos, sin JWT, claim recibido, datos de claves, cuerpo de respuesta,
causa externa ni credenciales. No hay logging de tokens. No se asignan códigos HTTP todavía.
Un fallo de clave, transporte, firma, tiempo o claims nunca produce identidad de reemplazo.

## Implementado, pruebas y pendiente institucional

**Implementado:** validación criptográfica, configuración estricta, descubrimiento OIDC/JWKS,
caché, rotación y normalización. El proveedor real no se ha ejecutado contra Entra durante
las pruebas, y ningún endpoint utiliza aún esta biblioteca.

**Pruebas locales:** claves RSA/EC efímeras generadas en memoria y tokens sintéticos firmados
durante la ejecución. No hay claves privadas serializadas ni JWT reales guardados. Fetch
global está bloqueado en la suite de identidad; un transporte inyectado devuelve respuestas
OIDC/JWKS exclusivamente locales. Los GUID usados son ficticios y no son configuración del tenant.

Resultados: API compila; contratos y límites correctos; 94 pruebas aprobadas, 0 fallidas,
incluidas L1-L3. Se cubren todos los rechazos requeridos, tolerancia de reloj, caracteres
de control, no filtración de tokens, origen de claves, caché concurrente, rotación,
cooldown y fallo/recuperación sin claves caducadas. El frontend compila sin cambios; mantiene
la advertencia previa de bundle >500 kB. No se arrancan Functions/Azurite para L4-A.

**Pendiente, sin ejecutar y sujeto a autorización:**

1. Registrar una API propia y confirmar tenant y client ID de ese recurso, separados de la SPA.
2. Configurar el recurso para access tokens v2 (`api.requestedAccessTokenVersion=2`). Usar
   un endpoint de login v2 no garantiza por sí solo que el access token sea de esa versión.
3. Definir/exponer el scope delegado y aprobar clientes, consentimiento y políticas de acceso.
4. Configurar y verificar los metadatos reales sin relajar las restricciones del componente.
5. Ampliar MSAL para adquirir un access token dirigido a la API, mediante otra etapa autorizada.
   Hoy continúa solicitando solo openid/profile; no se cambió su configuración.
6. Integrar el validador en rutas aprobadas y separar autenticación de autorización por ficha.
7. Realizar pruebas reales de tenant, rotación y operación; revisar disponibilidad, revocación,
   cuentas deshabilitadas, guests y clientes admitidos. No se implementó introspección/CAE.

No se solicita client secret para verificar JWT: solo claves públicas. No se registraron
aplicaciones, solicitaron permisos, crearon recursos ni realizaron despliegues o commits.

## Fuentes técnicas

- [Microsoft: validación de claims](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation).
- [Microsoft: claims de access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference).
- [Microsoft: rotación de claves](https://learn.microsoft.com/en-us/entra/identity-platform/signing-key-rollover).
- [Microsoft: versión de access token del recurso API](https://learn.microsoft.com/en-us/graph/api/resources/apiapplication?view=graph-rest-1.0).
- [jose: biblioteca mantenida y documentación](https://github.com/panva/jose).

Las restricciones y límites de esta PoC son decisiones técnicas locales; no se presentan
como aprobación institucional o sustituto de una revisión de seguridad para producción.
