# Modelo de datos y permisos — Sistema Puntal Agro

> Documento de especificación para la **migración a backend** de los tableros Puntal Agro.
> Define la jerarquía de entidades, dónde vive cada dato, el modelo de usuarios y la matriz de permisos.
>
> **Audiencia:** la programadora que construirá la base de datos y la API. Este documento describe el **modelo lógico** (entidades, relaciones, reglas de negocio). No prescribe motor de base de datos, esquema físico ni tecnología de backend; eso queda a criterio de la implementación.
>
> **Estado:** **VERSIÓN EN REVISIÓN.** La parte de **usuarios, roles y permisos** (§7) y la **jerarquía** (§1–§2) están firmes y se pueden implementar/probar ya. Las **entidades de negocio** (§3–§4) son borrador avanzado: pueden ajustarse a medida que se estabiliza la estructura de datos de los tableros.
>
> **Actualización (uso del suelo ya implementado):** la entidad **ACTIVIDAD** (§3.5) y su modelo de N filas por lote/campaña **ya está implementado** en `tablero_uso_suelo`, junto con el maestro **TIPO_ACTIVIDAD** (§3.5.1) y la entidad global **ESPECIE** (§3.5.2). El modelo de esas secciones refleja lo realmente construido y se puede tomar como base sólida. Lo que sigue siendo borrador son las entidades de los tableros aún no migrados (OT/movimientos a fondo, Hacienda, Siembra).

---

## 0. Resumen ejecutivo

El sistema es **multi-cliente** (multi-tenant). Puntal Agro administra a varios clientes; cada cliente tiene una o más empresas; cada empresa tiene campos y lotes, y sobre ellos se cargan los datos operativos (insumos, labores, órdenes de trabajo, planificación).

Hoy cada tablero funciona de forma aislada guardando datos en `localStorage` del navegador. El objetivo es reemplazar esa memoria local por una base de datos central con autenticación y permisos, **sin reescribir la lógica de cada tablero** (ver documento aparte `contrato_contexto.md`).

Tres ideas estructurales:

1. **Jerarquía de 4 niveles:** Cliente → Empresa → Campo → Lote.
2. **Catálogo único por empresa, gestionado en un módulo de Maestros:** insumos, terceros (proveedores y clientes), choferes y labores se cargan una sola vez en un módulo de Maestros a nivel empresa, y los consumen todos los tableros (elimina la carga duplicada actual, en que insumos_ot y Fitosanitarios mantenían catálogos de insumos separados).
3. **Permisos de 3 ejes por empresa:** cada usuario tiene, para cada empresa a la que accede, un conjunto de (campos visibles + herramientas habilitadas + nivel de acción).

---

## 1. Jerarquía de entidades

```
CLIENTE                      (tenant raíz — lo administra Puntal)
  └── EMPRESA                (razón social / unidad fiscal-contable)
        └── CAMPO            (establecimiento; pertenece a UNA sola empresa)
              └── LOTE       (unidad física de superficie)
```

Reglas de la jerarquía:

- Un **campo pertenece a una sola empresa** (no hay campos compartidos entre empresas).
- Los datos de negocio (insumos, terceros, choferes, labores, OTs, lotes, actividades) cuelgan a **nivel Empresa**, no de Cliente. La campaña es global de Puntal (§4.1). Cada empresa es su propia unidad contable.
- El **Cliente** es principalmente el contenedor administrativo y de permisos (y el sujeto de facturación del servicio Puntal).
- El selector principal en el encabezado de cada tablero es la **Empresa**; dentro de ella se filtra por campo/lote.

---

## 2. Entidades de la jerarquía

Convención: `id` = identificador único estable (string). `parentId` = referencia al padre. Campos marcados *(opcional)* pueden quedar vacíos.

### 2.1 CLIENTE

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `nombre` | string | Nombre comercial / de fantasía del cliente |
| `email` | string | Contacto principal |
| `telefono` | string | Contacto principal |
| `nombreContacto` | string | Persona de contacto |
| `activo` | bool | Baja lógica |
| `fechaAlta` | fecha | |
| **Facturación del servicio** | | *Cobro de Puntal al cliente. Uso administrativo, no operativo.* |
| `cuit` | string | *(opcional)* |
| `razonSocial` | string | *(opcional)* |
| `direccion` | string | *(opcional)* |
| `facturaCentralizada` | bool | `true` = se factura todo al cliente con los datos de arriba. `false` = factura cada empresa con sus propios datos fiscales |

### 2.2 EMPRESA

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `clienteId` | string | FK → Cliente |
| `razonSocial` | string | |
| `cuit` | string | |
| `direccion` | string | *(opcional)* |
| `condicionIVA` | string | *(opcional)* — solo si se usa en facturación del servicio |
| `activo` | bool | |

> Nota de facturación: si `Cliente.facturaCentralizada = false`, se usan los datos fiscales de cada empresa. Esta facturación es la del **cobro del servicio Puntal Agro**, no facturación operativa de las empresas hacia terceros.

### 2.3 CAMPO / ESTABLECIMIENTO

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `empresaId` | string | FK → Empresa |
| `nombre` | string | |
| `localidad` | string | *(opcional)* |
| `partido` | string | *(opcional)* |
| `provincia` | string | *(opcional)* |
| `haTotales` | número | *(opcional)* — superficie total del establecimiento |

### 2.4 LOTE

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `campoId` | string | FK → Campo |
| `empresaId` | string | FK → Empresa (denormalizado desde el campo, para filtrar/validar permisos directo) |
| `nombre` | string | |
| `ha` | número | Superficie física del lote |

> El lote es la unidad física. La asignación de cultivo/campaña a un lote (la "actividad" de uso del suelo) se modela aparte — ver §3.5.
>
> **Regla de denormalización:** toda entidad que cuelga de un campo (lote, depósito) lleva además `empresaId`, aunque sea deducible vía campo. El filtro por empresa es el eje de todos los tableros y de los permisos, así que tenerlo a mano evita resolver la cadena campo→empresa en cada consulta. El costo (actualizar si un campo cambiara de empresa) es despreciable porque ese evento es prácticamente inexistente.

---

## 3. Entidades de negocio (nivel Empresa)

La mayoría cuelga de `empresaId` y se carga **una sola vez por empresa**; las consumen todos los tableros. (La excepción es TIPO_INSUMO, §3.1.1, que es una lista **global** de Puntal y se incluye aquí por estar junto al insumo que la usa.)

