# Sincronizar frontend desde snapshot estable

Workflow completo para incorporar un snapshot congelado del cliente
(`puntalagroapp/puntalagro-frontend-estable`) al proyecto de 3 capas,
preservando todas las adaptaciones de producción.

**Prerequisito:** haber ejecutado `/freeze-cliente` al menos una vez para
tener un tag disponible.

Los cambios se trabajan en una rama separada para poder testear antes de mergear a main.

## Variables
- Repo estable:  `https://github.com/puntalagroapp/puntalagro-frontend-estable.git`
- Carpeta temp:  `/tmp/estable_snap`  (checkout del tag elegido)
- Nuestro frontend: `frontend/`

---

## Pasos a ejecutar en orden

### 0. Elegir el tag a incorporar

Listar los tags disponibles en el repo estable (más recientes primero):
```bash
git ls-remote --tags https://github.com/puntalagroapp/puntalagro-frontend-estable.git \
  | grep -oP 'v\d{4}-\d{2}-\d{2}[^\s]*' | sort -rV | head -10
```

Mostrar la lista al usuario y preguntar cuál tag quiere usar.
Si el usuario no especifica, usar el más reciente (primer resultado de la lista).

Guardar el tag elegido en una variable, por ejemplo: `tag_elegido="v2026-06-19"`

### 1. Asegurarse de estar en main y crear rama de trabajo

```bash
git checkout main
git pull
```

Crear rama con el tag elegido como nombre:
```bash
git checkout -b "sync-cliente/$tag_elegido"
```

Informar al usuario:
"Trabajando en la rama sync-cliente/$tag_elegido con el snapshot $tag_elegido.
Al terminar podrás probar los cambios y mergear con:
  git checkout main && git merge sync-cliente/$tag_elegido"

### 2. Bajar el snapshot del tag elegido

```bash
if [ -d /tmp/estable_snap/.git ]; then
  git -C /tmp/estable_snap fetch --all --tags
else
  rm -rf /tmp/estable_snap
  git clone https://github.com/puntalagroapp/puntalagro-frontend-estable.git /tmp/estable_snap
fi

# Hacer checkout del tag exacto (estado desconectado — solo lectura)
git -C /tmp/estable_snap checkout "tags/$tag_elegido" --detach
```

Confirmar el commit correspondiente al tag:
```bash
git -C /tmp/estable_snap log -1 --format="%h %ci — %s"
```

### 3. Detectar qué HTML cambió

Comparar cada `.html` del snapshot con el nuestro. Listar los que son diferentes.

```bash
for f in /tmp/estable_snap/*.html; do
  nombre=$(basename "$f")
  if [ -f "frontend/$nombre" ]; then
    if ! diff -q "$f" "frontend/$nombre" > /dev/null 2>&1; then
      echo "CAMBIÓ: $nombre"
    fi
  else
    echo "NUEVO:  $nombre"
  fi
done
```

### 4. Analizar diferencias en pa-core.js del snapshot

```bash
diff /tmp/estable_snap/pa-core.js frontend/pa-core.js
```

Revisar el diff buscando:
- Nuevos métodos `PA.demo.*` que no estén en nuestro pa-core.js
- Nuevas claves `K_ALGO` de localStorage
- Cambios en la estructura de objetos (nuevos campos)
- Renombrado de métodos existentes

**Importante**: NO copiar el pa-core.js del snapshot. Solo portar los cambios
relevantes a nuestro pa-core.js manteniendo la integración con la API
(`cacheGuardar`, `apiSync`, `cacheGet`, `_cache`).

### 5. Copiar los HTML que cambiaron

Para cada HTML con diferencias detectado en el paso 3:

```bash
cp /tmp/estable_snap/NOMBRE.html frontend/NOMBRE.html
```

### 6. Re-aplicar adaptaciones de producción en cada HTML copiado

Para cada HTML copiado, verificar que las siguientes adaptaciones siguen presentes.
Si falta alguna, agregarla.

**Para tablero_insumos_ot.html** — verificar estas dos cosas:

a) Que tiene `<script src="pa-core.js">` antes del cierre `</body>`

b) Que tiene el script de pre-carga ANTES del script principal del tablero:
```html
<script>
(function () {
  var CLAVE = 'puntalagro_insumos_v4';
  if (localStorage.getItem(CLAVE)) return;
  var esLocal = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:');
  if (esLocal) return;
  try {
    var sesion = JSON.parse(localStorage.getItem('pa_sesion_activa') || 'null');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'api/tablero/' + encodeURIComponent(CLAVE), false);
    if (sesion && sesion.token) xhr.setRequestHeader('Authorization', 'Bearer ' + sesion.token);
    xhr.send(null);
    if (xhr.status === 200) {
      var d = JSON.parse(xhr.responseText);
      if (d && Object.keys(d).length > 0) localStorage.setItem(CLAVE, JSON.stringify(d));
    }
  } catch (e) {}
}());
</script>
```

c) Que `saveRoot()` usa `PA.demo.sincronizarTableroCompleto`:
```js
function saveRoot(){
  if (typeof PA !== 'undefined' && PA.demo && PA.demo.sincronizarTableroCompleto) {
    PA.demo.sincronizarTableroCompleto(LS_ROOT, root);
  } else {
    try{ localStorage.setItem(LS_ROOT, JSON.stringify(root)); }catch(e){ console.warn('No se pudo guardar', e); }
  }
}
```

