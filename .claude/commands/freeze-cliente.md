# Congelar versión del cliente → repo estable

Toma el estado actual del repo del cliente y lo publica en el repo privado
`puntalagroapp/puntalagro-frontend-estable` con un tag de fecha.

Ejecutar este skill ANTES de `/sync-cliente` para tener una versión congelada
y estable sobre la que trabajar, independientemente de si el cliente sigue
modificando su repo.

## Variables
- Repo cliente:  `https://github.com/Puntal-Agro/Herramientas-Puntal-Agro.git`
- Repo estable:  `https://github.com/puntalagroapp/puntalagro-frontend-estable.git`
- Colaborador:   `itassets`
- Carpeta temp cliente:  `/tmp/cliente_snap`
- Carpeta temp estable:  `/tmp/estable_repo`

---

## Pasos a ejecutar en orden

### 1. Determinar el tag de esta versión

```bash
fecha=$(date +%Y-%m-%d)
echo "Fecha del snapshot: $fecha"
```

### 2. Bajar el repo del cliente

```bash
if [ -d /tmp/cliente_snap/.git ]; then
  git -C /tmp/cliente_snap fetch --all && git -C /tmp/cliente_snap reset --hard origin/HEAD
else
  rm -rf /tmp/cliente_snap
  git clone https://github.com/Puntal-Agro/Herramientas-Puntal-Agro.git /tmp/cliente_snap
fi
```

Mostrar el último commit del cliente para que el usuario sepa qué versión se está congelando:
```bash
git -C /tmp/cliente_snap log -1 --format="%h %ci — %s"
```

### 3. Verificar que el repo estable existe; crearlo si no

```bash
gh repo view puntalagroapp/puntalagro-frontend-estable --json name --jq .name 2>/dev/null
```

Si el comando anterior falla (repo no existe), crearlo y configurarlo:

```bash
gh repo create puntalagroapp/puntalagro-frontend-estable \
  --private \
  --description "Frontend Puntal Agro — snapshots congelados del repo del cliente (uso interno)"
```

Y agregar a `itassets` como colaborador con permiso de escritura:
```bash
gh api repos/puntalagroapp/puntalagro-frontend-estable/collaborators/itassets \
  -X PUT -f permission=push
```

Informar al usuario: "Repo creado e itassets agregado como colaborador."

Si el repo YA existía, verificar igual que itassets esté como colaborador (en caso de
que sea la primera vez que se ejecuta el skill sobre un repo preexistente):
```bash
gh api repos/puntalagroapp/puntalagro-frontend-estable/collaborators/itassets \
  -X PUT -f permission=push 2>/dev/null \
  && echo "itassets: OK" || echo "(invitación ya enviada o itassets ya era colaborador)"
```

### 4. Clonar o actualizar el repo estable localmente

```bash
if [ -d /tmp/estable_repo/.git ]; then
  git -C /tmp/estable_repo fetch --all
  git -C /tmp/estable_repo checkout main 2>/dev/null || git -C /tmp/estable_repo checkout -b main
  git -C /tmp/estable_repo reset --hard origin/main 2>/dev/null || true
else
  rm -rf /tmp/estable_repo
  git clone https://github.com/puntalagroapp/puntalagro-frontend-estable.git /tmp/estable_repo
fi
```

Si el repo estaba vacío (recién creado, sin commits), crear un commit inicial vacío:
```bash
if ! git -C /tmp/estable_repo log 2>/dev/null | grep -q commit; then
  echo "# puntalagro-frontend-estable" > /tmp/estable_repo/README.md
  git -C /tmp/estable_repo add README.md
  git -C /tmp/estable_repo commit -m "init"
  git -C /tmp/estable_repo push -u origin main
fi
```

### 5. Sincronizar archivos del cliente al repo estable

Copiar todos los archivos del cliente (sin su `.git`) al repo estable,
reemplazando lo que había:

```bash
# Limpiar contenido rastreado por git (no toca .git/)
git -C /tmp/estable_repo rm -rf . --quiet

# Copiar archivos del cliente excluyendo su .git
rsync -a --exclude='.git' /tmp/cliente_snap/ /tmp/estable_repo/
```

Si `rsync` no está disponible, usar la alternativa:
```bash
find /tmp/cliente_snap -mindepth 1 -not -path '/tmp/cliente_snap/.git*' | while read src; do
  rel="${src#/tmp/cliente_snap/}"
  dest="/tmp/estable_repo/$rel"
  if [ -d "$src" ]; then
    mkdir -p "$dest"
  else
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
  fi
done
```

### 6. Verificar si hubo cambios

```bash
git -C /tmp/estable_repo status --short
```

Si el output está vacío (sin cambios), informar al usuario:
"No hubo cambios respecto al último snapshot — el repo del cliente no tiene novedades.
No se creó un tag nuevo." Y terminar aquí.

Si hay cambios, mostrar un resumen con `git -C /tmp/estable_repo diff --stat HEAD`.

### 7. Commit y push a main

```bash
git -C /tmp/estable_repo add -A
git -C /tmp/estable_repo commit -m "Freeze $fecha — sincronizado desde Puntal-Agro/Herramientas-Puntal-Agro

$(git -C /tmp/cliente_snap log -1 --format='Commit cliente: %h %s (%ci)')"
git -C /tmp/estable_repo push origin main
```

### 8. Crear el tag de versión (maneja duplicados del mismo día)

```bash
tag="v$fecha"

# Si el tag ya existe (dos freezes en el mismo día), agregar sufijo -2, -3, …
n=2
while git -C /tmp/estable_repo tag | grep -qx "$tag"; do
  tag="v${fecha}-${n}"
  n=$((n + 1))
done

git -C /tmp/estable_repo tag -a "$tag" \
  -m "Snapshot cliente $fecha — $(git -C /tmp/cliente_snap log -1 --format='%h %s')"
git -C /tmp/estable_repo push origin "$tag"
```

### 9. Informar resultado

Mostrar este resumen:

```
✅ Snapshot creado exitosamente

  Repo estable : https://github.com/puntalagroapp/puntalagro-frontend-estable
  Tag          : <tag creado>
  Commit origen: <hash y mensaje del cliente>

Para incorporar esta versión a nuestro proyecto:
  ejecutá /sync-cliente y elegí el tag "<tag creado>"
```

---

## Reglas

- Nunca modificar el repo del cliente: es de solo lectura.
- El repo estable es un espejo del cliente en un punto del tiempo; no se edita
  manualmente. Las adaptaciones de producción viven en nuestro `frontend/` y se
  aplican durante `/sync-cliente`.
- Si el cliente hace varios releases el mismo día, el skill agrega sufijo al tag
  automáticamente (`v2026-06-19`, `v2026-06-19-2`, etc.).
- `itassets` tiene permiso `push` en el repo estable; NO es admin del repo.
