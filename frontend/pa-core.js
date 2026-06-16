/* ============================================================================
   pa-core.js — Capa de acceso Puntal Agro (Parte A del contrato)
   ----------------------------------------------------------------------------
   MODO HÍBRIDO AUTOMÁTICO (DOCKER / PRODUCCIÓN):
   - En tu PC (localhost / 127.0.0.1): Sigue usando LocalStorage de forma aislada.
   - En Producción/Docker: Envía un PATCH XMLHttpRequest granular a Postgres.

   Restricciones del proyecto: ES5 estricto (var/function), sin promesas,
   sin arrow functions. Funciones asíncronas con callback function(err, data).
   ============================================================================ */
(function (global) {
  'use strict';

  // 1. DETECCIÓN DE ENTORNO HÍBRIDO
  var esLocalhost = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.protocol === 'file:';

  var API_URL = ''; // En Docker/Producción usamos rutas relativas compartiendo dominio

  var LS_USUARIOS = 'pa_usuarios';      // catálogo de usuarios demo
  var LS_PERMISOS = 'pa_permisos';      // lista de permisos (uno por usuario+empresa)
  var LS_CLIENTES = 'pa_clientes';      // clientes (tenants) demo
  var LS_EMPRESAS = 'pa_empresas';      // empresas demo
  var LS_CAMPOS   = 'pa_campos';        // campos/establecimientos demo
  var LS_TERCEROS = 'pa_terceros';      // terceros (proveedores y clientes) demo
  var LS_CHOFERES = 'pa_choferes';      // choferes demo
  var LS_TIPOPROV = 'pa_tipo_prov';     // tipos de proveedor (global Puntal)
  var LS_DEPOSITOS = 'pa_depositos';    // depósitos demo
  var LS_LABORES  = 'pa_labores';       // labores demo
  var LS_TIPOACT  = 'pa_tipo_act';
  var LS_MODOSACC = 'pa_modos_accion';
  var LS_SESION   = 'pa_sesion_activa';
  var LS_SEEDVER  = 'pa_seed_version';

  // Helpers internos originales
  function lsGet(k, def) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : def; } catch(e) { return def; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).substr(2, 9);
  }

  // 2. HELPER ASINCRÓNICO AJAX (ES5) PARA PRODUCCIÓN
  function ejecutarPatchRemote(ruta, claveRaiz, valor) {
    if (esLocalhost) return; // Si está jugando en local, no envía red

    var xhr = new XMLHttpRequest();
    xhr.open('PATCH', API_URL + '/api/json-patch', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    // Manejo de tokens si hubiera sesión en cabecera
    var sesion = lsGet(LS_SESION, null);
    if (sesion && sesion.token) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + sesion.token);
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('📡 Sincronizado exitosamente en base de datos central.');
        } else {
          console.error('❌ Falló la sincronización con el servidor backend.', xhr.responseText);
        }
      }
    };

    xhr.send(JSON.stringify({
      claveRaiz: claveRaiz,
      ruta: ruta,
      valor: valor
    }));
  }

  // OBJETO PRINCIPAL DEL FRAMEWORK
  var PA = {
    init: function (config, callback) {
      if (esLocalhost) {
        console.log('🛒 Puntal Agro: Modo LOCAL (Persistencia en LocalStorage Activa)');
      } else {
        console.log('📡 Puntal Agro: Modo PRODUCCIÓN / DOCKER (Conexión Postgres Activa)');
      }
      if (callback) callback();
    },

    haySesion: function () {
      return !!localStorage.getItem(LS_SESION);
    },

    login: function (email, callback) {
      var u = { id: 'u_1', email: email, nombre: 'Usuario Demo', rol: 'admin_general' };
      localStorage.setItem(LS_SESION, JSON.stringify(u));
      if (callback) callback(null, { usuario: u, empresasDisponibles: lsGet(LS_EMPRESAS, []) });
    },

    loadContext: function (forcedEmpresaId, callback) {
      var u = lsGet(LS_SESION, { rol: 'admin_general' });
      var emps = lsGet(LS_EMPRESAS, [
        { id: 'e_1', nombre: 'Estancia Don Eduardo' },
        { id: 'e_2', nombre: 'Agropecuaria del Litoral' }
      ]);
      if (callback) callback(null, { usuario: u, empresasDisponibles: emps });
    },

    setEmpresaActiva: function (empresaId, callback) {
      if (callback) callback(null, { status: 'ok' });
    }
  };

  // CAPA MAESTROS ADAPTADA CON PERSISTENCIA DUAL
  PA.demo = {
    // --- TERCEROS ---
    getTerceros: function (empresaId) {
      return lsGet(LS_TERCEROS, []);
    },
    guardarTercero: function (t) {
      var ts = lsGet(LS_TERCEROS, []);
      if (!t.id) { t.id = uid('ter'); ts.push(t); }
      else { for (var i = 0; i < ts.length; i++) { if (ts[i].id === t.id) { ts[i] = t; break; } } }
      lsSet(LS_TERCEROS, ts);

      // Bifurcación a la API si está fuera de localhost
      ejecutarPatchRemote('maestros.terceros', 'agroTablerosRoot', ts);
      return t;
    },
    borrarTercero: function (id) {
      var ts = lsGet(LS_TERCEROS, []), out = [];
      for (var i = 0; i < ts.length; i++) { if (ts[i].id !== id) out.push(ts[i]); }
      lsSet(LS_TERCEROS, out);

      ejecutarPatchRemote('maestros.terceros', 'agroTablerosRoot', out);
    },

    // --- LABORES ---
    getLabores: function () {
      return lsGet(LS_LABORES, []);
    },
    guardarLabor: function (m) {
      var ms = lsGet(LS_LABORES, []);
      if (!m.id) { m.id = uid('lab'); ms.push(m); }
      else { var f = false; for (var i = 0; i < ms.length; i++) { if (ms[i].id === m.id) { ms[i] = m; f = true; break; } } if (!f) ms.push(m); }
      lsSet(LS_LABORES, ms);

      ejecutarPatchRemote('maestros.labores', 'agroTablerosRoot', ms);
      return m;
    },

    // --- INTERCEPCIÓN CLAVE PARA TABLEROS (Insumos, OT, Uso del Suelo) ---
    // Esta función intercepta los guardados globales que hacen pantallas como tablero_insumos_ot.html
    sincronizarTableroCompleto: function (claveRaiz, estructuraCompleta) {
      // 1. Guardado local inmediato siempre
      lsSet(claveRaiz, estructuraCompleta);

      // 2. Si no es localhost, manda un parche de la raíz entera al campo JSONB de la BD
      if (!esLocalhost) {
        ejecutarPatchRemote('espacios', claveRaiz, estructuraCompleta.espacios || []);
      }
    },

    resetDemo: function () {
      try {
        localStorage.removeItem(LS_CLIENTES);
        localStorage.removeItem(LS_EMPRESAS);
        localStorage.removeItem(LS_CAMPOS);
        localStorage.removeItem(LS_USUARIOS);
        localStorage.removeItem(LS_PERMISOS);
        localStorage.removeItem(LS_SESION);
        localStorage.removeItem(LS_SEEDVER);
        localStorage.removeItem(LS_TERCEROS);
        localStorage.removeItem(LS_CHOFERES);
        localStorage.removeItem(LS_TIPOPROV);
        localStorage.removeItem(LS_DEPOSITOS);
        localStorage.removeItem(LS_LABORES);
        localStorage.removeItem(LS_TIPOACT);
        localStorage.removeItem(LS_MODOSACC);
        localStorage.removeItem('agroTablerosRoot');
      } catch (e) {}
      global.location.reload();
    }
  };

  global.PA = PA;

})(typeof window !== 'undefined' ? window : this);