Los catálogos compartidos — **insumos, depósitos, terceros (proveedores y clientes), choferes, labores y tipos de actividad (cultivos/usos)** — se dan de alta en un **módulo de Maestros** a nivel empresa, independiente de los tableros operativos. Los tableros (Insumos/OT, Fitosanitarios, Labores, etc.) solo los **consumen**; no los crean. Esto evita que la posibilidad de dar de alta un dato compartido dependa de tener acceso a un tablero operativo en particular. (La asignación de cultivos a lotes —ACTIVIDAD, §3.5— y la propia CAMPAÑA no son maestros de empresa: ver §3.5, §4.1 y §8.)

### 3.1 INSUMO (catálogo unificado)

Reemplaza los dos catálogos hoy separados (el de Registro de Labores e Insumos y el de Fitosanitarios). Es **un solo insumo** con un bloque técnico opcional que solo se completa en agroquímicos (cuando se carga `claseFito`).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `empresaId` | string | FK → Empresa |
| `nombre` | string | |
| `tipo` | string | FK → TIPO_INSUMO (lista global de Puntal — ver §3.1.1). Clasificación general del insumo |
| `categoria` | string | Categoría libre/administrativa *(opcional)* |
| `unidad` | string | Lista sugerida — ver §6.1 |
| `precioUnitario` | número | |
| `moneda` | enum | `ARS` / `USD` |
| **Técnicos (opcionales, solo agroquímicos)** | | Se completan solo si `claseFito` está cargada |
| `claseFito` | enum | *(opcional)* — `Herbicida` / `Insecticida` / `Fungicida`. **Dispara el bloque técnico y la lista de modo de acción.** Independiente de `tipo` |
| `principioActivo` | string | Texto libre **con lista de sugerencias** (autocompletado contra valores ya cargados) |
| `concentracionValor` | número | *(opcional)* |
| `concentracionUnidad` | string | *(opcional)* — texto libre, ej. `% p/v`, `g/L` |
| `eiq` | número | *(opcional)* — Environmental Impact Quotient |
| `modoAccion` | string | *(opcional)* — sigla; lista **dependiente de `claseFito`** — ver §6.2 |
| `banda` | enum | *(opcional)* — banda toxicológica — ver §6.3 |

> **`tipo` vs `claseFito`:** `tipo` es la clasificación general administrable (Herbicida, Fertilizante, Balanceados, Combustibles y Lubricantes, Otros…) que tiene **todo** insumo. `claseFito` es opcional y solo se carga en agroquímicos; es lo que activa los campos técnicos y la lista de modo de acción (HRAC/IRAC/FRAC). Un Balanceado tiene `tipo: "Balanceados"` y `claseFito` vacía → sin bloque técnico.

#### 3.1.1 TIPO_INSUMO (lista global)

Lista de clasificación general de insumos, **mantenida solo por el admin general** (Puntal). Los clientes no agregan tipos; eso evita que cada empresa fragmente la clasificación.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `nombre` | string | |

Valores iniciales: `Herbicida`, `Fungicida`, `Insecticida`, `Coadyuvante`, `Fertilizante`, `Curasemilla`, `Inoculante`, `Balanceados`, `Combustibles y Lubricantes`, `Otros`. Puntal puede agregar más sin tocar código.

### 3.2 STOCK / MOVIMIENTOS DE INSUMO

El stock no es un atributo del insumo: es el resultado de sus movimientos en cada depósito. Se modela como movimientos. El **depósito** es un maestro (se da de alta en el módulo de Maestros, ver §3.2.1); los **movimientos** son operativos (se generan en el tablero de Insumos/OT).

#### 3.2.1 DEPÓSITO (maestro)

Se da de alta en **Maestros** (nivel empresa). Puede estar asociado a un campo o ser un depósito general de la empresa.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `empresaId` | string | FK → Empresa (siempre) |
| `campoId` | string | FK → Campo *(opcional; vacío = depósito general de la empresa, no atado a un campo)* |
| `nombre` | string | |

#### 3.2.2 MOVIMIENTO (operativo)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `empresaId` | string | FK → Empresa |
| `insumoId` | string | FK → Insumo |
| `fecha` | fecha | |
| `tipo` | string | FK → TIPO_MOVIMIENTO (lista administrable — ver abajo) |
| `cantidad` | número | |
| `origenDepositoId` | string | *(según tipo)* FK → Depósito |
| `destinoDepositoId` | string | *(según tipo)* FK → Depósito |
| `comprobanteTipo` | string | *(opcional)* |
| `comprobanteNro` | string | *(opcional)* |
| `otId` | string | *(opcional)* — FK → OT si el movimiento proviene de la aplicación de una orden |
| `obs` | string | *(opcional)* |

**TIPO_MOVIMIENTO** — lista administrable por Puntal. Valores iniciales: `Ajuste inventario (+)`, `Ajuste inventario (−)`, `Compra`, `Traslado`, `Consumo`, `Devolución a depósito`, `Ingreso por propia producción`, `Baja por vencimiento`, `Baja por rotura de envase`. Puntal puede agregar más.

> El signo sobre el stock (suma o resta) y qué depósitos usa (origen, destino o ambos en Traslado) se derivan del tipo de movimiento. El `Consumo` se genera automáticamente al **confirmar la aplicación** de una OT en un lote (ver §3.6), no al emitir la OT.

### 3.3 TERCERO (Proveedores y Clientes)

Catálogo unificado de las personas/empresas con las que opera la empresa. **Reemplaza las entidades antes separadas** Proveedor, Comprador y Contratista: como en la práctica el mismo tercero suele cumplir varios roles (el que vende gasoil también hace el flete; el contratista que siembra también compra grano), se carga **una sola vez** y se le marcan los roles que cumple.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `empresaId` | string | FK → Empresa |
| `nombre` | string | Nombre / razón social |
| `cuit` | string | *(opcional)* |
| `telefono` | string | *(opcional)* |
| `email` | string | *(opcional)* |
| `direccion` | string | *(opcional)* |
| `esProveedor` | bool | Le provee algo a la empresa |
| `esCliente` | bool | Le compra a la empresa (cliente comercial) |
| `tiposProveedor` | array | Solo si `esProveedor`. Valores de TIPO_PROVEEDOR (§3.3.1) |
| `activo` | bool | Baja lógica |

> Un tercero puede tener **ambos** roles (`esProveedor` y `esCliente`). El filtrado por rol se hace sobre estos campos: "los proveedores" = terceros con `esProveedor: true`; "los contratistas" = terceros con `esProveedor: true` y `'contratista'` en `tiposProveedor`.

> **`esCliente` vs CLIENTE (§2.1):** acá "cliente" es el cliente **comercial** de la empresa (a quién le vende). No confundir con CLIENTE (§2.1), que es el tenant administrado por Puntal.

