# Contrato de integración tableros ↔ backend — Sistema Puntal Agro

> Documento complementario de `modelo_datos_permisos.md`.
> Define **cómo los tableros acceden a los datos y a los permisos** una vez migrados al backend, sin reescribir su lógica interna.
>
> **Audiencia:** la programadora del backend, y quien adapte los tableros HTML.
>
> **Estado:**
> - **Parte A (Contexto y permisos): FIRME.** Se apoya en §7 del modelo, que está cerrado. Se puede implementar y probar ya.
> - **Parte B (Acceso a datos): BORRADOR.** Depende de la estructura interna de los tableros, que todavía está en evolución. Los nombres de colección y los campos pueden ajustarse.

---

## 0. Idea general

Hoy cada tablero guarda y lee de `localStorage` directamente. El objetivo es interponer una **capa de acceso** (un objeto global, p. ej. `PA`) entre el tablero y los datos, de modo que:

- El tablero **no sabe** si los datos vienen del backend o de `localStorage`: llama siempre a las mismas funciones.
- En **modo backend**, la capa va al servidor (con sesión y permisos reales).
- En **modo demo/fallback**, la capa cae a `localStorage` (para desarrollar sin backend, igual que hoy).

Esto permite migrar los tableros uno por uno, cambiando solo *cómo leen/escriben*, no *qué hacen*.

### Restricciones técnicas (heredadas del proyecto)

- **ES5 estricto:** `var` / `function`, sin `let`/`const`, sin arrow functions, sin `async`/`await`, sin promesas. Frameworks: ninguno.
- **Asíncrono con callbacks:** toda función de acceso a datos recibe un callback `function(err, data)` como último argumento. `err` es `null` si todo salió bien; si hay error, `err` es un objeto/string y `data` es indefinido.
- **Un solo archivo por tablero:** la capa de acceso se incluye como un bloque de script compartido (o un `.js` común) que todos los tableros cargan.

---

# PARTE A — Contexto y permisos (FIRME)

Esta parte se apoya en §7 del modelo de datos (usuarios, roles, permisos) y no depende de la estructura interna de los tableros. Es lo que la programadora puede implementar y probar de inmediato.

## A.1 El objeto de contexto (CTX)

Al cargar, el tablero pide el **contexto del usuario para la empresa activa**. El backend lo arma a partir de la sesión y los permisos del usuario.

```js
// Estructura del contexto que devuelve loadContext
{
  usuario: {
    id: "usr_maria",
    nombre: "María Pereyra",
    email: "maria@albor.com.ar",
    rol: "admin_cliente"        // admin_general | admin_cliente | usuario
  },
  clienteId: "cli_albor",       // null si es admin_general multicliente
  empresaActivaId: "emp_albor_sa",
  empresasDisponibles: [        // empresas a las que el usuario tiene algún permiso
    { id: "emp_albor_sa", razonSocial: "Albor Agropecuaria S.A." },
    { id: "emp_lospinos", razonSocial: "Los Pinos S.R.L." }
  ],
  // Permiso del usuario PARA LA EMPRESA ACTIVA (ver §7.2 del modelo)
  permiso: {
    empresaId: "emp_albor_sa",
    campoIds: [],               // [] = todos los campos de la empresa
    herramientas: ["tablero_agro","tablero_insumos_ot","tablero_uso_suelo"],
    nivel: "administrar"        // ver | cargar | administrar
  }
}
```

> El contexto es **por empresa activa**. Si el usuario cambia de empresa (selector de cabecera), el tablero vuelve a pedir `loadContext` para la nueva empresa, porque `campoIds`, `herramientas` y `nivel` pueden ser distintos en cada una.

## A.2 loadContext

```js
// Pide el contexto del usuario para una empresa.
// empresaId opcional: si se omite, usa la última empresa activa / la primera disponible.
PA.loadContext(empresaId, function(err, ctx) {
  if (err) { /* mostrar error / pantalla de login */ return; }
  // ctx tiene la forma de A.1
  // El tablero guarda ctx y lo usa para todo lo demás.
});
```

## A.3 can — chequeo de permisos

