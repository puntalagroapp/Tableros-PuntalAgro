/* =============================================================================
   server.js — API backend Puntal Agro (Node.js + Express + PostgreSQL)
   =============================================================================
   Endpoints:
     GET  /api/init                         Todos los datos del usuario actual
     GET  /api/context?empresaId=           Contexto y permisos para una empresa
     POST /api/auth/login                   Iniciar sesión (email)
     POST /api/auth/logout                  Cerrar sesión

     POST   /api/maestros/:coleccion        Crear registro
     PUT    /api/maestros/:coleccion/:id    Actualizar registro
     DELETE /api/maestros/:coleccion/:id    Eliminar registro

     GET    /api/tablero/:clave             Obtener blob de tablero (JSONB)
     PUT    /api/tablero/:clave             Guardar/reemplazar blob de tablero
     PATCH  /api/json-patch                 Parche granular de campo JSONB
   ============================================================================= */

const express = require('express');
const path    = require('path');
const cors    = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Sirve el frontend de forma estática
app.use(express.static(path.join(__dirname, '../frontend')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: recupera la sesión del usuario a partir del header Authorization.
// Devuelve null si no hay token válido (el endpoint decide si bloquear o no).
// ─────────────────────────────────────────────────────────────────────────────
async function obtenerSesion(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.cliente_id, s.empresa_id_activa
         FROM sesiones s
         JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token = $1
          AND (s.expira_en IS NULL OR s.expira_en > NOW())`,
      [token]
    );
    return r.rows[0] || null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLA: sesiones  (agregamos columna empresa_id_activa si no existe)
// Se ejecuta al arrancar para asegurar la columna de empresa activa.
// ─────────────────────────────────────────────────────────────────────────────
pool.query(`
  ALTER TABLE sesiones
    ADD COLUMN IF NOT EXISTS empresa_id_activa TEXT
`).catch(() => {});

// ─────────────────────────────────────────────────────────────────────────────
// COLECCIONES MAESTRAS
// Define qué tablas acepta el endpoint genérico /api/maestros/:coleccion.
// porEmpresa = true  → los registros llevan empresa_id; se filtra al leer.
// ─────────────────────────────────────────────────────────────────────────────
const COLECCIONES = {
  'terceros':        { tabla: 'terceros',        porEmpresa: true  },
  'choferes':        { tabla: 'choferes',        porEmpresa: true  },
  'depositos':       { tabla: 'depositos',       porEmpresa: true  },
  'insumos':         { tabla: 'insumos',         porEmpresa: true  },
  'tipos-actividad': { tabla: 'tipos_actividad', porEmpresa: true  },
  'labores':         { tabla: 'labores',         porEmpresa: false },
  'especies':        { tabla: 'especies',        porEmpresa: false },
  'unidades':        { tabla: 'unidades',        porEmpresa: false },
  'modos-accion':    { tabla: 'modos_accion',    porEmpresa: false },
  'tipos-proveedor': { tabla: 'tipos_proveedor', porEmpresa: false },
  'lotes':           { tabla: 'lotes',           porEmpresa: true  },
  'actividades':     { tabla: 'actividades',     porEmpresa: true  },
  'campanias':       { tabla: 'campanias',       porEmpresa: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/globales
// Solo listas fijas mantenidas por Puntal: labores, especies, unidades,
// modos_accion, tipos_proveedor + empresas disponibles para el usuario.
// Son datos pequeños que no crecen con el volumen de cada cliente.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/globales', async (req, res) => {
  try {
    const sesion = await obtenerSesion(req);

    const [labores, especies, unidades, modosAccion, tiposProveedor, campanias] = await Promise.all([
      pool.query('SELECT id, nombre, precio_ref AS "precioRef", activo FROM labores WHERE activo = true ORDER BY nombre'),
      pool.query('SELECT id, nombre, sigla, activo FROM especies WHERE activo = true ORDER BY nombre'),
      pool.query('SELECT id, sigla, nombre, activo FROM unidades WHERE activo = true ORDER BY sigla'),
      pool.query('SELECT id, sistema, codigo, descripcion, activo FROM modos_accion WHERE activo = true ORDER BY sistema, codigo'),
      pool.query('SELECT id, nombre FROM tipos_proveedor ORDER BY nombre'),
      pool.query('SELECT id, nombre, orden, activa FROM campanias ORDER BY orden'),
    ]);

    const payload = {
      labores:        labores.rows,
      especies:       especies.rows,
      unidades:       unidades.rows,
      modosAccion:    modosAccion.rows,
      tiposProveedor: tiposProveedor.rows,
      campanias:      campanias.rows,
      empresas:       [],
      sesion:         null,
    };

    if (!sesion) return res.json(payload);

    const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    payload.sesion = { id: sesion.id, nombre: sesion.nombre, email: sesion.email, rol: sesion.rol, token };

    const empresaQuery = sesion.rol === 'admin_general'
      ? pool.query('SELECT id, cliente_id AS "clienteId", razon_social AS "razonSocial", cuit, activo FROM empresas WHERE activo = true ORDER BY razon_social')
      : pool.query(
          `SELECT e.id, e.cliente_id AS "clienteId", e.razon_social AS "razonSocial", e.cuit, e.activo
             FROM empresas e JOIN permisos p ON p.empresa_id = e.id
            WHERE p.usuario_id = $1 AND e.activo = true ORDER BY e.razon_social`,
          [sesion.id]
        );

    payload.empresas = (await empresaQuery).rows;
    res.json(payload);
  } catch (err) {
    console.error('/api/globales error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/maestros-empresa/:empresaId
// Maestros propios de una empresa: campos, terceros, choferes, depósitos,
// insumos y tipos de actividad. Se llama desde loadContext() después de
// que el usuario seleccionó (o tiene) una empresa activa.
// Solo devuelve datos de la empresa solicitada → volumen acotado.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/maestros-empresa/:empresaId', async (req, res) => {
  try {
    const sesion = await obtenerSesion(req);
    if (!sesion) return res.status(401).json({ error: 'No autenticado' });

    const empresaId = req.params.empresaId;

    // Verificar que el usuario tiene acceso a esta empresa
    if (sesion.rol !== 'admin_general') {
      const acceso = await pool.query(
        'SELECT 1 FROM permisos WHERE usuario_id = $1 AND empresa_id = $2',
        [sesion.id, empresaId]
      );
      if (!acceso.rows.length) return res.status(403).json({ error: 'Sin acceso a esta empresa' });
    }

    const [campos, terceros, choferes, depositos, insumos, tiposActividad, lotes, actividades] = await Promise.all([
      pool.query(
        'SELECT id, empresa_id AS "empresaId", nombre, localidad, partido, provincia, ha_totales AS "haTotales" FROM campos WHERE empresa_id = $1 ORDER BY nombre',
        [empresaId]
      ),
      pool.query('SELECT datos FROM terceros        WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT datos FROM choferes        WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT datos FROM depositos       WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT datos FROM insumos         WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT datos FROM tipos_actividad WHERE empresa_id = $1', [empresaId]),
      pool.query(
        `SELECT jsonb_build_object('id',id,'campoId',campo_id,'empresaId',empresa_id,'nombre',nombre,'ha',ha) AS datos
           FROM lotes WHERE empresa_id = $1`,
        [empresaId]
      ),
      pool.query(
        `SELECT jsonb_build_object('id',id,'empresaId',empresa_id,'loteId',lote_id,'campaniaId',campania_id,
                                   'tipoActividadId',tipo_actividad_id,'ha',ha,'esSegunda',es_segunda) AS datos
           FROM actividades WHERE empresa_id = $1`,
        [empresaId]
      ),
    ]);

    res.json({
      campos:         campos.rows,
      terceros:       terceros.rows.map(r => r.datos),
      choferes:       choferes.rows.map(r => r.datos),
      depositos:      depositos.rows.map(r => r.datos),
      insumos:        insumos.rows.map(r => r.datos),
      tiposActividad: tiposActividad.rows.map(r => r.datos),
      lotes:          lotes.rows.map(r => r.datos),
      actividades:    actividades.rows.map(r => r.datos),
    });
  } catch (err) {
    console.error('/api/maestros-empresa error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mantener /api/init por compatibilidad — redirige a /api/globales
app.get('/api/init', (req, res) => res.redirect('/api/globales'));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/context?empresaId=
// Devuelve el contexto del usuario para la empresa solicitada:
// { usuario, empresaActivaId, empresasDisponibles, permiso }
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/context', async (req, res) => {
  try {
    const sesion = await obtenerSesion(req);
    if (!sesion) return res.status(401).json({ error: 'No autenticado' });

    // Empresas disponibles para el usuario
    let empresaQuery;
    if (sesion.rol === 'admin_general') {
      empresaQuery = pool.query(
        'SELECT id, razon_social AS "razonSocial" FROM empresas WHERE activo = true ORDER BY razon_social'
      );
    } else {
      empresaQuery = pool.query(
        `SELECT e.id, e.razon_social AS "razonSocial"
           FROM empresas e JOIN permisos p ON p.empresa_id = e.id
          WHERE p.usuario_id = $1 AND e.activo = true ORDER BY e.razon_social`,
        [sesion.id]
      );
    }
    const empresas = await empresaQuery;
    const lista    = empresas.rows;

    const empresaId = req.query.empresaId || (lista.length ? lista[0].id : null);

    let permiso = { campoIds: [], herramientas: [], nivel: 'administrar' };
    if (sesion.rol !== 'admin_general' && empresaId) {
      const pRow = await pool.query(
        'SELECT campo_ids AS "campoIds", herramientas, nivel FROM permisos WHERE usuario_id = $1 AND empresa_id = $2',
        [sesion.id, empresaId]
      );
      if (pRow.rows.length) permiso = pRow.rows[0];
    }

    // Actualizar empresa activa en la sesión
    if (empresaId) {
      await pool.query(
        'UPDATE sesiones SET empresa_id_activa = $1 WHERE token = $2',
        [empresaId, req.headers['authorization'].replace(/^Bearer\s+/i,'').trim()]
      ).catch(() => {});
    }

    res.json({
      usuario: { id: sesion.id, nombre: sesion.nombre, email: sesion.email, rol: sesion.rol },
      empresaActivaId:      empresaId,
      empresasDisponibles:  lista,
      permiso,
    });
  } catch (err) {
    console.error('/api/context error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login   { email }
// Login simple (sin contraseña) para demo. En producción agregar hashing.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Falta email' });

  try {
    const userRow = await pool.query(
      'SELECT id, nombre, email, rol, cliente_id AS "clienteId" FROM usuarios WHERE email = $1 AND activo = true',
      [email]
    );
    if (!userRow.rows.length) return res.status(401).json({ error: 'Usuario no encontrado' });

    const usuario = userRow.rows[0];
    const token   = 'tok_' + Math.random().toString(36).substr(2, 20) + Date.now();

    await pool.query(
      'INSERT INTO sesiones (token, usuario_id, expira_en) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')',
      [token, usuario.id]
    );

    res.json({
      sesion: { ...usuario, token },
    });
  } catch (err) {
    console.error('/api/auth/login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', async (req, res) => {
  const auth  = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    await pool.query('DELETE FROM sesiones WHERE token = $1', [token]).catch(() => {});
  }
  res.json({ status: 'ok' });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/maestros/:coleccion    Crear registro
// PUT  /api/maestros/:coleccion/:id  Actualizar registro
// DELETE /api/maestros/:coleccion/:id  Eliminar registro
//
// Las tablas con porEmpresa=true almacenan el objeto completo en JSONB (datos).
// Las tablas globales (labores, especies, unidades…) tienen columnas propias.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/maestros/:coleccion', async (req, res) => {
  const cfg = COLECCIONES[req.params.coleccion];
  if (!cfg) return res.status(404).json({ error: 'Colección desconocida' });

  try {
    const obj = req.body;
    if (!obj.id) return res.status(400).json({ error: 'Falta id en el registro' });

    if (cfg.porEmpresa) {
      if (!obj.empresaId) return res.status(400).json({ error: 'Falta empresaId' });
      if (cfg.tabla === 'lotes') {
        await pool.query(
          `INSERT INTO lotes (id, campo_id, empresa_id, nombre, ha)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET campo_id=$2, nombre=$4, ha=$5`,
          [obj.id, obj.campoId || null, obj.empresaId, obj.nombre || null, obj.ha || null]
        );
      } else if (cfg.tabla === 'actividades') {
        await pool.query(
          `INSERT INTO actividades (id, empresa_id, lote_id, campania_id, tipo_actividad_id, ha, es_segunda)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id, empresa_id) DO UPDATE
             SET lote_id=$3, campania_id=$4, tipo_actividad_id=$5, ha=$6, es_segunda=$7`,
          [obj.id, obj.empresaId, obj.loteId || null, obj.campaniaId || null,
           obj.tipoActividadId || null, obj.ha || null, obj.esSegunda || false]
        );
      } else {
        await pool.query(
          `INSERT INTO ${cfg.tabla} (id, empresa_id${cfg.tabla === 'choferes' ? ', tercero_id' : ''}, datos)
           VALUES ($1, $2${cfg.tabla === 'choferes' ? ', $3, $4' : ', $3'})
           ON CONFLICT (id, empresa_id) DO UPDATE SET datos = EXCLUDED.datos`,
          cfg.tabla === 'choferes'
            ? [obj.id, obj.empresaId, obj.terceroId || null, obj]
            : [obj.id, obj.empresaId, obj]
        );
      }
    } else {
      await _upsertGlobal(cfg.tabla, obj);
    }
    res.status(201).json(obj);
  } catch (err) {
    console.error(`POST /api/maestros/${req.params.coleccion}:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/maestros/:coleccion/:id', async (req, res) => {
  const cfg = COLECCIONES[req.params.coleccion];
  if (!cfg) return res.status(404).json({ error: 'Colección desconocida' });

  try {
    const obj = { ...req.body, id: req.params.id };

    if (cfg.porEmpresa) {
      if (!obj.empresaId) return res.status(400).json({ error: 'Falta empresaId' });
      if (cfg.tabla === 'lotes') {
        await pool.query(
          `UPDATE lotes SET campo_id=$2, nombre=$3, ha=$4 WHERE id=$1`,
          [obj.id, obj.campoId || null, obj.nombre || null, obj.ha || null]
        );
      } else if (cfg.tabla === 'actividades') {
        await pool.query(
          `UPDATE actividades SET lote_id=$3, campania_id=$4, tipo_actividad_id=$5, ha=$6, es_segunda=$7
            WHERE id=$1 AND empresa_id=$2`,
          [obj.id, obj.empresaId, obj.loteId || null, obj.campaniaId || null,
           obj.tipoActividadId || null, obj.ha || null, obj.esSegunda || false]
        );
      } else {
        await pool.query(
          `UPDATE ${cfg.tabla} SET datos = $3${cfg.tabla === 'choferes' ? ', tercero_id = $4' : ''}
            WHERE id = $1 AND empresa_id = $2`,
          cfg.tabla === 'choferes'
            ? [obj.id, obj.empresaId, obj, obj.terceroId || null]
            : [obj.id, obj.empresaId, obj]
        );
      }
    } else {
      await _upsertGlobal(cfg.tabla, obj);
    }
    res.json(obj);
  } catch (err) {
    console.error(`PUT /api/maestros/${req.params.coleccion}/${req.params.id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/maestros/:coleccion/:id', async (req, res) => {
  const cfg = COLECCIONES[req.params.coleccion];
  if (!cfg) return res.status(404).json({ error: 'Colección desconocida' });

  try {
    const empresaId = req.query.empresaId;
    if (cfg.porEmpresa && !empresaId) return res.status(400).json({ error: 'Falta empresaId en query' });

    if (cfg.tabla === 'lotes') {
      await pool.query('DELETE FROM lotes WHERE id = $1', [req.params.id]);
    } else if (cfg.porEmpresa) {
      await pool.query(`DELETE FROM ${cfg.tabla} WHERE id = $1 AND empresa_id = $2`, [req.params.id, empresaId]);
    } else {
      await _deleteGlobal(cfg.tabla, req.params.id);
    }
    res.json({ status: 'ok' });
  } catch (err) {
    console.error(`DELETE /api/maestros/${req.params.coleccion}/${req.params.id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers para tablas globales (columnas propias, no JSONB)
// ─────────────────────────────────────────────────────────────────────────────
async function _upsertGlobal(tabla, obj) {
  if (tabla === 'labores') {
    await pool.query(
      `INSERT INTO labores (id, nombre, precio_ref, activo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET nombre = $2, precio_ref = $3, activo = $4`,
      [obj.id, obj.nombre, obj.precioRef || 0, obj.activo !== false]
    );
  } else if (tabla === 'especies') {
    await pool.query(
      `INSERT INTO especies (id, nombre, sigla, activo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET nombre = $2, sigla = $3, activo = $4`,
      [obj.id, obj.nombre, obj.sigla || null, obj.activo !== false]
    );
  } else if (tabla === 'unidades') {
    await pool.query(
      `INSERT INTO unidades (id, sigla, nombre, activo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET sigla = $2, nombre = $3, activo = $4`,
      [obj.id, obj.sigla, obj.nombre || null, obj.activo !== false]
    );
  } else if (tabla === 'modos_accion') {
    await pool.query(
      `INSERT INTO modos_accion (id, sistema, codigo, descripcion, activo)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET sistema = $2, codigo = $3, descripcion = $4, activo = $5`,
      [obj.id, obj.sistema, obj.codigo, obj.descripcion || null, obj.activo !== false]
    );
  } else if (tabla === 'tipos_proveedor') {
    await pool.query(
      `INSERT INTO tipos_proveedor (id, nombre)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET nombre = $2`,
      [obj.id, obj.nombre]
    );
  } else if (tabla === 'campanias') {
    await pool.query(
      `INSERT INTO campanias (id, nombre, orden, activa)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET nombre=$2, orden=$3, activa=$4`,
      [obj.id, obj.nombre, obj.orden || 0, obj.activa || false]
    );
  }
}

async function _deleteGlobal(tabla, id) {
  const tablas = ['labores','especies','unidades','modos_accion','tipos_proveedor','campanias'];
  if (tablas.indexOf(tabla) < 0) throw new Error('Tabla no permitida: ' + tabla);
  await pool.query(`DELETE FROM ${tabla} WHERE id = $1`, [id]);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/tablero/:clave   — Obtener blob JSON de un tablero
// PUT  /api/tablero/:clave   — Guardar/reemplazar blob JSON de un tablero
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/tablero/:clave', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT data_json FROM tableros WHERE nombre_clave = $1',
      [req.params.clave]
    );
    if (!r.rows.length) return res.json({});
    res.json(r.rows[0].data_json);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tablero/:clave', async (req, res) => {
  const datos = req.body.datos !== undefined ? req.body.datos : req.body;
  try {
    await pool.query(
      `INSERT INTO tableros (nombre_clave, data_json, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (nombre_clave) DO UPDATE
         SET data_json = $2::jsonb, updated_at = NOW()`,
      [req.params.clave, JSON.stringify(datos)]
    );
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/json-patch  — Parche granular JSONB (compatibilidad con legacy)
// Body: { claveRaiz, ruta, valor }
// Ejemplo de ruta: "espacios.0.state.ots.3.estado"
// ─────────────────────────────────────────────────────────────────────────────
app.patch('/api/json-patch', async (req, res) => {
  const { claveRaiz, ruta, valor } = req.body;
  try {
    const postgresPath = ruta.split('.');
    await pool.query(
      `UPDATE tableros
          SET data_json  = jsonb_set(data_json, $1::text[], $2::jsonb, true),
              updated_at = NOW()
        WHERE nombre_clave = $3`,
      [postgresPath, JSON.stringify(valor), claveRaiz]
    );
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`PA API lista en puerto ${PORT}`));