> **Referencias desde otras entidades:** lo que antes apuntaba a `contratistaId`, `proveedorId` o `compradorId` ahora apunta a **`terceroId`** (un tercero que tenga el rol correspondiente). Ej.: la OT (§3.6) referencia un `terceroId` con `'contratista'` en `tiposProveedor`.

#### 3.3.1 TIPO_PROVEEDOR (lista administrable)

Subtipos de proveedor. Lista **administrable solo por el admin general (Puntal)**, los clientes no la editan.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `nombre` | string | |

Valores iniciales: `transportista`, `contratista`, `prestador de servicios`, `insumos`. Puntal puede agregar más.

#### 3.3.2 CHOFER

Persona que maneja para un tercero con tipo `transportista`. Cuelga del tercero transportista.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `empresaId` | string | FK → Empresa |
| `terceroId` | string | FK → Tercero (que tenga `'transportista'` en `tiposProveedor`) |
| `nombre` | string | |
| `dni` | string | *(opcional)* |
| `licencia` | string | *(opcional)* |
| `activo` | bool | |

### 3.4 LABOR

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `empresaId` | string | FK → Empresa |
| `tipo` | enum | `LP` (propia) / `LC` (contratada) — quién la ejecuta |
| `tipoLabor` | string | FK → TIPO_LABOR (§3.4.1) — qué clase de labor es |
| `nombre` | string | |
| `tarifaDefault` | número | $/ha; se autocompleta al emitir la OT (editable por OT). Solo aplica a LP |

> Dos clasificaciones independientes: `tipo` (LP/LC) indica **quién la hace**; `tipoLabor` indica **qué clase de labor es** (Siembra, Pulverización, etc.).

#### 3.4.1 TIPO_LABOR (lista administrable)

Lista **administrable solo por el admin general (Puntal)**, los clientes no la editan.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `nombre` | string | |

Valores iniciales: `Siembra`, `Pulv. Terrestre`, `Pulv. Aérea`, `Desmalezado`, `Corte-hilerado`, `Enrrollado`, `Embolsado`, `Extracción bolsa`, `Clasificación semillas`, `Elaboración ración`, `Distribución ración`, `Gerenciamiento`, `Fertilización líquida`, `Monitoreos`, `Acarreos`, `Labor Fardos`, `Disco-Rastra-Rolo`, `Fertilización voleo`, `Rolo triturador`. Puntal puede agregar más.

### 3.5 ACTIVIDAD (uso del suelo) — **IMPLEMENTADO**

Asignación de una actividad (cultivo o uso) a un lote en una campaña. Es una **lista de filas**: un lote en una campaña puede tener **N actividades** (no un cultivo "1º" y "2º" en posiciones fijas como en el modelo viejo, sino tantas filas como se le asignen). Cubre por igual las aperturas temporales (una actividad después de otra sobre las mismas hectáreas, ej. un cultivo de 1ª y luego uno de 2ª) y las espaciales (el lote partido en pedazos).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `empresaId` | string | FK → Empresa |
| `loteId` | string | FK → Lote |
| `campañaId` | string | FK → Campaña |
| `tipoActividadId` | string | FK → TIPO_ACTIVIDAD (§3.5.1). Identifica el cultivo/uso |
| `ha` | número | Hectáreas de esta actividad |
| `esSegunda` | bool | `true` = actividad de **2ª** (se siembra sobre superficie ya ocupada en el mismo ciclo). Default `false`. Ver regla de superficies |

> **Las dos superficies de un lote en una campaña** (cálculo derivado, no se almacena):
> - **Superficie física** = suma de las ha de las actividades **NO** de 2ª (`esSegunda = false`). Es la tierra efectivamente ocupada; no debería superar la superficie del lote.
> - **Superficie sembrada** = suma de **todas** las actividades (incluye las de 2ª). Puede superar la superficie del lote (un mismo pedazo se siembra dos veces en el ciclo: 1ª + 2ª).
>
> Ejemplo: lote de 45 ha con Trigo (1ª, 45 ha) + Soja 2ª (2ª, 45 ha) → física 45, sembrada 90.

> **Validación:** cada actividad se valida de forma **individual** contra la superficie física del lote (`ha` de la actividad ≤ superficie del lote). **No se suman** las actividades entre sí para validar. El flag `esSegunda` no cambia la validación individual; solo define en qué total (física / sembrada) entra la actividad.

> **Antecesor:** el "antecesor" de un lote en una campaña (lo que se muestra como cultivo previo) se deriva leyendo las actividades de la **campaña inmediata anterior** de ese lote, ordenadas por ha descendente. No es un campo almacenado.

> **Nota de implementación (estructura local actual del tablero):** mientras `tablero_uso_suelo` corre en modo demo (`localStorage`), guarda el plan embebido en el lote como `p: { "26-27": [ { c, ha, seg }, ... ], ... }`, donde la clave es el **nombre de campaña**, `c` es la **sigla** del tipo de actividad, `ha` el número y `seg` el booleano de 2ª. Al migrar al backend esto se **normaliza** en filas ACTIVIDAD: `c` (sigla) → `tipoActividadId` (resolviendo la sigla contra TIPO_ACTIVIDAD de la empresa), `seg` → `esSegunda`, y la clave de campaña → `campañaId`. La sigla es estable y única por empresa, así que el mapeo sigla→id es directo.

#### 3.5.1 TIPO_ACTIVIDAD (maestro) — **IMPLEMENTADO**

Lista de actividades posibles (cultivos y usos del suelo), maestro **a nivel empresa** (cada empresa gestiona la suya). Sigue el mismo patrón que TIPO_INSUMO → INSUMO: TIPO_ACTIVIDAD es el catálogo; ACTIVIDAD (§3.5) es la asignación concreta a un lote/campaña.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `empresaId` | string | FK → Empresa |
| `nombre` | string | |
| `sigla` | string | Abreviatura usada en planillas y en la UI (ej. `Tr`, `Sj1ª`, `MzT`). **Estable y única por empresa**; es la clave por la que el tablero referencia la actividad en modo demo |
| `actividad` | enum | *(opcional)* — `AGR` (agrícola) / `GAN` (ganadera) / vacío. Sirve para agrupar superficie por tipo de actividad y para sugerir el tipo del lote (agrícola/ganadero) |
| `especieId` | string | *(opcional)* — FK → ESPECIE (§3.5.2). La especie botánica detrás del cultivo (ej. `Soja 1ª` y `Soja 2ª` comparten la especie `Soja`). Vacío en usos que no son un grano (verdeos, praderas, campo natural) |
| `activo` | bool | Baja lógica |

