# Sincronizar frontend del cliente (Puntal Agro)

Workflow completo para incorporar actualizaciones del cliente desde su repo GitHub
al proyecto 3 capas, preservando todas las adaptaciones de producción.
Los cambios se trabajan en una rama separada para poder testear antes de mergear a main.

## Variables del proyecto
- Repo cliente: https://github.com/Puntal-Agro/Herramientas-Puntal-Agro.git
- Carpeta temp: /tmp/cliente_repo
- Nuestro frontend: frontend/

## Pasos a ejecutar en orden

### 1. Asegurarse de estar en main y crear rama de trabajo

```bash
git checkout main
git pull
```

Obtener la fecha actual para nombrar la rama:
```bash
fecha=$(date +%Y-%m-%d)
git checkout -b "sync-cliente/$fecha"
```

Informar al usuario: "Trabajando en la rama sync-cliente/$fecha. Al terminar podrás
probar los cambios y luego mergear a main con: git checkout main && git merge sync-cliente/$fecha"

### 2. Bajar el repo del cliente

```bash
if [ -d /tmp/cliente_repo ]; then
  git -C /tmp/cliente_repo pull
else
  git clone https://github.com/Puntal-Agro/Herramientas-Puntal-Agro.git /tmp/cliente_repo
fi
```

### 3. Detectar qué HTML cambió

Comparar cada .html del cliente con el nuestro. Listar los que son diferentes.

```bash
for f in /tmp/cliente_repo/*.html; do
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

### 4. Analizar diferencias en pa-core.js del cliente

```bash
diff /tmp/cliente_repo/pa-core.js frontend/pa-core.js
```

Revisar el diff buscando:
- Nuevos métodos `PA.demo.*` que no estén en nuestro pa-core.js
- Nuevas claves `K_ALGO` de localStorage
- Cambios en la estructura de objetos (nuevos campos)
- Renombrado de métodos existentes

**Importante**: NO copiar el pa-core.js del cliente. Solo portar los cambios
relevantes a nuestro pa-core.js manteniendo la integración con la API
(`cacheGuardar`, `apiSync`, `cacheGet`, `_cache`).

### 5. Copiar los HTML que cambiaron

Para cada HTML con diferencias detectado en el paso 3:

```bash
cp /tmp/cliente_repo/NOMBRE.html frontend/NOMBRE.html
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
# Determinar el próximo número de migración
ultimo=$(ls database/migrations/*.sql 2>/dev/null | grep -oP '\d+' | sort -n | tail -1)
siguiente=$(printf "%03d" $((${ultimo:-0} + 1)))
archivo="database/migrations/${siguiente}_descripcion_del_cambio.sql"
```

Escribir el SQL en ese archivo usando CREATE TABLE IF NOT EXISTS o ALTER TABLE IF NOT EXISTS,
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

4. Actualizar también `database/init.sql` para que refleje el esquema completo
   (quien clone desde cero parte con todo ya incluido).

**Importante**: usar siempre `IF NOT EXISTS` en las migraciones para que sean
idempotentes — si se corren dos veces, no fallan.

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
git commit -m "Sync cliente: <describir qué cambió en esta versión>"
git push -u origin "sync-cliente/$(date +%Y-%m-%d)"
```

### 10. Informar al usuario cómo proceder

Mostrar este resumen final:

---
**Cambios commiteados en la rama `sync-cliente/FECHA`.**

Probá los cambios en http://puntal.test:8080

**Si todo funciona → mergear a main:**
```bash
git checkout main
git merge sync-cliente/FECHA
git push
```

**Si algo falla → descartar la rama y volver a main limpio:**
```bash
git checkout main
git branch -D sync-cliente/FECHA
```
Y si aplicaste migraciones en la DB local que querés revertir:
```bash
docker compose down -v && docker compose up -d
```
(recrea la DB desde init.sql — borra datos de prueba, pero main queda intacto)

**Para aplicar en producción** (después de mergear a main, en el servidor remoto):
```bash
git pull
# Por cada migración nueva que vino en el sync:
docker exec pa_postgres_db psql -U postgres -d puntal_agro \
  -f /docker-entrypoint-initdb.d/migrations/001_nombre.sql
docker restart pa_express_api
```
Las migraciones usan `IF NOT EXISTS` así que si por error se corren dos veces, no rompen nada.
---

## Reglas importantes

- **Nunca** reemplazar `frontend/pa-core.js` con el del cliente directamente
- **Nunca** commitear directo a main desde este skill
- Los parches de producción (pre-carga, saveRoot, script tag) deben re-aplicarse
  cada vez que se copia un HTML del cliente
- Si hay dudas sobre si un método nuevo del cliente necesita soporte de API,
  preguntar antes de portarlo
