# Sincronizar frontend del cliente (Puntal Agro)

Workflow completo para incorporar actualizaciones del cliente desde su repo GitHub
al proyecto 3 capas, preservando todas las adaptaciones de producción.

## Variables del proyecto
- Repo cliente: https://github.com/Puntal-Agro/Herramientas-Puntal-Agro.git
- Carpeta temp: /tmp/cliente_repo
- Nuestro frontend: frontend/

## Pasos a ejecutar en orden

### 1. Bajar el repo del cliente

```bash
if [ -d /tmp/cliente_repo ]; then
  git -C /tmp/cliente_repo pull
else
  git clone https://github.com/Puntal-Agro/Herramientas-Puntal-Agro.git /tmp/cliente_repo
fi
```

### 2. Detectar qué HTML cambió

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

### 3. Analizar diferencias en pa-core.js del cliente

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

### 4. Copiar los HTML que cambiaron

Para cada HTML con diferencias detectado en el paso 2:

```bash
cp /tmp/cliente_repo/NOMBRE.html frontend/NOMBRE.html
```

### 5. Re-aplicar adaptaciones de producción en cada HTML copiado

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

### 6. Verificar si se necesitan nuevos endpoints

Analizar nuestro pa-core.js actualizado buscando llamadas a `apiSync` o
`cacheGuardar` con colecciones que NO estén en `COLECCIONES` de server.js:

```bash
grep "cacheGuardar\|cacheBorrar\|apiSync" frontend/pa-core.js | grep -oP "'[a-z-]+'" | sort -u
grep "COLECCIONES" backend/server.js -A 30
```

Por cada colección nueva encontrada:
1. Agregar entrada en `COLECCIONES` en `backend/server.js`
2. Si la tabla no existe en `init.sql`, crearla y ejecutar el CREATE TABLE en la DB:
   ```bash
   docker exec pa_postgres_db psql -U postgres -d puntal_agro -c "CREATE TABLE ..."
   ```

### 7. Reiniciar la API y verificar

```bash
docker restart pa_express_api
sleep 3
docker logs --tail 10 pa_express_api
```

Luego hacer un curl de verificación básica:
```bash
curl -s -H "Authorization: Bearer token-demo" http://puntal.test:8080/api/maestros-empresa/e_1 | python3 -m json.tool | head -20
```

### 8. Commitear los cambios

```bash
git status
git add frontend/ backend/server.js database/init.sql
git commit -m "Sync cliente: <describir qué cambió en esta versión>"
git push
```

## Reglas importantes

- **Nunca** reemplazar `frontend/pa-core.js` con el del cliente directamente
- Los parches de producción (pre-carga, saveRoot, script tag) deben re-aplicarse
  cada vez que se copia un HTML del cliente
- Si hay dudas sobre si un método nuevo del cliente necesita soporte de API,
  preguntar antes de portarlo