Valores iniciales (lista por defecto, cultivos y usos del suelo, con sigla, clasificación y especie):
Trigo (Tr, AGR, Trigo), Cebada (Cb, AGR, Cebada), Avena (Av, AGR, Avena), Girasol (G, AGR, Girasol), Maíz (Mz, AGR, Maíz), Maíz Tardío (MzT, AGR, Maíz), Maíz 2ª (Mz2ª, AGR, Maíz), Maíz Silo PE (MzSPE, AGR, Maíz Planta Entera), Soja 1ª (Sj1ª, AGR, Soja), Soja 2ª (Sj2ª, AGR, Soja), Cultivo de cobertura (Ccob, AGR, —), Sorgo (Sg, AGR, Sorgo), Verdeo invierno (VI, GAN, —), Maíz pastoreo (MzP, GAN, —), Sorgo forrajero (SgF, GAN, —), Maíz pastoreo diferido (MzD, GAN, —), Sorgo pastoreo diferido (SgD, GAN, —), Promoción Rye Grass (PRG, GAN, —), Pradera impl. (PI, GAN, —), Pradera festuca (PPFe, GAN, —), Pradera alfalfa (PPAlf, GAN, —), Pradera agropiro (PPAg, GAN, —), Pradera degradada (PD, GAN, —), Campo natural (CN, GAN, —), Campo natural degradado (CND, GAN, —). Las columnas `actividad` y `especieId` son opcionales: un tipo puede quedar sin clasificar y/o sin especie.

#### 3.5.2 ESPECIE (lista global) — **IMPLEMENTADO**

Especies / granos. Lista **global de Puntal** (no por empresa), compartida con el Tablero Comercial y con el armado de cultivos. Permite que varios tipos de actividad agrícola (ej. `Soja 1ª` y `Soja 2ª`) compartan una misma especie a efectos de agregación comercial.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `nombre` | string | Ej. `Soja`, `Maíz`, `Trigo` |
| `sigla` | string | Ej. `Sj`, `Mz`, `Tr` |
| `activo` | bool | |

Valores iniciales: Soja (Sj), Maíz (Mz), Trigo (Tr), Sorgo (Sg), Girasol (G), Cebada (Cb), Avena (Av), Maíz Planta Entera (MzPE).

### 3.6 ORDEN DE TRABAJO (OT)

Una OT registra una labor sobre uno o varios lotes. Tiene tres niveles de estado: por lote (la aplicación real), global de la OT (derivado) y de facturación (eje aparte).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `empresaId` | string | FK → Empresa |
| `num` | número | Número de OT |
| `campañaId` | string | FK → Campaña — a qué campaña pertenece la OT |
| `fecha` | fecha | |
| `laborId` | string | FK → Labor |
| `subactividad` | string | |
| `terceroId` | string | *(opcional)* FK → Tercero con `'contratista'` en `tiposProveedor` (§3.3) |
| `tarifa` | número | $/ha aplicada (parte del default de la labor, editable) |
| `obs` | string | *(opcional)* |
| `estado` | enum | **DERIVADO, no se carga a mano:** `Pendiente` / `Parcial` / `Aplicada` / `Cancelada` (ver regla abajo) |
| `estadoFact` | enum | Facturación, eje independiente de la aplicación: `Sin facturar` / `Parcial` / `Facturado` |
| `plantilla[]` | array | Receta base de insumos: cada ítem `{ insumoId, dosisPorHa }` |
| `destinos[]` | array | Un destino por lote — ver DESTINO |

**DESTINO (línea de OT por lote)**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `loteId` | string | FK → Lote |
| `campoId` | string | FK → Campo (denormalizado desde el lote, para filtrar la OT por permiso — una OT puede tocar lotes de campos distintos) |
| `tipoActividadId` | string | FK → TIPO_ACTIVIDAD (§3.5.1) — cultivo/uso del lote |
| `subact` | string | |
| `ha` | número | |
| `estadoLote` | enum | `Pendiente` / `Aplicado` |
| `fechaAplicReal` | fecha | *(se completa al aplicar)* |
| `lineas[]` | array | Insumos efectivamente usados/devueltos en ese lote: `{ insumoId, usado, devuelto }` |

**Reglas:**

- Marcar un destino como **`Aplicado`** genera los MOVIMIENTOS de `Consumo` de stock de ese lote. La emisión de la OT (destinos en `Pendiente`) **no** descuenta stock.
- El **`estado` de la OT se deriva** de sus destinos: todos `Pendiente` → `Pendiente`; algunos `Aplicado` → `Parcial`; todos `Aplicado` → `Aplicada`. `Cancelada` es un estado manual aparte.
- `estadoFact` es independiente: una OT puede estar `Aplicada` pero todavía `Sin facturar`. La lógica fina de facturación se detalla con la operatoria del tablero.

---

## 4. Datos globales (nivel sistema, administrados por Puntal)

Estos datos **no pertenecen a ningún cliente**. Los carga el **admin general** (vía el flujo de actualización de Excel ya existente) y **todos los clientes los leen**.

| Entidad | Contenido | Fuente actual |
|---|---|---|
| `VARIABLES_ECONOMICAS` | IPC, tipos de cambio (Oficial BNA, MEP y Blue de Ámbito) | `BD_Hist_Evolucion_Variables.xlsx` |
| `TARIFA_CATAC` | Tarifa de fletes CATAC | `UTACATAC.xlsx` |
| `GASOIL` | Serie de precio de gasoil | `GAS_OIL_Agroseries.xlsx` |
| `TARIFA_LABOR_BASE` | Tarifas base de labores (referencia Puntal) | — |
| `PRECIOS_GRANOS` | Pizarra / disponible / futuros | (Tablero Comercial) |
| `CAMPAÑA` | Lista de campañas (`{id, nombre}`, ej. `24/25`) | — |
| `ESPECIE` | Lista de especies / granos (`{id, nombre, sigla}`) — ver §3.5.2 | — |

**Regla del dólar (transversal a todo el sistema):** el selector de dólar siempre ofrece las tres cotizaciones **Oficial / MEP / Blue**. Las series nativas en USD de los archivos (UTACATAC, Gasoil) **nunca** se usan como tipo de cambio.

### 4.1 CAMPAÑA (entidad global)

La campaña es una **lista desplegable mantenida por Puntal**, no una entidad de empresa. Es una **etiqueta de período** para clasificar a qué ciclo pertenece cada movimiento, labor, OT o actividad.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `nombre` | string | Ej. `24/25` |

> No tiene `empresaId` (es global) ni se deriva de fechas. La lógica de meses (meses < 7 → `(año-1)/año`; meses ≥ 7 → `año/(año+1)`) sigue usándose **internamente en el Tablero Comercial** para ubicar un dato en su campaña, pero la campaña como entidad es una etiqueta simple que carga Puntal.