**Para cualquier HTML nuevo** que use datos de maestros o tablero:
- Verificar que tiene `<script src="pa-core.js">` antes de su script principal

### 7. Verificar si se necesitan nuevos endpoints o tablas

Analizar nuestro pa-core.js actualizado buscando llamadas a `apiSync` o
`cacheGuardar` con colecciones que NO estén en `COLECCIONES` de server.js:

```bash
grep "cacheGuardar\|cacheBorrar\|apiSync" frontend/pa-core.js | grep -oP "'[a-z-]+'" | sort -u
grep "COLECCIONES" backend/server.js -A 30
```

Por cada colección nueva encontrada:
1. Agregar entrada en `COLECCIONES` en `backend/server.js`
2. Si la tabla no existe, crear un archivo de migración numerado:

```bash
ultimo=$(ls database/migrations/*.sql 2>/dev/null | grep -oP '\d+' | sort -n | tail -1)
siguiente=$(printf "%03d" $((${ultimo:-0} + 1)))
archivo="database/migrations/${siguiente}_descripcion_del_cambio.sql"
```

Escribir el SQL en ese archivo usando `CREATE TABLE IF NOT EXISTS` o `ALTER TABLE IF NOT EXISTS`,
con comentario de fecha y descripción. Ejemplo:
```sql
-- Migración 001: tabla ambientes (2026-06-18)
CREATE TABLE IF NOT EXISTS ambientes (
    id         TEXT NOT NULL,
    empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    datos      JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (id, empresa_id)
);
CREATE INDEX IF NOT EXISTS idx_ambientes_empresa ON ambientes(empresa_id);
```

3. Aplicar la migración en la DB local:
```bash
docker exec pa_postgres_db psql -U postgres -d puntal_agro \
  -f /docker-entrypoint-initdb.d/migrations/${archivo##*/}
```

4. Actualizar también `database/init.sql` para que refleje el esquema completo.

**Importante**: usar siempre `IF NOT EXISTS` para que las migraciones sean idempotentes.

### 8. Reiniciar la API y verificar

```bash
docker restart pa_express_api
sleep 3
docker logs --tail 10 pa_express_api
```

Luego hacer un curl de verificación básica:
```bash
curl -s -H "Authorization: Bearer token-demo" http://puntal.test:8080/api/maestros-empresa/e_1 | python3 -m json.tool | head -20
```

### 9. Commitear los cambios en la rama

```bash
git status
git add frontend/ backend/server.js database/init.sql database/migrations/
git commit -m "Sync $tag_elegido: <describir qué cambió en esta versión>"
git push -u origin "sync-cliente/$tag_elegido"
```

### 10. Crear Pull Request en GitHub

Armar un resumen de los cambios que entraron (HTMLs modificados, métodos nuevos
en pa-core.js, migraciones aplicadas) y crear el PR:

```bash
rama="sync-cliente/$tag_elegido"
gh pr create \
  --base main \
  --head "$rama" \
  --title "Sync $tag_elegido" \
  --body "$(cat <<'EOF'
## Snapshot incorporado
- Tag: <tag_elegido>
- Repo estable: https://github.com/puntalagroapp/puntalagro-frontend-estable

## Cambios incorporados

### HTMLs actualizados
- (listar los que cambiaron)

### pa-core.js
- (listar métodos nuevos o modificados)

### Base de datos
- (listar migraciones aplicadas, o "Sin cambios de esquema")

## Checklist de pruebas
- [ ] Login y selección de empresa funcionan
- [ ] Maestros cargan correctamente
- [ ] Los cambios del cliente se ven en la UI
- [ ] No hay errores en `docker logs pa_express_api`

## Para aplicar en producción (después de aprobar)
```bash
git pull
# Por cada migración nueva:
docker exec pa_postgres_db psql -U postgres -d puntal_agro \
  -f /docker-entrypoint-initdb.d/migrations/NNN_nombre.sql
docker restart pa_express_api
```
EOF
)"
```

### 11. Informar al usuario cómo proceder

Mostrar este resumen final con la URL del PR:

---
**PR creado. Probá los cambios en http://puntal.test:8080**

Cuando termines de testear:
- ✅ **Todo funciona** → aprobá y mergeá el PR en GitHub, luego aplicá las migraciones en producción
- ❌ **Algo falla** → cerrá el PR sin mergear y ejecutá:

```bash
git checkout main
git branch -D sync-cliente/<tag_elegido>
# Si querés revertir también los cambios de DB local:
docker compose down -v && docker compose up -d
```
---

---

## Reglas importantes

- **Nunca** reemplazar `frontend/pa-core.js` con el del snapshot directamente
- **Nunca** pushear directo a main — siempre PR con revisión
- Los parches de producción (pre-carga, saveRoot, script tag) deben re-aplicarse
  cada vez que se copia un HTML del snapshot
- Las migraciones SQL siempre con `IF NOT EXISTS` para que sean re-ejecutables
- Si hay dudas sobre si un método nuevo del snapshot necesita soporte de API,
  preguntar antes de portarlo
- La fuente de verdad para los HTMLs del cliente es el repo estable, no el repo
  del cliente directamente — eso garantiza que trabajamos sobre una versión conocida