`can` responde, de forma **síncrona** (ya tiene el ctx en memoria), si el usuario puede hacer una acción. Es lo que usan los tableros para mostrar/ocultar botones y bloquear operaciones.

```js
// PA.can(accion, opts) -> true/false
// accion: 'ver' | 'cargar' | 'administrar'
// opts (opcional): { herramienta: 'tablero_uso_suelo', campoId: 'campo_x' }

if (PA.can('cargar')) { /* mostrar botón "Agregar" */ }
if (PA.can('administrar', { herramienta: 'tablero_insumos_ot' })) { /* mostrar "Borrar" */ }
if (PA.can('ver', { campoId: 'campo_elpuntal' })) { /* mostrar ese campo */ }
```

Reglas que aplica `can` (según §7 del modelo):

- **nivel:** `ver` < `cargar` < `administrar`. `can('cargar')` es true si el nivel es `cargar` o `administrar`.
- **herramienta:** si se pasa `opts.herramienta`, debe estar en `ctx.permiso.herramientas`.
- **campo:** si se pasa `opts.campoId`, debe estar en `ctx.permiso.campoIds` (o `campoIds` estar vacío = todos).
- `can` resuelve solo contra el `ctx` en memoria. **No es seguridad real:** solo controla la interfaz. La seguridad efectiva la aplica el backend (ver A.5).

## A.4 Recordatorio de los niveles (de §7.2 del modelo)

| Nivel | Puede |
|---|---|
| `ver` | Solo lectura. No carga, no edita, no borra. No toca maestros. |
| `cargar` | Agregar/editar registros operativos **y** maestros de la empresa. No borra masivo. |
| `administrar` | Todo lo de `cargar` + borrar + configuración de la empresa. |

> El alta de clientes/empresas/campos y los datos globales (TC, IPC, tarifas base, campañas) son atribución de los **roles administrativos** (admin_general / admin_cliente), no del nivel del permiso.

## A.5 Nota de seguridad (responsabilidad del backend)

`can` y el ocultamiento de botones son **conveniencia de interfaz**, no seguridad. El backend **debe** validar en cada request que el usuario tenga permiso sobre la empresa/campo/herramienta/nivel involucrados, y **negar** datos fuera de su alcance, sin confiar en lo que envíe el cliente.

---

# PARTE B — Acceso a datos (BORRADOR)

> **Sujeto a cambios.** Los nombres de colección y la forma de los registros dependen de la estructura interna de los tableros, que todavía se está estabilizando (p. ej. actividades en uso_suelo). Tomar como orientativo, no definitivo.

## B.1 Colecciones

Cada tablero trabaja con un conjunto de **colecciones** (listas de registros). Los nombres provienen de la estructura actual de los tableros y se alinean con las entidades del modelo de datos. Ejemplos observados en `tablero_insumos_ot`:

| Colección | Entidad del modelo | Ámbito |
|---|---|---|
| `insumos` | INSUMO | empresa |
| `depositos` | DEPÓSITO | empresa |
| `tiposActividad` | TIPO_ACTIVIDAD | empresa |
| `contratistas` | CONTRATISTA | empresa |
| `laboresLP` / `laboresLC` | LABOR | empresa |
| `proveedores` | PROVEEDOR | empresa |
| `compradores` | COMPRADOR | empresa |
| `campos` | CAMPO | empresa |
| `lotes` | LOTE | empresa |
| `actividades` | ACTIVIDAD (uso del suelo) | empresa + campaña |
| `ots` | ORDEN DE TRABAJO | empresa + campaña |
| `movtos` | MOVIMIENTO | empresa + campaña |
| `tiposMov` | TIPO_MOVIMIENTO | empresa (o global, a definir) |

> **Pendiente de modelo:** `tiposMov` en el tablero tiene estructura `{nombre, signo, requiereOrigen, requiereDestino}` y valores extra (Consumo OT, Baja por aplicación OT, Venta) que aún no están reflejados en §3.2.2 del modelo. Se reconciliará al estabilizar la estructura.

## B.2 loadData