### 4.2 Override de tarifa por empresa

Las tarifas de labores y CATAC son **globales pero ajustables por empresa**. Las tarifas base las mantiene Puntal; cada empresa puede ajustarlas.

| Entidad | Campo | Notas |
|---|---|---|
| `TARIFA_OVERRIDE` | `empresaId` | FK → Empresa |
| | `tarifaBaseId` | Referencia a la tarifa global ajustada |
| | `valor` | Valor que reemplaza al global para esa empresa |

Si una empresa no tiene override para una tarifa, usa el valor global.

---

## 5. Herramientas (tableros) como entidad

Las herramientas **no se hardcodean**: son datos que el admin general da de alta. Esto permite agregar tableros propios o externos sin tocar código, y que aparezcan automáticamente en el hub (`index`) y en la lista de permisos asignables.

### 5.1 HERRAMIENTA

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | Estable, ej. `tablero_agro` |
| `nombre` | string | Ej. "Tablero Comercial Agropecuario" |
| `descripcion` | string | Texto del "+ Detalle" del hub |
| `tipo` | enum | `propia` / `externa` |
| `url` | string | Interna (`tablero_agro.html`) o link externo (Simpleza, CREA, etc.) |
| `dominio` | string | Tag/categoría: Comercial, Operativo, Planificación, Ganadería, Contexto… |
| `activa` | bool | Si aparece o no en el hub |
| `asignable` | bool | `true` = se controla por permiso (típico de las propias). `false` = visible para todos (típico de las externas de referencia) |

### 5.2 Inventario inicial de herramientas propias

IDs estables a usar en el eje "herramientas" de los permisos:

| `id` | Nombre | Dominio |
|---|---|---|
| `tablero_agro` | Tablero Comercial Agropecuario | Comercial |
| `tablero_evolucion` | Evolución de Variables | Contexto |
| `tablero_insumos_ot` | Registro de Labores e Insumos | Operativo |
| `tablero_uso_suelo` | Plan de Uso del Suelo | Planificación |
| `ProgramaSiembra` | Programa de Siembra | Planificación |
| `tablero_hacienda` | Tablero de Relaciones Ganaderas | Ganadería |
| `tablero_labores` | Precio de Labores y Fletes | Operativo |
| `Fitosanitarios` | Fitosanitarios | Operativo |

Las externas (Simpleza, CREA, Ingeniería en Fertilizantes, Zorraquín + Meneses) se cargan con `tipo: externa`, `asignable: false` y la `url` correspondiente.

---

## 6. Listas cerradas (tomadas textualmente de Fitosanitarios)

Estas listas ya están en uso en el tablero Fitosanitarios y se reutilizan tal cual para mantener consistencia.

### 6.1 Unidades y clasificación

**Unidades sugeridas:** `Lt`, `Kg`, `g`, `cc`, `ml`, `u`, `tn`.

**Nota sobre el `tipo`:** la lista de tipos de insumo (Herbicida, Fertilizante, Balanceados, etc.) ya no es cerrada: es la entidad administrable **TIPO_INSUMO** (§3.1.1). La clasificación técnica que dispara los campos de agroquímico es **`claseFito`** (`Herbicida` / `Insecticida` / `Fungicida`), independiente del `tipo`.

### 6.2 Modo de acción (dependiente de `claseFito`)

El modo de acción disponible depende de la **`claseFito`** del insumo. Solo aplica a Herbicida / Insecticida / Fungicida. Cada entrada tiene una sigla (el valor guardado) y una descripción (lo que se muestra).

**Herbicida (clasificación HRAC):**

| Sigla | Descripción |
|---|---|
| ACCasa | Inhibidores de la acetil coenzima-A carboxilasa (ACCasa) |
| ALSSulf | Inhibidores de la enzima acetolactato sintetasa (ALS)-Sulfonilureas |
| ALSIMI | Inhibidores de la enzima acetolactato sintetasa (ALS)-Imidazolinonas |
| InhF2 | Inhibidores de la fotosíntesis en el fotosistema II |
| InhF1 | Inhibidores fotosistema I |
| PPO | Inhibidores de la enzima protoporfirinógeno oxidasa (PPO) |
| HPPD | Inhibidores de la biosíntesis de carotenoides (HPPD) |
| EPSPS | Inhibidores de la enzima 5-enolpiruvilshikimato-3-fosfato sintetasa (EPSPS) |
| IGS | Inhibidores de la glutamino sintetasa |
| DHPs | Inhibidores de la 7,8-dihidropteroato sintetasa (DHPs) |
| IDC | Inhibidores de la división celular |
| ISC | Inhibidores de la síntesis de celulosa |
| ISL | Inhibidores de la síntesis de lípidos |
| AuxSin | Acción similar al ácido indol acético (auxinas sintéticas) |
| ITA | Inhibidores del transporte de auxinas |
| H-MOAD | Modo de acción desconocido |

**Insecticida (clasificación IRAC):**

| Sigla | Descripción |
|---|---|
| 1 | Inhibidores de la acetilcolinesterasa |
| 2 | Antagonistas de canales de sodio |
| 3 | Moduladores del canal de sodio |
| 4 | Moduladores competitivos del receptor nicotínico de la acetilcolina |
| 5 | Moduladores alostéricos del receptor nicotínico de la acetilcolina |
| 6 | Moduladores alostéricos del canal de cloro dependiente del glutamato |
| 7 | Miméticos de la hormona juvenil |
| 8 | Diversos inhibidores no específicos (multi sitio) |
| 9 | Moduladores del canal TRPV de los órganos cordotonales |
| 10 | Inhibidores del crecimiento de ácaros |
| 11 | Disruptores microbianos de las membranas digestivas de insectos |
| 12 | Inhibidores de ATP sintetasa |
| 13 | Desacopladores de la fosforilación oxidativa vía interrupción del gradiente |
| 14 | Bloqueadores del canal del receptor de acetilcolina |
| 15 | Inhibidores de la biosíntesis de quitina, Tipo 0 |
| 16 | Inhibidores de la biosíntesis de quitina, Tipo 1 |
| 17 | Disruptores de la hormona de la muda. Dípteros |
| 18 | Agonistas del receptor de ecdisona |
| 19 | Antagonistas de los receptores de la octopamina |
| 20 | Inhibidores del transporte de electrones en el complejo mitocondrial III |
| 21 | Inhibidores del transporte de electrones en el complejo mitocondrial I |
| 22 | Bloqueadores del canal de sodio dependiente del voltaje |
| 23 | Inhibidores de la acetil CoA carboxilasa |
| 24 | Inhibidores del transporte de electrones en el complejo mitocondrial IV |
| 25 | Inhibidores del transporte de electrones en el complejo mitocondrial II |
| 28 | Moduladores del receptor de la rianodina |
| 29 | Moduladores de los órganos cordonales sin punto de acción definido |
| 30 | Antagonista canal clórico del receptor de ácido gamma-aminobutírico (GABA) |
| F-MOAD | Compuestos de modo de acción desconocido o incierto |

