/* ============================================================================
   pa-core.js — Capa de acceso Puntal Agro (Parte A del contrato)
   ----------------------------------------------------------------------------
   MODO DEMO / FALLBACK: todo se persiste en localStorage. Sin backend.
   Cuando exista backend, se reemplaza el cuerpo de estas funciones por
   llamadas reales al servidor SIN cambiar las pantallas que las usan.

   Restricciones del proyecto: ES5 estricto (var/function), sin promesas,
   sin arrow functions. Funciones asíncronas con callback function(err, data).
   ============================================================================ */
(function (global) {
  'use strict';

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
  var LS_TIPOACT  = 'pa_tipo_act';      // tipos de actividad (cultivos/usos) demo
  var LS_ESPECIES = 'pa_especies';      // especies/granos (global Puntal)
  var LS_UNIDADES = 'pa_unidades';      // unidades de medida (global Puntal)
  var LS_INSUMOS  = 'pa_insumos';       // insumos (por empresa)
  var LS_MODOSACC = 'pa_modos_acc';     // modos de acción HRAC/IRAC/FRAC (global Puntal)
  var LS_SESION   = 'pa_sesion';        // sesión activa { usuarioId, empresaActivaId }
  var LS_SEEDVER  = 'pa_seed_ver';      // versión del seed demo
  var SEED_VER    = '12';               // subir este número al cambiar la estructura del seed

  // Herramientas PROPIAS (asignable=true): id + nombre legible.
  // Deben coincidir con los data-tool del index y con §5.2 del modelo.
  var HERRAMIENTAS_PROPIAS = [
    { id: 'tablero_agro',       nombre: 'Tablero Comercial Agropecuario' },
    { id: 'tablero_evolucion',  nombre: 'Evolución de Variables' },
    { id: 'tablero_insumos_ot', nombre: 'Registro de Labores e Insumos' },
    { id: 'tablero_uso_suelo',  nombre: 'Plan de Uso del Suelo' },
    { id: 'ProgramaSiembra',    nombre: 'Programa de Siembra' },
    { id: 'tablero_hacienda',   nombre: 'Tablero de Relaciones Ganaderas' },
    { id: 'tablero_labores',    nombre: 'Tarifa de Labores y Fletes' },
    { id: 'Fitosanitarios',     nombre: 'Requerimiento de Fitosanitarios' }
  ];
  function idsHerramientasPropias() {
    var out = [];
    for (var i = 0; i < HERRAMIENTAS_PROPIAS.length; i++) out.push(HERRAMIENTAS_PROPIAS[i].id);
    return out;
  }

  /* ---------- helpers de localStorage ---------- */
  function lsGet(key, def) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function uid(p) {
    return (p || 'id') + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  }

  /* ---------- siembra de datos demo (solo si no hay nada) ---------- */
  function seedDemo() {
    // si ya está sembrado con la versión actual, no hacer nada
    if (lsGet(LS_SEEDVER, null) === SEED_VER && lsGet(LS_USUARIOS, null)) return;

    // limpiar cualquier dato de versiones anteriores para evitar estados inconsistentes
    try {
      localStorage.removeItem(LS_CLIENTES);
      localStorage.removeItem(LS_EMPRESAS);
      localStorage.removeItem(LS_CAMPOS);
      localStorage.removeItem(LS_USUARIOS);
      localStorage.removeItem(LS_PERMISOS);
      localStorage.removeItem(LS_TERCEROS);
      localStorage.removeItem(LS_CHOFERES);
      localStorage.removeItem(LS_TIPOPROV);
      localStorage.removeItem(LS_DEPOSITOS);
      localStorage.removeItem(LS_LABORES);
      localStorage.removeItem(LS_TIPOACT);
      localStorage.removeItem('pa_tipo_lab');
      localStorage.removeItem(LS_ESPECIES);
      localStorage.removeItem(LS_UNIDADES);
      localStorage.removeItem(LS_INSUMOS);
      localStorage.removeItem(LS_MODOSACC);
    } catch (e) {}

    var clientes = [
      { id: 'cli_albor', nombre: 'Grupo Albor', email: 'contacto@albor.com', telefono: '358-400-0000',
        nombreContacto: 'María Pereyra', activo: true, fechaAlta: '2025-01-15',
        cuit: '30-71000000-1', razonSocial: 'Grupo Albor S.A.', direccion: 'Río Cuarto, Córdoba', facturaCentralizada: true },
      { id: 'cli_doneduardo', nombre: 'Agroganadera Don Eduardo', email: 'contacto@doneduardo.com', telefono: '',
        nombreContacto: 'Eduardo', activo: true, fechaAlta: '2025-01-15',
        cuit: '', razonSocial: 'Agroganadera Don Eduardo', direccion: '', facturaCentralizada: false }
    ];
    var empresas = [
      { id: 'emp_albor_sa', clienteId: 'cli_albor', razonSocial: 'Albor Agropecuaria S.A.', cuit: '30-71000000-1', direccion: 'Río Cuarto, Córdoba', condicionIVA: 'RI', activo: true },
      { id: 'emp_lospinos', clienteId: 'cli_albor', razonSocial: 'Los Pinos S.R.L.', cuit: '30-71000111-2', direccion: 'General Cabrera, Córdoba', condicionIVA: 'RI', activo: true },
      { id: 'emp_doneduardo', clienteId: 'cli_doneduardo', razonSocial: 'Agroganadera Don Eduardo', cuit: '', direccion: '', condicionIVA: 'RI', activo: true }
    ];
    var campos = [
      { id: 'campo_elpuntal', empresaId: 'emp_albor_sa', nombre: 'El Puntal', localidad: 'Río Cuarto', partido: 'Río Cuarto', provincia: 'Córdoba', haTotales: 850 },
      { id: 'campo_laloma',  empresaId: 'emp_albor_sa', nombre: 'La Loma', localidad: 'Las Higueras', partido: 'Río Cuarto', provincia: 'Córdoba', haTotales: 420 },
      { id: 'campo_sanjose', empresaId: 'emp_lospinos', nombre: 'San José', localidad: 'General Cabrera', partido: 'Juárez Celman', provincia: 'Córdoba', haTotales: 610 },
      { id: 'campo_ec', empresaId: 'emp_doneduardo', nombre: 'EC', localidad: '', partido: '', provincia: '', haTotales: 0 },
      { id: 'campo_em', empresaId: 'emp_doneduardo', nombre: 'EM', localidad: '', partido: '', provincia: '', haTotales: 0 },
      { id: 'campo_lr', empresaId: 'emp_doneduardo', nombre: 'LR', localidad: '', partido: '', provincia: '', haTotales: 0 },
      { id: 'campo_lm', empresaId: 'emp_doneduardo', nombre: 'LM', localidad: '', partido: '', provincia: '', haTotales: 0 }
    ];
    var usuarios = [
      { id: 'usr_admin', nombre: 'Admin Puntal', email: 'admin@puntal.com', rol: 'admin_general', clienteId: null },
      { id: 'usr_maria', nombre: 'María Pereyra', email: 'maria@albor.com', rol: 'admin_cliente', clienteId: 'cli_albor' },
      { id: 'usr_jose',  nombre: 'José Gómez', email: 'jose@albor.com', rol: 'usuario', clienteId: 'cli_albor' },
      { id: 'usr_ana',   nombre: 'Ana Ruiz', email: 'ana@albor.com', rol: 'usuario', clienteId: 'cli_albor' },
      { id: 'usr_eduardo', nombre: 'Eduardo', email: 'eduardo@doneduardo.com', rol: 'admin_cliente', clienteId: 'cli_doneduardo' }
    ];
    var permisos = [
      { usuarioId: 'usr_maria', empresaId: 'emp_albor_sa', campoIds: [],
        herramientas: ['tablero_agro', 'tablero_insumos_ot', 'tablero_uso_suelo', 'Fitosanitarios'], nivel: 'administrar' },
      { usuarioId: 'usr_maria', empresaId: 'emp_lospinos', campoIds: [],
        herramientas: ['tablero_insumos_ot', 'tablero_uso_suelo'], nivel: 'cargar' },
      { usuarioId: 'usr_jose', empresaId: 'emp_albor_sa', campoIds: ['campo_elpuntal'],
        herramientas: ['tablero_insumos_ot', 'tablero_uso_suelo'], nivel: 'cargar' },
      { usuarioId: 'usr_ana', empresaId: 'emp_albor_sa', campoIds: [],
        herramientas: ['tablero_agro'], nivel: 'ver' },
      { usuarioId: 'usr_eduardo', empresaId: 'emp_doneduardo', campoIds: [],
        herramientas: ['tablero_agro', 'tablero_insumos_ot', 'tablero_uso_suelo', 'Fitosanitarios'], nivel: 'administrar' }
    ];
    var tiposProv = [
      { id: 'tp_transp', nombre: 'transportista' },
      { id: 'tp_contrat', nombre: 'contratista' },
      { id: 'tp_serv', nombre: 'prestador de servicios' },
      { id: 'tp_insumos', nombre: 'insumos' }
    ];
    var terceros = [
      { id: 'ter_agro', empresaId: 'emp_albor_sa', nombre: 'Agroinsumos del Centro', cuit: '30-60000000-7', telefono: '358-444-0000', email: '', direccion: 'Río Cuarto',
        esProveedor: true, esCliente: false, tiposProveedor: ['insumos', 'transportista'], activo: true },
      { id: 'ter_acopio', empresaId: 'emp_albor_sa', nombre: 'Acopio San Martín', cuit: '30-65000000-4', telefono: '358-466-0000', email: '', direccion: 'Las Higueras',
        esProveedor: false, esCliente: true, tiposProveedor: [], activo: true },
      { id: 'ter_gomez', empresaId: 'emp_albor_sa', nombre: 'Servicios Gómez', cuit: '20-20000000-3', telefono: '351-555-0000', email: '', direccion: 'Río Cuarto',
        esProveedor: true, esCliente: false, tiposProveedor: ['contratista'], activo: true }
    ];
    var choferes = [
      { id: 'cho_perez', empresaId: 'emp_albor_sa', terceroId: 'ter_agro', nombre: 'Juan Pérez', dni: '25000000', licencia: 'E1', activo: true }
    ];
    var depositos = [
      { id: 'dep_central', empresaId: 'emp_albor_sa', campoId: null, nombre: 'Depósito central', clase: 'insumos', especieId: null, activo: true },
      { id: 'dep_puntal', empresaId: 'emp_albor_sa', campoId: 'campo_elpuntal', nombre: 'Galpón El Puntal', clase: 'insumos', especieId: null, activo: true }
    ];
    var laboresBase = ['Siembra','Pulv. Terrestre','Pulv. Aérea','Desmalezado','Corte-hilerado','Enrrollado',
      'Embolsado','Extracción bolsa','Clasificación semillas','Elaboración ración','Distribución ración',
      'Gerenciamiento','Fertilización líquida','Monitoreos','Acarreos','Labor Fardos','Disco-Rastra-Rolo',
      'Fertilización voleo','Rolo triturador'];
    var labores = [];
    for (var li=0; li<laboresBase.length; li++){ labores.push({ id: 'lab_'+li, nombre: laboresBase[li], precioRef: 0, activo: true }); }
    var especiesBase = [
      ['Soja','Sj'], ['Maíz','Mz'], ['Trigo','Tr'], ['Sorgo','Sg'],
      ['Girasol','G'], ['Cebada','Cb'], ['Avena','Av'], ['Maíz Planta Entera','MzPE']
    ];
    var especies = [];
    for (var ei=0; ei<especiesBase.length; ei++){
      especies.push({ id: 'esp_'+ei, nombre: especiesBase[ei][0], sigla: especiesBase[ei][1], activo: true });
    }
    function espId(nombre){ for(var k=0;k<especies.length;k++){ if(especies[k].nombre===nombre) return especies[k].id; } return null; }

    var unidadesBase = [
      ['kg','Kilogramo'], ['g','Gramo'], ['tn','Tonelada'], ['l','Litro'], ['ml','Mililitro'],
      ['cm³','Centímetro cúbico'], ['bolsa','Bolsa'], ['caja','Caja'], ['u','Unidad'], ['dosis','Dosis']
    ];
    var unidades = [];
    for (var ui=0; ui<unidadesBase.length; ui++){
      unidades.push({ id: 'uni_'+ui, sigla: unidadesBase[ui][0], nombre: unidadesBase[ui][1], activo: true });
    }

    var tiposAct = [];
    var cultivosBase = [
      ['Trigo','Tr','AGR','Trigo'],['Cebada','Cb','AGR','Cebada'],['Avena','Av','AGR','Avena'],['Girasol','G','AGR','Girasol'],
      ['Maíz','Mz','AGR','Maíz'],['Maíz Tardío','MzT','AGR','Maíz'],['Maíz 2ª','Mz2ª','AGR','Maíz'],['Maíz Silo PE','MzSPE','AGR','Maíz Planta Entera'],
      ['Soja 1ª','Sj1ª','AGR','Soja'],['Soja 2ª','Sj2ª','AGR','Soja'],['Cultivo de cobertura','Ccob','AGR',null],['Sorgo','Sg','AGR','Sorgo'],
      ['Verdeo invierno','VI','GAN',null],['Maíz pastoreo','MzP','GAN',null],['Sorgo forrajero','SgF','GAN',null],
      ['Maíz pastoreo diferido','MzD','GAN',null],['Sorgo pastoreo diferido','SgD','GAN',null],['Promoción Rye Grass','PRG','GAN',null],
      ['Pradera impl.','PI','GAN',null],['Pradera festuca','PPFe','GAN',null],['Pradera alfalfa','PPAlf','GAN',null],
      ['Pradera agropiro','PPAg','GAN',null],['Pradera degradada','PD','GAN',null],['Campo natural','CN','GAN',null],
      ['Campo natural degradado','CND','GAN',null]
    ];
    var empresasConCultivos = ['emp_albor_sa', 'emp_doneduardo'];
    var taIdx = 0;
    for (var ee=0; ee<empresasConCultivos.length; ee++){
      for (var ci=0; ci<cultivosBase.length; ci++){
        tiposAct.push({ id: 'ta_'+taIdx, empresaId: empresasConCultivos[ee], nombre: cultivosBase[ci][0], sigla: cultivosBase[ci][1], actividad: cultivosBase[ci][2], especieId: cultivosBase[ci][3] ? espId(cultivosBase[ci][3]) : null, activo: true });
        taIdx++;
      }
    }

    // Modos de acción HRAC / IRAC / FRAC (global Puntal, editable)
    var modosBase = [
      // HRAC (herbicidas) — código de mecanismo
      ['HRAC','ACCasa','Inhibidores de la acetil coenzima-A carboxilasa (ACCasa)'],
      ['HRAC','ALSSulf','Inhibidores de la enzima acetolactato sintetasa (ALS)-Sulfonilureas'],
      ['HRAC','ALSIMI','Inhibidores de la enzima acetolactato sintetasa (ALS)-Imidazolinonas'],
      ['HRAC','InhF2','Inhibidores de la fotosíntesis en el fotosistema II'],
      ['HRAC','InhF1','Inhibidores fotosistema I'],
      ['HRAC','PPO','Inhibidores de la enzima protoporfirinógeno oxidasa (PPO)'],
      ['HRAC','HPPD','Inhibidores de la biosíntesis de carotenoides (HPPD)'],
      ['HRAC','EPSPS','Inhibidores de la enzima 5-enolpiruvilshikimato-3-fosfato sintetasa (EPSPS)'],
      ['HRAC','IGS','Inhibidores de la glutamino sintetasa'],
      ['HRAC','DHPs','Inhibidores de la 7,8-dihidropteroato sintetasa (DHPs)'],
      ['HRAC','IDC','Inhibidores de la división celular'],
      ['HRAC','ISC','Inhibidores de la síntesis de celulosa'],
      ['HRAC','ISL','Inhibidores de la síntesis de lípidos'],
      ['HRAC','AuxSin','Acción similar al ácido indol acético (auxinas sintéticas)'],
      ['HRAC','ITA','Inhibidores del transporte de auxinas'],
      ['HRAC','H-MOAD','Modo de acción desconocido'],
      // IRAC (insecticidas) — número
      ['IRAC','1','Inhibidores de la acetilcolinesterasa'],
      ['IRAC','2','Antagonistas de canales de sodio'],
      ['IRAC','3','Moduladores del canal de sodio'],
      ['IRAC','4','Moduladores competitivos del receptor nicotínico de la acetilcolina'],
      ['IRAC','5','Moduladores alostéricos del receptor nicotínico de la acetilcolina'],
      ['IRAC','6','Moduladores alostéricos del canal de cloro dependiente del glutamato'],
      ['IRAC','7','Miméticos de la hormona juvenil'],
      ['IRAC','8','Diversos inhibidores no específicos (multisitio)'],
      ['IRAC','9','Moduladores del canal TRPV de los órganos cordotonales'],
      ['IRAC','10','Inhibidores del crecimiento de ácaros'],
      ['IRAC','11','Disruptores microbianos de las membranas digestivas de insectos'],
      ['IRAC','12','Inhibidores de ATP sintetasa'],
      ['IRAC','13','Desacopladores de la fosforilación oxidativa vía interrupción del gradiente de protones'],
      ['IRAC','14','Bloqueadores del canal del receptor de acetilcolina'],
      ['IRAC','15','Inhibidores de la biosíntesis de quitina, Tipo 0'],
      ['IRAC','16','Inhibidores de la biosíntesis de quitina, Tipo 1'],
      ['IRAC','17','Disruptores de la hormona de la muda. Dípteros'],
      ['IRAC','18','Agonistas del receptor de ecdisona'],
      ['IRAC','19','Antagonistas de los receptores de la octopamina'],
      ['IRAC','20','Inhibidores del transporte de electrones en el complejo mitocondrial III'],
      ['IRAC','21','Inhibidores del transporte de electrones en el complejo mitocondrial I'],
      ['IRAC','22','Bloqueadores del canal de sodio dependiente del voltaje'],
      ['IRAC','23','Inhibidores de la acetil CoA carboxilasa'],
      ['IRAC','24','Inhibidores del transporte de electrones en el complejo mitocondrial IV'],
      ['IRAC','25','Inhibidores del transporte de electrones en el complejo mitocondrial II'],
      ['IRAC','28','Moduladores del receptor de la rianodina'],
      ['IRAC','29','Moduladores de los órganos cordonales sin punto de acción definido'],
      ['IRAC','30','Antagonista canal clórico del receptor de ácido gamma-aminobutírico (GABA)'],
      ['IRAC','F-MOAD','Compuestos de modo de acción desconocido o incierto'],
      // FRAC (fungicidas) — letra de grupo
      ['FRAC','A','Metabolismo de ácidos nucleicos'],
      ['FRAC','B','Citoesqueleto y proteínas motoras'],
      ['FRAC','C','Respiración'],
      ['FRAC','D','Síntesis de aminoácidos y proteínas'],
      ['FRAC','E','Señal de transducción'],
      ['FRAC','F','Síntesis o transporte de lípidos (función o integridad de la membrana)'],
      ['FRAC','G','Biosíntesis de esterol en las membranas'],
      ['FRAC','H','Biosíntesis de pared celular'],
      ['FRAC','I','Síntesis de melanina en la pared celular'],
      ['FRAC','M','Químicos con actividad multisitio'],
      ['FRAC','P','Inducción de la defensa de la planta huésped'],
      ['FRAC','BM','Biológicos con múltiples modos de acción'],
      ['FRAC','F-MOAD','Modo de acción desconocido']
    ];
    var modosAcc = [];
    for (var mi=0; mi<modosBase.length; mi++){
      modosAcc.push({ id: 'moa_'+mi, sistema: modosBase[mi][0], codigo: modosBase[mi][1], descripcion: modosBase[mi][2], activo: true });
    }
    function moaId(sistema, codigo){ for(var k=0;k<modosAcc.length;k++){ if(modosAcc[k].sistema===sistema && modosAcc[k].codigo===codigo) return modosAcc[k].id; } return null; }

    var insumos = [
      { id: 'ins_glifo', empresaId: 'emp_albor_sa', activo: true, nombre: 'Glifosato 48%', tipo: 'Herbicida', unidadId: 'uni_3',
        modoAccionId: moaId('HRAC','EPSPS'), bandaTox: 'IV', eiq: 15.33, concentracion: 480, concUnidad: 'g/l', nutrientes: null },
      { id: 'ins_ciper', empresaId: 'emp_albor_sa', activo: true, nombre: 'Cipermetrina 25%', tipo: 'Insecticida', unidadId: 'uni_3',
        modoAccionId: moaId('IRAC','3'), bandaTox: 'II', eiq: 38.10, concentracion: 250, concUnidad: 'g/l', nutrientes: null },
      { id: 'ins_uan', empresaId: 'emp_albor_sa', activo: true, nombre: 'UAN 32', tipo: 'Fertilizante', unidadId: 'uni_3',
        modoAccionId: null, bandaTox: '', eiq: null, concentracion: null, concUnidad: '', nutrientes: { n: 32, p: 0, k: 0, s: 0 } },
      { id: 'ins_sojasem', empresaId: 'emp_albor_sa', activo: true, nombre: 'Semilla soja DM 46i17', tipo: 'Semilla', unidadId: 'uni_0',
        modoAccionId: null, bandaTox: '', eiq: null, concentracion: null, concUnidad: '', nutrientes: null }
    ];
    lsSet(LS_CLIENTES, clientes);
    lsSet(LS_EMPRESAS, empresas);
    lsSet(LS_CAMPOS, campos);
    lsSet(LS_USUARIOS, usuarios);
    lsSet(LS_PERMISOS, permisos);
    lsSet(LS_TIPOPROV, tiposProv);
    lsSet(LS_TERCEROS, terceros);
    lsSet(LS_CHOFERES, choferes);
    lsSet(LS_DEPOSITOS, depositos);
    lsSet(LS_LABORES, labores);
    lsSet(LS_TIPOACT, tiposAct);
    lsSet(LS_ESPECIES, especies);
    lsSet(LS_UNIDADES, unidades);
    lsSet(LS_INSUMOS, insumos);
    lsSet(LS_MODOSACC, modosAcc);
    lsSet(LS_SEEDVER, SEED_VER);
  }

  /* ---------- estado en memoria del contexto activo ---------- */
  var _ctx = null;

  var PA = {};

  /* PA.init(opts, cb) — en demo solo siembra datos y queda listo */
  PA.init = function (opts, cb) {
    seedDemo();
    if (cb) cb(null);
  };

  /* PA.login(email, cb) — valida usuario (demo: sin contraseña real) */
  PA.login = function (email, cb) {
    seedDemo();
    var usuarios = lsGet(LS_USUARIOS, []);
    var u = null;
    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].email.toLowerCase() === String(email || '').toLowerCase()) { u = usuarios[i]; break; }
    }
    if (!u) { cb('Usuario no encontrado'); return; }

    // empresa activa por defecto: la primera a la que tiene acceso
    var disp = empresasDisponibles(u);
    if (!disp.length) { cb('El usuario no tiene empresas asignadas'); return; }

    lsSet(LS_SESION, { usuarioId: u.id, empresaActivaId: disp[0].id });
    cb(null, u);
  };

  /* PA.logout() */
  PA.logout = function () {
    try { localStorage.removeItem(LS_SESION); } catch (e) {}
    _ctx = null;
  };

  /* PA.haySesion() -> bool */
  PA.haySesion = function () {
    return !!lsGet(LS_SESION, null);
  };

  /* empresas a las que un usuario tiene acceso */
  function empresasDisponibles(usuario) {
    var empresas = lsGet(LS_EMPRESAS, []);
    if (usuario.rol === 'admin_general') return empresas.slice(); // todas
    var permisos = lsGet(LS_PERMISOS, []);
    var idsConPermiso = {};
    for (var i = 0; i < permisos.length; i++) {
      if (permisos[i].usuarioId === usuario.id) idsConPermiso[permisos[i].empresaId] = true;
    }
    var out = [];
    for (var j = 0; j < empresas.length; j++) {
      if (idsConPermiso[empresas[j].id]) out.push(empresas[j]);
    }
    return out;
  }

  /* arma el permiso del usuario para una empresa */
  function permisoPara(usuario, empresaId) {
    if (usuario.rol === 'admin_general') {
      // acceso total: todas las herramientas propias, todos los campos, administrar
      return { empresaId: empresaId, campoIds: [], herramientas: idsHerramientasPropias(), nivel: 'administrar' };
    }
    var permisos = lsGet(LS_PERMISOS, []);
    for (var i = 0; i < permisos.length; i++) {
      if (permisos[i].usuarioId === usuario.id && permisos[i].empresaId === empresaId) return permisos[i];
    }
    return null;
  }

  /* PA.loadContext(empresaId, cb) — devuelve el CTX (Parte A del contrato) */
  PA.loadContext = function (empresaId, cb) {
    var ses = lsGet(LS_SESION, null);
    if (!ses) { cb('Sin sesión'); return; }
    var usuarios = lsGet(LS_USUARIOS, []);
    var u = null;
    for (var i = 0; i < usuarios.length; i++) { if (usuarios[i].id === ses.usuarioId) { u = usuarios[i]; break; } }
    if (!u) { cb('Sesión inválida'); return; }

    var empAct = empresaId || ses.empresaActivaId;
    var disp = empresasDisponibles(u);
    // si la empresa pedida no está disponible, cae a la primera
    var ok = false;
    for (var k = 0; k < disp.length; k++) { if (disp[k].id === empAct) { ok = true; break; } }
    if (!ok && disp.length) empAct = disp[0].id;

    // persistir empresa activa
    ses.empresaActivaId = empAct;
    lsSet(LS_SESION, ses);

    _ctx = {
      usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol },
      clienteId: u.clienteId,
      empresaActivaId: empAct,
      empresasDisponibles: disp,
      permiso: permisoPara(u, empAct)
    };
    cb(null, _ctx);
  };

  /* PA.ctx() — acceso síncrono al contexto ya cargado */
  PA.ctx = function () { return _ctx; };

  /* PA.setEmpresaActiva(empresaId, cb) — cambia de empresa y recarga ctx */
  PA.setEmpresaActiva = function (empresaId, cb) {
    PA.loadContext(empresaId, cb);
  };

  /* PA.can(accion, opts) — chequeo síncrono de permiso (Parte A) */
  var ORDEN = { ver: 1, cargar: 2, administrar: 3 };
  PA.can = function (accion, opts) {
    if (!_ctx || !_ctx.permiso) return false;
    var p = _ctx.permiso;
    // nivel
    if ((ORDEN[p.nivel] || 0) < (ORDEN[accion] || 99)) return false;
    opts = opts || {};
    // herramienta
    if (opts.herramienta) {
      var hok = false;
      for (var i = 0; i < p.herramientas.length; i++) { if (p.herramientas[i] === opts.herramienta) { hok = true; break; } }
      if (!hok) return false;
    }
    // campo (campoIds vacío = todos)
    if (opts.campoId && p.campoIds && p.campoIds.length) {
      var cok = false;
      for (var j = 0; j < p.campoIds.length; j++) { if (p.campoIds[j] === opts.campoId) { cok = true; break; } }
      if (!cok) return false;
    }
    return true;
  };

  /* ---------- ABM de usuarios/permisos en demo (para la pantalla usuarios.html) ---------- */
  PA.demo = {
    listarUsuarios: function () { return lsGet(LS_USUARIOS, []); },
    listarEmpresas: function () { return lsGet(LS_EMPRESAS, []); },
    listarPermisos: function () { return lsGet(LS_PERMISOS, []); },
    herramientasPropias: function () { return HERRAMIENTAS_PROPIAS.slice(); },

    // Usuarios que el usuario logueado puede ver/gestionar.
    // admin_general: todos. admin_cliente: solo los de su clienteId. usuario: ninguno.
    usuariosVisibles: function () {
      var ctx = _ctx;
      var us = lsGet(LS_USUARIOS, []);
      if (!ctx) return us; // sin contexto (demo directo) -> no filtra
      if (ctx.usuario.rol === 'admin_general') return us;
      if (ctx.usuario.rol === 'admin_cliente') {
        var out = [];
        for (var i = 0; i < us.length; i++) {
          if (us[i].clienteId === ctx.clienteId) out.push(us[i]);
        }
        return out;
      }
      return [];
    },
    // Empresas que el usuario logueado puede ver (para los selectores de permiso).
    empresasVisibles: function () {
      var ctx = _ctx;
      var es = lsGet(LS_EMPRESAS, []);
      if (!ctx || ctx.usuario.rol === 'admin_general') return es;
      if (ctx.usuario.rol === 'admin_cliente') {
        var out = [];
        for (var i = 0; i < es.length; i++) {
          if (es[i].clienteId === ctx.clienteId) out.push(es[i]);
        }
        return out;
      }
      return [];
    },

    buscarPermiso: function (usuarioId, empresaId) {
      var ps = lsGet(LS_PERMISOS, []);
      for (var i = 0; i < ps.length; i++) {
        if (ps[i].usuarioId === usuarioId && ps[i].empresaId === empresaId) return ps[i];
      }
      return null;
    },

    guardarUsuario: function (u) {
      var us = lsGet(LS_USUARIOS, []);
      if (!u.id) { u.id = uid('usr'); us.push(u); }
      else {
        var found = false;
        for (var i = 0; i < us.length; i++) { if (us[i].id === u.id) { us[i] = u; found = true; break; } }
        if (!found) us.push(u);
      }
      lsSet(LS_USUARIOS, us);
      return u;
    },
    borrarUsuario: function (id) {
      var us = lsGet(LS_USUARIOS, []), out = [];
      for (var i = 0; i < us.length; i++) { if (us[i].id !== id) out.push(us[i]); }
      lsSet(LS_USUARIOS, out);
      // borrar sus permisos
      var ps = lsGet(LS_PERMISOS, []), outp = [];
      for (var j = 0; j < ps.length; j++) { if (ps[j].usuarioId !== id) outp.push(ps[j]); }
      lsSet(LS_PERMISOS, outp);
    },
    guardarPermiso: function (perm) {
      // perm: {usuarioId, empresaId, campoIds, herramientas, nivel}
      var ps = lsGet(LS_PERMISOS, []);
      var found = false;
      for (var i = 0; i < ps.length; i++) {
        if (ps[i].usuarioId === perm.usuarioId && ps[i].empresaId === perm.empresaId) { ps[i] = perm; found = true; break; }
      }
      if (!found) ps.push(perm);
      lsSet(LS_PERMISOS, ps);
      return perm;
    },
    borrarPermiso: function (usuarioId, empresaId) {
      var ps = lsGet(LS_PERMISOS, []), out = [];
      for (var i = 0; i < ps.length; i++) {
        if (!(ps[i].usuarioId === usuarioId && ps[i].empresaId === empresaId)) out.push(ps[i]);
      }
      lsSet(LS_PERMISOS, out);
    },

    /* ---- ABM estructura: Cliente / Empresa / Campo ---- */
    listarClientes: function () { return lsGet(LS_CLIENTES, []); },
    listarCampos: function () { return lsGet(LS_CAMPOS, []); },
    empresasDeCliente: function (clienteId) {
      var es = lsGet(LS_EMPRESAS, []), out = [];
      for (var i = 0; i < es.length; i++) { if (es[i].clienteId === clienteId) out.push(es[i]); }
      return out;
    },
    camposDeEmpresa: function (empresaId) {
      var cs = lsGet(LS_CAMPOS, []), out = [];
      for (var i = 0; i < cs.length; i++) { if (cs[i].empresaId === empresaId) out.push(cs[i]); }
      return out;
    },
    guardarCliente: function (c) {
      var cs = lsGet(LS_CLIENTES, []);
      if (!c.id) { c.id = uid('cli'); cs.push(c); }
      else { var f=false; for (var i=0;i<cs.length;i++){ if(cs[i].id===c.id){cs[i]=c;f=true;break;} } if(!f) cs.push(c); }
      lsSet(LS_CLIENTES, cs); return c;
    },
    guardarEmpresa: function (e) {
      var es = lsGet(LS_EMPRESAS, []);
      if (!e.id) { e.id = uid('emp'); es.push(e); }
      else { var f=false; for (var i=0;i<es.length;i++){ if(es[i].id===e.id){es[i]=e;f=true;break;} } if(!f) es.push(e); }
      lsSet(LS_EMPRESAS, es); return e;
    },
    guardarCampo: function (k) {
      var ks = lsGet(LS_CAMPOS, []);
      if (!k.id) { k.id = uid('campo'); ks.push(k); }
      else { var f=false; for (var i=0;i<ks.length;i++){ if(ks[i].id===k.id){ks[i]=k;f=true;break;} } if(!f) ks.push(k); }
      lsSet(LS_CAMPOS, ks); return k;
    },
    borrarCliente: function (id) {
      // borra cliente + sus empresas + campos de esas empresas (cascada demo)
      var cs = lsGet(LS_CLIENTES, []), outc = [];
      for (var i=0;i<cs.length;i++){ if(cs[i].id!==id) outc.push(cs[i]); }
      lsSet(LS_CLIENTES, outc);
      var es = lsGet(LS_EMPRESAS, []), empIds = {}, oute = [];
      for (var j=0;j<es.length;j++){ if(es[j].clienteId===id) empIds[es[j].id]=true; else oute.push(es[j]); }
      lsSet(LS_EMPRESAS, oute);
      var ks = lsGet(LS_CAMPOS, []), outk = [];
      for (var m=0;m<ks.length;m++){ if(!empIds[ks[m].empresaId]) outk.push(ks[m]); }
      lsSet(LS_CAMPOS, outk);
    },
    borrarEmpresa: function (id) {
      var es = lsGet(LS_EMPRESAS, []), oute = [];
      for (var i=0;i<es.length;i++){ if(es[i].id!==id) oute.push(es[i]); }
      lsSet(LS_EMPRESAS, oute);
      var ks = lsGet(LS_CAMPOS, []), outk = [];
      for (var j=0;j<ks.length;j++){ if(ks[j].empresaId!==id) outk.push(ks[j]); }
      lsSet(LS_CAMPOS, outk);
    },
    borrarCampo: function (id) {
      var ks = lsGet(LS_CAMPOS, []), out = [];
      for (var i=0;i<ks.length;i++){ if(ks[i].id!==id) out.push(ks[i]); }
      lsSet(LS_CAMPOS, out);
    },

    /* ---- ABM Terceros (proveedores y clientes) ---- */
    listarTiposProveedor: function () { return lsGet(LS_TIPOPROV, []); },
    // terceros de una empresa, con filtro opcional por rol: 'proveedor'|'cliente'|tipoProveedor
    listarTerceros: function (empresaId, filtroRol) {
      var ts = lsGet(LS_TERCEROS, []), out = [];
      for (var i = 0; i < ts.length; i++) {
        if (ts[i].empresaId !== empresaId) continue;
        if (filtroRol === 'proveedor' && !ts[i].esProveedor) continue;
        if (filtroRol === 'cliente' && !ts[i].esCliente) continue;
        if (filtroRol && filtroRol !== 'proveedor' && filtroRol !== 'cliente') {
          // filtro por tipo de proveedor
          var tp = ts[i].tiposProveedor || [];
          var ok = false;
          for (var j = 0; j < tp.length; j++) { if (tp[j] === filtroRol) { ok = true; break; } }
          if (!ok) continue;
        }
        out.push(ts[i]);
      }
      return out;
    },
    guardarTercero: function (t) {
      var ts = lsGet(LS_TERCEROS, []);
      if (!t.id) { t.id = uid('ter'); ts.push(t); }
      else { var f=false; for (var i=0;i<ts.length;i++){ if(ts[i].id===t.id){ts[i]=t;f=true;break;} } if(!f) ts.push(t); }
      lsSet(LS_TERCEROS, ts); return t;
    },
    borrarTercero: function (id) {
      var ts = lsGet(LS_TERCEROS, []), out = [];
      for (var i=0;i<ts.length;i++){ if(ts[i].id!==id) out.push(ts[i]); }
      lsSet(LS_TERCEROS, out);
      // borrar choferes que colgaban de ese tercero
      var cs = lsGet(LS_CHOFERES, []), outc = [];
      for (var j=0;j<cs.length;j++){ if(cs[j].terceroId!==id) outc.push(cs[j]); }
      lsSet(LS_CHOFERES, outc);
    },
    // choferes de un tercero (o de toda la empresa si no se pasa terceroId)
    listarChoferes: function (empresaId, terceroId) {
      var cs = lsGet(LS_CHOFERES, []), out = [];
      for (var i=0;i<cs.length;i++){
        if (cs[i].empresaId !== empresaId) continue;
        if (terceroId && cs[i].terceroId !== terceroId) continue;
        out.push(cs[i]);
      }
      return out;
    },
    guardarChofer: function (c) {
      var cs = lsGet(LS_CHOFERES, []);
      if (!c.id) { c.id = uid('cho'); cs.push(c); }
      else { var f=false; for (var i=0;i<cs.length;i++){ if(cs[i].id===c.id){cs[i]=c;f=true;break;} } if(!f) cs.push(c); }
      lsSet(LS_CHOFERES, cs); return c;
    },
    borrarChofer: function (id) {
      var cs = lsGet(LS_CHOFERES, []), out = [];
      for (var i=0;i<cs.length;i++){ if(cs[i].id!==id) out.push(cs[i]); }
      lsSet(LS_CHOFERES, out);
    },

    /* ---- ABM Depósitos ---- */
    listarDepositos: function (empresaId) {
      var ds = lsGet(LS_DEPOSITOS, []), out = [];
      for (var i=0;i<ds.length;i++){ if(ds[i].empresaId===empresaId) out.push(ds[i]); }
      return out;
    },
    guardarDeposito: function (d) {
      var ds = lsGet(LS_DEPOSITOS, []);
      if (!d.id) { d.id = uid('dep'); ds.push(d); }
      else { var f=false; for(var i=0;i<ds.length;i++){ if(ds[i].id===d.id){ds[i]=d;f=true;break;} } if(!f) ds.push(d); }
      lsSet(LS_DEPOSITOS, ds); return d;
    },
    borrarDeposito: function (id) {
      var ds=lsGet(LS_DEPOSITOS, []), out=[];
      for(var i=0;i<ds.length;i++){ if(ds[i].id!==id) out.push(ds[i]); }
      lsSet(LS_DEPOSITOS, out);
    },

    /* ---- ABM Labores (global Puntal) ---- */
    listarLabores: function () { return lsGet(LS_LABORES, []); },
    guardarLabor: function (l) {
      var ls = lsGet(LS_LABORES, []);
      if (!l.id) { l.id = uid('lab'); ls.push(l); }
      else { var f=false; for(var i=0;i<ls.length;i++){ if(ls[i].id===l.id){ls[i]=l;f=true;break;} } if(!f) ls.push(l); }
      lsSet(LS_LABORES, ls); return l;
    },
    borrarLabor: function (id) {
      var ls=lsGet(LS_LABORES, []), out=[];
      for(var i=0;i<ls.length;i++){ if(ls[i].id!==id) out.push(ls[i]); }
      lsSet(LS_LABORES, out);
    },

    /* ---- ABM Tipos de actividad (cultivos/usos) ---- */
    listarTiposActividad: function (empresaId) {
      var ts = lsGet(LS_TIPOACT, []), out = [];
      for (var i=0;i<ts.length;i++){ if(ts[i].empresaId===empresaId) out.push(ts[i]); }
      return out;
    },
    guardarTipoActividad: function (t) {
      var ts = lsGet(LS_TIPOACT, []);
      if (!t.id) { t.id = uid('ta'); ts.push(t); }
      else { var f=false; for(var i=0;i<ts.length;i++){ if(ts[i].id===t.id){ts[i]=t;f=true;break;} } if(!f) ts.push(t); }
      lsSet(LS_TIPOACT, ts); return t;
    },
    borrarTipoActividad: function (id) {
      var ts=lsGet(LS_TIPOACT, []), out=[];
      for(var i=0;i<ts.length;i++){ if(ts[i].id!==id) out.push(ts[i]); }
      lsSet(LS_TIPOACT, out);
    },

    /* ---- ABM Especies / Granos (global Puntal) ---- */
    listarEspecies: function () { return lsGet(LS_ESPECIES, []); },
    guardarEspecie: function (e) {
      var es = lsGet(LS_ESPECIES, []);
      if (!e.id) { e.id = uid('esp'); es.push(e); }
      else { var f=false; for(var i=0;i<es.length;i++){ if(es[i].id===e.id){es[i]=e;f=true;break;} } if(!f) es.push(e); }
      lsSet(LS_ESPECIES, es); return e;
    },
    borrarEspecie: function (id) {
      var es=lsGet(LS_ESPECIES, []), out=[];
      for(var i=0;i<es.length;i++){ if(es[i].id!==id) out.push(es[i]); }
      lsSet(LS_ESPECIES, out);
    },

    /* ---- ABM Unidades de medida (global Puntal) ---- */
    listarUnidades: function () { return lsGet(LS_UNIDADES, []); },
    guardarUnidad: function (u) {
      var us = lsGet(LS_UNIDADES, []);
      if (!u.id) { u.id = uid('uni'); us.push(u); }
      else { var f=false; for(var i=0;i<us.length;i++){ if(us[i].id===u.id){us[i]=u;f=true;break;} } if(!f) us.push(u); }
      lsSet(LS_UNIDADES, us); return u;
    },
    borrarUnidad: function (id) {
      var us=lsGet(LS_UNIDADES, []), out=[];
      for(var i=0;i<us.length;i++){ if(us[i].id!==id) out.push(us[i]); }
      lsSet(LS_UNIDADES, out);
    },

    /* ---- ABM Insumos (por empresa) ---- */
    listarInsumos: function (empresaId) {
      var is = lsGet(LS_INSUMOS, []), out = [];
      for (var i=0;i<is.length;i++){ if(is[i].empresaId===empresaId) out.push(is[i]); }
      return out;
    },
    guardarInsumo: function (x) {
      var is = lsGet(LS_INSUMOS, []);
      if (!x.id) { x.id = uid('ins'); is.push(x); }
      else { var f=false; for(var i=0;i<is.length;i++){ if(is[i].id===x.id){is[i]=x;f=true;break;} } if(!f) is.push(x); }
      lsSet(LS_INSUMOS, is); return x;
    },
    borrarInsumo: function (id) {
      var is=lsGet(LS_INSUMOS, []), out=[];
      for(var i=0;i<is.length;i++){ if(is[i].id!==id) out.push(is[i]); }
      lsSet(LS_INSUMOS, out);
    },

    /* ---- ABM Modos de acción HRAC/IRAC/FRAC (global Puntal) ---- */
    listarModosAccion: function (sistema) {
      var ms = lsGet(LS_MODOSACC, []);
      if (!sistema) return ms;
      var out=[]; for(var i=0;i<ms.length;i++){ if(ms[i].sistema===sistema) out.push(ms[i]); } return out;
    },
    guardarModoAccion: function (m) {
      var ms = lsGet(LS_MODOSACC, []);
      if (!m.id) { m.id = uid('moa'); ms.push(m); }
      else { var f=false; for(var i=0;i<ms.length;i++){ if(ms[i].id===m.id){ms[i]=m;f=true;break;} } if(!f) ms.push(m); }
      lsSet(LS_MODOSACC, ms); return m;
    },
    borrarModoAccion: function (id) {
      var ms=lsGet(LS_MODOSACC, []), out=[];
      for(var i=0;i<ms.length;i++){ if(ms[i].id!==id) out.push(ms[i]); }
      lsSet(LS_MODOSACC, out);
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
        localStorage.removeItem('pa_tipo_lab');
        localStorage.removeItem(LS_ESPECIES);
        localStorage.removeItem(LS_UNIDADES);
        localStorage.removeItem(LS_INSUMOS);
        localStorage.removeItem(LS_MODOSACC);
      } catch (e) {}
      seedDemo();
    }
  };

  global.PA = PA;
})(window);