```js
// PA.loadData(coleccion, filtro, function(err, registros) { ... })
// coleccion: nombre de la colección (ver B.1)
// filtro: objeto opcional. La empresa activa se aplica SIEMPRE de forma implícita
//         (desde el ctx); no hace falta pasarla. Otros filtros: { campañaId, campoId, ... }

PA.loadData('insumos', null, function(err, insumos) {
  if (err) { /* manejar */ return; }
  // insumos = array de registros de la empresa activa
});

PA.loadData('ots', { campañaId: 'camp_2425' }, function(err, ots) {
  if (err) { return; }
  // ots de la empresa activa y esa campaña
});
```

Reglas:

- La **empresa activa** del `ctx` se inyecta siempre como filtro implícito. El tablero nunca pide datos de otra empresa.
- El backend **además** filtra por los `campoIds` del permiso: si el usuario solo ve ciertos campos, `loadData` devuelve solo registros de esos campos (para las colecciones que tienen `campoId`).
- En modo demo, el filtro se aplica sobre el `localStorage` local.

## B.3 saveData

```js
// PA.saveData(coleccion, registro, function(err, guardado) { ... })
// - Si registro.id existe -> actualiza; si no -> crea (el backend asigna id).
// - guardado = el registro tal como quedó persistido (con id).

PA.saveData('insumos', nuevoInsumo, function(err, guardado) {
  if (err) { /* p. ej. permiso insuficiente, o validación */ return; }
  // guardado.id disponible
});
```

```js
// Borrado:
PA.deleteData('insumos', id, function(err) { ... });
```

Reglas:

- Antes de llamar, el tablero debería chequear `PA.can('cargar')` (o `'administrar'` para borrar) para la interfaz. El backend lo revalida.
- `saveData` agrega `empresaId` (y `campoId`/`campañaId` según corresponda) desde el contexto si el registro no los trae.
- Operaciones que disparan otras (p. ej. confirmar la aplicación de una OT genera movimientos de `Consumo`, ver §3.8 del modelo) las resuelve el **backend** como transacción; el tablero hace una sola llamada.

## B.4 Modo demo / fallback a localStorage

```js
// Al inicializar, la capa decide el modo:
PA.init({
  modo: 'auto',              // 'backend' | 'demo' | 'auto'
  backendUrl: '...'          // si está y responde -> backend; si no -> demo
}, function(err) {
  // listo para usar loadContext/loadData/...
});
```

- **modo 'demo'** (o backend caído en 'auto'): `loadContext` devuelve un usuario ficticio con nivel `administrar` y todas las herramientas; `loadData`/`saveData` operan sobre `localStorage` con la misma estructura que hoy. Permite desarrollar y mostrar el tablero sin backend.
- **modo 'backend':** todo va al servidor con la sesión real.
- El **código del tablero es el mismo** en ambos modos: solo cambia qué hace la capa por dentro.

> En modo demo, los permisos no restringen nada (todo habilitado), porque el objetivo es desarrollo local. La restricción real solo existe con backend.

## B.5 Resumen de la API

| Función | Parte | Firma |
|---|---|---|
| `PA.init` | B | `(opts, cb)` |
| `PA.loadContext` | **A** | `(empresaId, cb)` |
| `PA.can` | **A** | `(accion, opts) -> bool` (síncrona) |
| `PA.loadData` | B | `(coleccion, filtro, cb)` |
| `PA.saveData` | B | `(coleccion, registro, cb)` |
| `PA.deleteData` | B | `(coleccion, id, cb)` |

Todos los `cb` son `function(err, data)`, salvo `can` que es síncrona.

---

## Fuera de alcance de este contrato

- Implementación del backend (motor, endpoints, auth real): responsabilidad de la programadora.
- Esquema físico de la base de datos.
- Estructura interna definitiva de cada tablero (en evolución; ver Parte B).
- Lógica de negocio que el backend resuelve como transacción (cálculo de stock, derivación del estado de OT, etc.): se especifica junto con la estructura final de cada tablero.

---

*Documento complementario — Puntal Agro. Contrato de integración tableros ↔ backend.*