**Fungicida (clasificación FRAC):**

| Sigla | Descripción |
|---|---|
| A | Metabolismo de ácidos nucleicos |
| B | Citoesqueleto y proteínas motoras |
| C | Respiración |
| D | Síntesis de aminoácidos y proteínas |
| E | Señal de transducción |
| F | Síntesis o transporte de lípidos (función o integridad de la membrana) |
| G | Biosíntesis de esterol en las membranas |
| H | Biosíntesis de pared celular |
| I | Síntesis de melanina en la pared celular |
| M | Químicos con actividad multisitio |
| P | Inducción de la defensa de la planta huésped |
| BM | Biológicos con múltiples modos de acción |
| F-MOAD | Modo de acción desconocido |

### 6.3 Banda toxicológica

| Valor | Etiqueta | Color (referencia UI) |
|---|---|---|
| `Ia` | Clase Ia | `#c0392b` |
| `Ib` | Clase Ib | `#e74c3c` |
| `II` | Clase II | `#f39c12` |
| `III` | Clase III | `#2980b9` |
| `IV` | Clase IV | `#27ae60` |
| (vacío) | Sin especificar | — |

---

## 7. Usuarios y permisos

### 7.1 USUARIO

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | PK |
| `nombre` | string | |
| `email` | string | **Identificador de login** (único en todo el sistema) |
| `rol` | enum | `admin_general` / `admin_cliente` / `usuario` |
| `clienteId` | string | Cliente al que pertenece. `null` para `admin_general` |
| `activo` | bool | |

> La **contraseña / credenciales no van en este modelo**: son responsabilidad del backend (hashing, sesiones, recuperación). Aquí solo se identifica al usuario por email.

### 7.2 PERMISO

Un usuario tiene una **lista** de permisos: **uno por empresa** a la que accede. Esto permite que un mismo usuario tenga distinto alcance y nivel en cada empresa, incluso en empresas de clientes distintos.

| Campo | Tipo | Notas |
|---|---|---|
| `usuarioId` | string | FK → Usuario |
| `empresaId` | string | FK → Empresa — a qué empresa aplica este permiso |
| `campoIds` | array | Qué campos de esa empresa ve. **Vacío = todos los campos de la empresa** |
| `herramientas` | array | IDs de herramientas habilitadas para esa empresa (de las `asignable: true`) |
| `nivel` | enum | `ver` / `cargar` / `administrar` |

> **El permiso llega hasta nivel CAMPO, nunca hasta lote.** `campoIds` lista campos; los lotes y actividades de un campo permitido se ven todos. No hay filtrado por lote individual.

**Significado de los niveles:**

- `ver` — solo lectura. No carga, no edita, no borra. No toca maestros.
- `cargar` — puede agregar y editar registros operativos **y maestros** de la empresa (insumos, depósitos, terceros, choferes, labores). No borra de forma masiva.
- `administrar` — todo lo de `cargar`, más borrar y gestionar la configuración de la(s) empresa(s) a las que el permiso aplica.

> Los niveles aplican **dentro del alcance del permiso** (empresa + campos + herramientas). El alta de clientes, empresas y campos, y la gestión de datos globales (TC, IPC, tarifas base, campañas, listas globales), son atribución de los roles administrativos (§7.3), no del nivel del permiso.

### 7.3 Jerarquía de roles

```
ADMIN GENERAL (Puntal Agro)     acceso total al sistema; da de alta clientes
                                y admins de cliente; gestiona datos globales y herramientas
  └── ADMIN DE CLIENTE           administra su cliente completo; crea usuarios
                                 dentro de su cliente con permisos ≤ a los suyos
        └── USUARIO              alcance acotado: empresa(s) + campo(s) +
                                 herramientas + nivel, definidos por quien lo crea
```

### 7.4 Regla "= o menor"

> Un usuario solo puede otorgar permisos que estén **dentro del subconjunto de los suyos**.

En concreto, al crear o editar un permiso para otro usuario, el otorgante solo puede asignar:

- empresas a las que **él mismo** tiene acceso;
- dentro de cada empresa, campos que **él mismo** ve;
- herramientas que **él mismo** tiene habilitadas;
- un nivel **igual o menor** al suyo en esa empresa.

El `admin_general` no tiene techo (acceso total). El `admin_cliente` tiene como techo su propio cliente.

### 7.5 Visibilidad entre clientes (aislamiento)

> Un `admin_cliente` solo ve y edita los permisos de un usuario que correspondan a **su propio cliente**. Los permisos de ese mismo usuario en **otros clientes le son invisibles**.

Esto evita la fuga de información entre clientes y habilita el caso del asesor multicliente (§7.6).

### 7.6 Caso de uso: asesor externo multicliente

Un asesor que trabaja para varios clientes es **un único usuario** (un solo email) con permisos en empresas de distintos clientes. No requiere un rol especial.

Quién le asigna los permisos (ambos caminos válidos):

- el **admin general** puede agregarle permisos en empresas de **cualquier** cliente; o
- cada **admin de cliente** puede sumarle un permiso en **su** empresa, aunque el usuario ya tuviera permisos en otros clientes (que ese admin no ve).

Cada permiso es independiente: el asesor puede tener `administrar` en una empresa, `cargar` con campos acotados en otra, y `ver` en una tercera.

---

## 8. Propiedad del dato entre tableros (evitar carga duplicada)

Hoy varios tableros crean las mismas entidades por separado (Fitosanitarios mantiene su propio catálogo de insumos aparte del de Registro de Labores e Insumos). En el modelo central, **cada entidad tiene un único lugar donde se da de alta**; los demás tableros la **leen**.

El criterio que ordena dónde se crea cada cosa:

- Lo que es **estructura sobre la que se reparten permisos** (cliente, empresa, campo) → se crea en **Administración**.
- Lo que es **catálogo compartido por varios tableros** (insumos, terceros, choferes, labores) → se crea en el módulo de **Maestros** (nivel empresa).
- Lo que es **puramente operativo y depende de algo ya existente** (lote, actividad, OT, movimientos) → se crea en **su tablero**.
- Lo que es **transversal a todos los clientes** (TC, IPC, tarifas base, precios, campaña) → lo mantiene **Puntal** (global).

| Entidad | Creada en (dueño) | Leída por |
|---|---|---|
| Cliente, Empresa, **Campo** | **Administración** (admin general / admin cliente, según permisos) | Todos |
| **Lote** | **Plan de Uso del Suelo** | Insumos/OT, Fitosanitarios, Siembra, Labores, Hacienda |
| **Actividad** (lote + tipo de actividad + campaña) | **Plan de Uso del Suelo** | Siembra, Insumos/OT, Labores |
| **Insumo** (catálogo unificado) | **Maestros** (nivel empresa) | Insumos/OT, Fitosanitarios |
| **Tipo de actividad** (cultivos/usos) | **Maestros** (nivel empresa) | Plan de Uso, Siembra, Insumos/OT |
| **Especie** (granos) | Global (Puntal) | Maestros (tipo de actividad), Comercial |
| **Tercero** (proveedores y clientes) | **Maestros** (nivel empresa) | Insumos/OT, Comercial, OTs |
| **Chofer** | **Maestros** (nivel empresa) | Transporte, OTs |
| **Labor** | **Maestros** (nivel empresa) | OTs, Precio de Labores |
| **Depósito** | **Maestros** (nivel empresa) | Stock, movimientos |
| OT | Registro de Labores e Insumos (Insumos/OT) | Costos, reportes |
| Movimientos de insumo | Registro de Labores e Insumos (Insumos/OT) | Stock, costos |
| Campaña | Global (Puntal) | Todos |
| Datos globales (TC, IPC, CATAC, gasoil, precios granos, tarifas base) | Admin general (carga Excel) | Todos |

> **Campo** se da de alta en Administración (no en un tablero operativo) porque es la estructura sobre la que se reparten los permisos. **Lote y Actividad** sí se crean en Plan de Uso del Suelo, porque son operativos y cuelgan de un campo que ya existe; el permiso llega hasta nivel campo, así que no hay dependencia problemática.
>
> Los **maestros de empresa** (insumo, tercero, chofer, labor) se crean en un módulo de Maestros independiente, para que la posibilidad de dar de alta un catálogo compartido no dependa de tener acceso a un tablero operativo puntual (p. ej. poder crear un fitosanitario sin necesitar el tablero de Insumos/OT).
>
> Nota de migración: hoy `tablero_uso_suelo` guarda el lote con su plan de cultivos por campaña **embebido** en un mismo registro. El modelo viejo usaba dos posiciones fijas de cultivo (`[ha, c1, c2]`); el modelo **actual ya implementado** usa una **lista de N actividades** por campaña: `p: { "26-27": [ { c:sigla, ha, seg }, ... ] }`. El modelo central **normaliza** eso en LOTE (físico) y una **lista de ACTIVIDAD** (lote + tipo de actividad + campaña, N filas por lote/campaña, con flag `esSegunda`). El mapeo desde el dato local: clave de campaña → `campañaId`, `c` (sigla) → `tipoActividadId`, `seg` → `esSegunda`. Los tableros nuevos deben adoptar la separación normalizada desde el inicio.

---

## 9. Ejemplo de datos (un cliente de muestra)

JSON ilustrativo. Los `id` son de ejemplo.

```json
{
  "cliente": {
    "id": "cli_albor",
    "nombre": "Grupo Albor",
    "email": "admin@albor.com.ar",
    "telefono": "+54 9 358 400-0000",
    "nombreContacto": "María Pereyra",
    "activo": true,
    "fechaAlta": "2026-03-01",
    "cuit": "30-71000000-1",
    "razonSocial": "Albor Agropecuaria S.A.",
    "direccion": "Ruta 8 km 0, Río Cuarto, Córdoba",
    "facturaCentralizada": true
  },

  "empresas": [
    { "id": "emp_albor_sa", "clienteId": "cli_albor", "razonSocial": "Albor Agropecuaria S.A.", "cuit": "30-71000000-1", "condicionIVA": "Responsable Inscripto", "activo": true },
    { "id": "emp_lospinos", "clienteId": "cli_albor", "razonSocial": "Los Pinos S.R.L.", "cuit": "30-71000000-2", "condicionIVA": "Responsable Inscripto", "activo": true }
  ],

  "campos": [
    { "id": "campo_elpuntal", "empresaId": "emp_albor_sa", "nombre": "El Puntal", "localidad": "Río Cuarto", "partido": "Río Cuarto", "provincia": "Córdoba", "haTotales": 850 },
    { "id": "campo_laesperanza", "empresaId": "emp_lospinos", "nombre": "La Esperanza", "localidad": "Sampacho", "provincia": "Córdoba", "haTotales": 1200 }
  ],

  "lotes": [
    { "id": "lote_p1", "campoId": "campo_elpuntal", "empresaId": "emp_albor_sa", "nombre": "Lote 1", "ha": 120 },
    { "id": "lote_p2", "campoId": "campo_elpuntal", "empresaId": "emp_albor_sa", "nombre": "Lote 2", "ha": 95 }
  ],

  "campanias": [
    { "id": "camp_2425", "nombre": "2024/25" }
  ],

  "especies": [
    { "id": "esp_0", "nombre": "Soja", "sigla": "Sj", "activo": true },
    { "id": "esp_1", "nombre": "Maíz", "sigla": "Mz", "activo": true },
    { "id": "esp_2", "nombre": "Trigo", "sigla": "Tr", "activo": true }
  ],

  "tiposActividad": [
    { "id": "ta_sj1", "empresaId": "emp_albor_sa", "nombre": "Soja 1ª", "sigla": "Sj1ª", "actividad": "AGR", "especieId": "esp_0", "activo": true },
    { "id": "ta_sj2", "empresaId": "emp_albor_sa", "nombre": "Soja 2ª", "sigla": "Sj2ª", "actividad": "AGR", "especieId": "esp_0", "activo": true },
    { "id": "ta_tr",  "empresaId": "emp_albor_sa", "nombre": "Trigo",   "sigla": "Tr",   "actividad": "AGR", "especieId": "esp_2", "activo": true },
    { "id": "ta_vi",  "empresaId": "emp_albor_sa", "nombre": "Verdeo invierno", "sigla": "VI", "actividad": "GAN", "especieId": null, "activo": true }
  ],

  "actividades": [
    { "id": "act_1", "empresaId": "emp_albor_sa", "loteId": "lote_p1", "campañaId": "camp_2425", "tipoActividadId": "ta_tr",  "ha": 120, "esSegunda": false },
    { "id": "act_2", "empresaId": "emp_albor_sa", "loteId": "lote_p1", "campañaId": "camp_2425", "tipoActividadId": "ta_sj2", "ha": 120, "esSegunda": true },
    { "id": "act_3", "empresaId": "emp_albor_sa", "loteId": "lote_p2", "campañaId": "camp_2425", "tipoActividadId": "ta_sj1", "ha": 95,  "esSegunda": false }
  ],

  "depositos": [
    { "id": "dep_central", "empresaId": "emp_albor_sa", "campoId": null, "nombre": "Depósito central" },
    { "id": "dep_puntal", "empresaId": "emp_albor_sa", "campoId": "campo_elpuntal", "nombre": "Galpón El Puntal" }
  ],

  "insumos": [
    {
      "id": "ins_glifo", "empresaId": "emp_albor_sa", "nombre": "Glifosato 48%",
      "tipo": "Herbicida", "categoria": "Herbicidas", "unidad": "Lt",
      "precioUnitario": 4.20, "moneda": "USD",
      "claseFito": "Herbicida",
      "principioActivo": "Glifosato", "concentracionValor": 48, "concentracionUnidad": "% p/v",
      "eiq": 15.33, "modoAccion": "EPSPS", "banda": "IV"
    },
    {
      "id": "ins_urea", "empresaId": "emp_albor_sa", "nombre": "Urea granulada",
      "tipo": "Fertilizante", "categoria": "Fertilizantes", "unidad": "tn",
      "precioUnitario": 520, "moneda": "USD"
    }
  ],

  "terceros": [
    { "id": "ter_agro", "empresaId": "emp_albor_sa", "nombre": "Agroinsumos del Centro", "cuit": "30-60000000-7", "telefono": "358-444-0000",
      "esProveedor": true, "esCliente": false, "tiposProveedor": ["insumos", "transportista"], "activo": true },
    { "id": "ter_acopio", "empresaId": "emp_albor_sa", "nombre": "Acopio San Martín", "cuit": "30-65000000-4", "telefono": "358-466-0000",
      "esProveedor": false, "esCliente": true, "tiposProveedor": [], "activo": true },
    { "id": "ter_gomez", "empresaId": "emp_albor_sa", "nombre": "Servicios Gómez", "cuit": "20-20000000-3", "telefono": "351-555-0000",
      "esProveedor": true, "esCliente": false, "tiposProveedor": ["contratista"], "activo": true }
  ],

  "choferes": [
    { "id": "cho_perez", "empresaId": "emp_albor_sa", "terceroId": "ter_agro", "nombre": "Juan Pérez", "dni": "25000000", "licencia": "E1", "activo": true }
  ],

  "labores": [
    { "id": "lab_pulv", "empresaId": "emp_albor_sa", "tipo": "LC", "nombre": "Pulverización terrestre", "tarifaDefault": 0 },
    { "id": "lab_siembra", "empresaId": "emp_albor_sa", "tipo": "LP", "nombre": "Siembra", "tarifaDefault": 12000 }
  ],

  "usuarios": [
    {
      "id": "usr_maria", "nombre": "María Pereyra", "email": "maria@albor.com.ar",
      "rol": "admin_cliente", "clienteId": "cli_albor", "activo": true
    },
    {
      "id": "usr_asesor", "nombre": "Juan Asesor", "email": "juan@agroasesor.com",
      "rol": "usuario", "clienteId": null, "activo": true
    }
  ],

  "permisos": [
    {
      "usuarioId": "usr_maria", "empresaId": "emp_albor_sa",
      "campoIds": [], "herramientas": ["tablero_agro","tablero_insumos_ot","tablero_uso_suelo","Fitosanitarios"],
      "nivel": "administrar"
    },
    {
      "usuarioId": "usr_maria", "empresaId": "emp_lospinos",
      "campoIds": [], "herramientas": ["tablero_insumos_ot","tablero_uso_suelo"],
      "nivel": "administrar"
    },
    {
      "usuarioId": "usr_asesor", "empresaId": "emp_albor_sa",
      "campoIds": ["campo_elpuntal"], "herramientas": ["tablero_agro"],
      "nivel": "ver"
    }
  ]
}
```

> En el ejemplo, `usr_asesor` pertenece a `clienteId: null` porque cruza varios clientes; su acceso se define exclusivamente por la lista de permisos. Aquí solo ve el Tablero Comercial de Albor S.A., acotado a un campo, en modo lectura.

> Sobre las actividades del ejemplo: `lote_p1` (120 ha) tiene en 2024/25 **Trigo de 1ª** (120 ha, `esSegunda: false`) seguido de **Soja de 2ª** (120 ha, `esSegunda: true`). Su superficie física es 120 (solo la de 1ª) y su superficie sembrada es 240 (ambas). En modo demo el tablero guardaría esto como `p: { "24-25": [ {c:"Tr",ha:120,seg:false}, {c:"Sj2ª",ha:120,seg:true} ] }`; al migrar, cada `c` (sigla) se resuelve al `tipoActividadId` correspondiente de la empresa.

---

## 10. Alcance y supuestos

**Dentro de alcance de este documento:**

- Modelo lógico de entidades, relaciones y reglas de negocio.
- Modelo de usuarios, roles y permisos (3 ejes + regla "= o menor" + aislamiento entre clientes).
- Listas cerradas y campos técnicos de insumos.
- Propiedad del dato entre tableros.
- **Plan de Uso del Suelo (LOTE, ACTIVIDAD, TIPO_ACTIVIDAD, ESPECIE):** modelado e implementado en el tablero; estructura estabilizada y lista para normalizar en backend.

**Fuera de alcance (responsabilidad del backend / a definir aparte):**

- Autenticación: contraseñas, hashing, sesiones, tokens, recuperación de cuenta.
- **Aplicación efectiva de los permisos del lado del servidor** (el cliente solo oculta botones; la seguridad real vive en el backend, que debe negar datos fuera del alcance del usuario).
- Esquema físico de base de datos y elección de motor.
- **Migración de los datos cargados hoy** en `localStorage` de cada tablero: se asume **arranque desde cero** con el backend. No se migra el estado local actual.
- El **contrato de integración** entre los tableros y el backend (funciones de acceso, modo asíncrono, modo demo/fallback, cómo se calcula/consulta el saldo de stock): se especifica en el documento aparte `contrato_contexto.md`.
- **Entidades de Programa de Siembra y de Hacienda:** todavía no modeladas; se definirán al integrar esos tableros (sus archivos aún no se revisaron contra este modelo).
- **Ventas y precios de granos** (entidad VENTA, registro de operaciones comerciales con COMPRADOR): fuera de alcance por ahora. COMPRADOR queda definido como maestro para uso futuro.

---

*Documento de diseño — Puntal Agro. Para implementación de backend y base de datos.*
