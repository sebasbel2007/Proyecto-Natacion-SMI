import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, onValue, push, set, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCxPqdht3-28dIQuGBtSkHnAb6Vj8fUFvA",
  authDomain: "club-de-natacion-smi.firebaseapp.com",
  databaseURL: "https://club-de-natacion-smi-default-rtdb.firebaseio.com",
  projectId: "club-de-natacion-smi",
  storageBucket: "club-de-natacion-smi.firebasestorage.app",
  messagingSenderId: "708566930948",
  appId: "1:708566930948:web:ffebe0deaa05d41a740751",
  measurementId: "G-KGQ7TRGXDJ"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- 1. CARGA DE COMPONENTES ---
const pagina = window.location.pathname.split('/').pop() || 'index.html';
const headerMap = {
  'index.html':        { id: 'header-placeholder', file: 'components/header.html',       activeId: 'linkInicio' },
  '':                  { id: 'header-placeholder', file: 'components/header.html',       activeId: 'linkInicio' },
  'ranking.html':      { id: 'header-placeholder', file: 'components/header.html',       activeId: 'linkRanking' },
  'entrenamiento.html':{ id: 'header-placeholder', file: 'components/header.html',       activeId: 'linkEntrenamiento' },
  'entrenador.html':   { id: 'header-placeholder', file: 'components/header.html',       activeId: 'linkEntrenador' },
  'admin.html':        { id: 'header-placeholder', file: 'components/header-admin.html', activeId: null },
};

async function cargarComponentes() {
  const h = headerMap[pagina];
  if (h) {
    const el = document.getElementById(h.id);
    if (el) {
      try {
        el.innerHTML = await (await fetch(h.file)).text();
        if (h.activeId) document.getElementById(h.activeId)?.classList.add('active');
      }
      catch (err) { console.error('Error cargando header', err); }
    }
  }

  // Header ya disponible: marcar listo y aplicar links pendientes
  headerListo = true;
  if (pendingHeaderUser) {
    const { user, rol } = pendingHeaderUser;
    pendingHeaderUser = null;
    aplicarLinksHeader(user, rol);
  }
  const modalsEl = document.getElementById('modals-placeholder');
  if (modalsEl) {
    try { modalsEl.innerHTML = await (await fetch('components/modals.html')).text(); }
    catch (err) { console.error('Error cargando modals.html', err); }
  }
  // Cargar entrenadores ahora que modals.html ya está en el DOM
  await cargarEntrenadoresEnRegistro();

  const footerEl = document.getElementById('footer-placeholder');
  if (footerEl) {
    try { footerEl.innerHTML = await (await fetch('components/footer.html')).text(); }
    catch (err) { console.error('Error cargando footer.html', err); }
  }
  inicializarAnimaciones();
  actualizarBtnLogin(auth.currentUser);
  if (pagina === 'ranking.html') cargarRanking();
  if (pagina === 'index.html' || pagina === '') cargarRankingHome();
  // cargarRankingAdmin se llama desde iniciarPanelAdmin cuando los datos ya están cargados
}

// --- 2. GESTIÓN DE MODALES ---
window.openLogin = () => {
  document.getElementById('registerOverlay')?.classList.remove('active');
  document.getElementById('loginOverlay')?.classList.add('active');
};

window.openRegister = () => {
  console.log('📝 Abriendo modal de registro...');
  document.getElementById('loginOverlay')?.classList.remove('active');
  document.getElementById('registerOverlay')?.classList.add('active');
  // Recargar siempre al abrir por si hay entrenadores nuevos
  console.log('🔄 Recargando lista de entrenadores...');
  cargarEntrenadoresEnRegistro();
};

window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');

// --- 3. SELECTOR DE ROL EN REGISTRO ---
window.selectRol = (rol) => {
  document.getElementById('regRol').value = rol;
  document.getElementById('rolNadador').classList.toggle('selected', rol === 'nadador');
  document.getElementById('rolEntrenador').classList.toggle('selected', rol === 'entrenador');
  const grupoEntrenador = document.getElementById('grupoEntrenador');
  if (grupoEntrenador) grupoEntrenador.style.display = rol === 'nadador' ? 'block' : 'none';
};

async function cargarEntrenadoresEnRegistro() {
  const select = document.getElementById('regEntrenador');
  if (!select) {
    console.warn('⚠️ Select de entrenadores no encontrado en el DOM');
    return;
  }
  // Limpiar opciones anteriores para evitar duplicados
  select.innerHTML = '<option value="">Sin entrenador por ahora</option>';
  console.log('🔄 Cargando entrenadores...');
  try {
    const snap = await get(ref(db, 'usuarios'));
    if (!snap.exists()) {
      console.log('⚠️ No hay usuarios en la base de datos');
      return;
    }
    const usuarios = snap.val();
    let contadorEntrenadores = 0;
    Object.entries(usuarios).forEach(([uid, u]) => {
      if (u.rol === 'entrenador') {
        const opt = document.createElement('option');
        opt.value = uid;
        opt.textContent = u.nombre;
        select.appendChild(opt);
        contadorEntrenadores++;
        console.log(`✅ Entrenador agregado: ${u.nombre} (${uid})`);
      }
    });
    console.log(`🎯 Total de entrenadores cargados: ${contadorEntrenadores}`);
  } catch (e) { 
    console.error('❌ Error cargando entrenadores:', e);
  }
}

// --- 4. AUTENTICACIÓN ---
window.handleLogin = async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    window.closeModal('loginOverlay');
  } catch (err) {
    errEl.textContent = traducirError(err.code);
    errEl.style.display = 'block';
  }
};

window.handleRegister = async (e) => {
  e.preventDefault();
  const nombre      = document.getElementById('regNombre').value.trim();
  const email       = document.getElementById('regEmail').value.trim();
  const pass        = document.getElementById('regPass').value;
  const pass2       = document.getElementById('regPass2').value;
  const rol         = document.getElementById('regRol')?.value || 'nadador';
  const entrenador  = document.getElementById('regEntrenador')?.value || '';
  const errEl       = document.getElementById('regError');
  errEl.style.display = 'none';

  if (pass !== pass2) {
    errEl.textContent = 'Las contraseñas no coinciden.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: nombre });

    // Si el email es el admin predefinido, forzar rol admin
    const rolFinal = email === 'admin@gmail.com' ? 'admin' : rol;

    const datosUsuario = {
      nombre,
      email,
      rol: rolFinal,
      fecha_registro: new Date().toISOString(),
    };
    if (rolFinal === 'nadador' && entrenador) datosUsuario.id_entrenador = entrenador;

    try {
      await set(ref(db, `usuarios/${cred.user.uid}`), datosUsuario);
    } catch (dbErr) {
      console.warn('No se pudo guardar en DB:', dbErr.code);
    }

    window.closeModal('registerOverlay');
  } catch (authErr) {
    errEl.textContent = `[${authErr.code}] ${traducirError(authErr.code)}`;
    errEl.style.display = 'block';
  }
};

function traducirError(code) {
  const errores = {
    'auth/email-already-in-use': 'El correo ya está registrado.',
    'auth/wrong-password':       'Contraseña incorrecta.',
    'auth/user-not-found':       'No existe una cuenta con ese correo.',
    'auth/invalid-email':        'El correo no es válido.',
    'auth/weak-password':        'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests':    'Demasiados intentos. Intentá más tarde.',
    'auth/invalid-credential':   'Correo o contraseña incorrectos.',
  };
  return errores[code] || 'Error al procesar la solicitud.';
}

// --- 5. ESTADO DE SESIÓN ---
let headerListo = false;
let pendingHeaderUser = null;

function aplicarLinksHeader(user, rol) {
  if (!headerListo) {
    pendingHeaderUser = { user, rol };
    return;
  }
  const linkEntrenador = document.getElementById('linkEntrenador');
  const linkAdmin      = document.getElementById('linkAdmin');
  if (!user) {
    if (linkEntrenador) linkEntrenador.style.display = 'none';
    if (linkAdmin)      linkAdmin.style.display      = 'none';
    return;
  }
  if (linkEntrenador) linkEntrenador.style.display = (rol === 'entrenador' || rol === 'admin') ? 'flex' : 'none';
  if (linkAdmin)      linkAdmin.style.display      = rol === 'admin' ? 'flex' : 'none';
}

function actualizarBtnLogin(user) {
  const btns = document.querySelectorAll('.btn-login');
  btns.forEach(btn => {
    if (user) {
      btn.textContent = `👤 ${user.displayName?.split(' ')[0] || 'Perfil'}`;
      btn.onclick = () => confirm('¿Cerrar sesión?') && signOut(auth);
    } else {
      btn.textContent = 'Iniciar Sesión';
      btn.onclick = () => window.openLogin();
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  actualizarBtnLogin(user);

  if (user) {
    try {
      const snapRol = await get(ref(db, `usuarios/${user.uid}/rol`));
      let rol = snapRol.val();

      if (user.email === 'admin@gmail.com' && rol !== 'admin') {
        await set(ref(db, `usuarios/${user.uid}/rol`), 'admin');
        rol = 'admin';
      }

      // Mostrar links según rol (header unificado) — resiliente a carga tardía del header
      aplicarLinksHeader(user, rol);

      // Si está en página que no le corresponde, redirigir
      if (pagina === 'entrenador.html' && rol !== 'entrenador' && rol !== 'admin') window.location.href = 'entrenamiento.html';
      if (pagina === 'admin.html'      && rol !== 'admin')                         window.location.href = 'entrenamiento.html';

    } catch (e) { /* sin permisos aún */ }
  } else {
    aplicarLinksHeader(null, null);

    // Redirigir páginas protegidas al inicio si no hay sesión
    const paginasProtegidas = ['entrenamiento.html', 'entrenador.html', 'admin.html'];
    if (paginasProtegidas.includes(pagina)) window.location.href = 'index.html';
  }

  // Página entrenamiento (nadador + admin)
  if (pagina === 'entrenamiento.html') {
    const banner    = document.getElementById('loginBanner');
    const welcomeEl = document.getElementById('welcomeUser');
    if (user) {
      if (banner) banner.style.display = 'none';
      if (welcomeEl) welcomeEl.textContent = `Hola, ${user.displayName?.split(' ')[0] || 'nadador'} 👋 Estos son tus récords personales`;
      cargarRecords(user.uid);
    } else {
      if (banner) banner.style.display = 'flex';
      if (welcomeEl) welcomeEl.textContent = 'Iniciá sesión para ver tus récords personales';
      ['Crol', 'Espalda', 'Mariposa'].forEach(e => {
        const el = document.getElementById(`records-${e}`);
        if (el) el.innerHTML = '<div class="record-empty">Iniciá sesión para ver tus récords</div>';
      });
    }
    escucharEstadoCarril();
  }

  // Página admin
  if (pagina === 'admin.html') {
    const banner    = document.getElementById('loginBannerAdmin');
    const panel     = document.getElementById('panelAdmin');
    const welcomeEl = document.getElementById('welcomeAdmin');

    if (!user) {
      if (banner) banner.style.display = 'flex';
      if (panel)  panel.style.display  = 'none';
      if (welcomeEl) welcomeEl.textContent = 'Iniciá sesión para acceder al panel';
      return;
    }

    try {
      const snap = await get(ref(db, `usuarios/${user.uid}`));
      const datos = snap.val();
      if (!datos || datos.rol !== 'admin') {
        if (banner) banner.style.display = 'flex';
        if (panel)  panel.style.display  = 'none';
        if (welcomeEl) welcomeEl.textContent = 'Acceso denegado. Solo administradores.';
        return;
      }
      if (banner) banner.style.display = 'none';
      if (panel)  panel.style.display  = 'block';
      if (welcomeEl) welcomeEl.textContent = `Bienvenido, ${user.displayName?.split(' ')[0] || 'Admin'} — Panel de control del club`;
      iniciarPanelAdmin();
    } catch (e) { console.error('Error verificando rol admin', e); }
  }

  // Página entrenador (accesible por entrenador Y admin)
  if (pagina === 'entrenador.html') {
    const banner    = document.getElementById('loginBannerEntrenador');
    const panel     = document.getElementById('panelEntrenador');
    const welcomeEl = document.getElementById('welcomeEntrenador');

    if (!user) {
      if (banner) banner.style.display = 'flex';
      if (panel)  panel.style.display  = 'none';
      if (welcomeEl) welcomeEl.textContent = 'Iniciá sesión para acceder al panel';
      return;
    }

    try {
      const snap = await get(ref(db, `usuarios/${user.uid}`));
      const datos = snap.val();
      if (!datos || (datos.rol !== 'entrenador' && datos.rol !== 'admin')) {
        if (welcomeEl) welcomeEl.textContent = 'Esta sección es solo para entrenadores.';
        return;
      }
      if (banner) banner.style.display = 'none';
      if (panel)  panel.style.display  = 'block';
      if (welcomeEl) welcomeEl.textContent = `Bienvenido, ${user.displayName?.split(' ')[0] || 'entrenador'} 📋`;
      cargarAlumnos(user.uid);
      escucharEstadoCarrilCoach();
    } catch (e) { console.error('Error verificando rol', e); }
  }
});

// --- 6. RÉCORDS PERSONALES (entrenamiento.html) ---
function cargarRecords(uid) {
  onValue(ref(db, 'records'), (snapshot) => {
    const todos = snapshot.val() || {};
    ['Crol', 'Espalda', 'Mariposa'].forEach(estilo => {
      const el = document.getElementById(`records-${estilo}`);
      if (!el) return;
      const filtrados = Object.fromEntries(
        Object.entries(todos).filter(([, r]) => r.uid_nadador === uid && r.estilo === estilo)
      );
      if (Object.keys(filtrados).length === 0) {
        el.innerHTML = '<div class="record-empty">Sin registros aún — ¡empezá a entrenar!</div>';
        return;
      }
      renderRecords(el, filtrados);
    });
  });
}

function medalClass(i) {
  if (i === 0) return 'gold';
  if (i === 1) return 'silver';
  if (i === 2) return 'bronze';
  if (i <= 4)  return 'top5';
  return 'grafito';
}

function renderRecords(el, data, visibles = 5) {
  const records = Object.values(data).sort((a, b) => a.segundos - b.segundos);
  // compatibilidad con estructura nueva (records/) y vieja (usuarios/records/)
  const mostrar = records.slice(0, visibles);
  const hayMas = records.length > visibles;

  el.innerHTML = mostrar.map((r, i) => `
    <div class="competitor">
      <div class="medal ${medalClass(i)}">${i + 1}</div>
      <div class="comp-info">
        <div class="name">
          ${formatTiempo(r.segundos)}
          <span class="record-fecha">📅 ${new Date(r.fecha).toLocaleDateString('es-AR')}</span>
          ${r.registradoPor ? `<span class="badge-coach">📋 Entrenador</span>` : ''}
        </div>
        <div class="pos">${i === 0 ? 'Mejor marca personal' : `Intento #${i + 1}`}</div>
      </div>
      ${i === 0 ? '<div class="comp-time">🏅 Mejor</div>' : ''}
    </div>
  `).join('');

  if (hayMas) {
    const btn = document.createElement('button');
    btn.className = 'btn-ver-mas';
    btn.textContent = `Ver más (${records.length - visibles} restantes)`;
    btn.onclick = () => renderRecords(el, data, visibles + 5);
    el.appendChild(btn);
  }
}

function formatTiempo(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// --- 7. PANEL ENTRENADOR ---
let alumnosData = {};
let alumnoActivoUid = null;
let unsubscribeAlumno = {};
let uidEntrenadorActual = null;

function cargarAlumnos(uidEntrenador) {
  uidEntrenadorActual = uidEntrenador;
  // onValue para tiempo real — si alguien se registra con este entrenador aparece al instante
  onValue(ref(db, 'usuarios'), (snap) => {
    if (!snap.exists()) { mostrarSinAlumnos(); return; }

    const todos = snap.val();
    alumnosData = {};
    Object.entries(todos).forEach(([uid, u]) => {
      if (u.id_entrenador === uidEntrenador) alumnosData[uid] = u;
    });

    const select  = document.getElementById('selectorAlumno');
    const countEl = document.getElementById('alumnosCount');
    const cantidad = Object.keys(alumnosData).length;

    if (cantidad === 0) { mostrarSinAlumnos(); return; }

    document.getElementById('sinAlumnos').style.display = 'none';
    if (countEl) countEl.textContent = `${cantidad} alumno${cantidad !== 1 ? 's' : ''}`;

    if (select) {
      const valorActual = select.value;
      select.innerHTML = '<option value="">— Seleccioná un alumno —</option>';
      Object.entries(alumnosData).forEach(([uid, u]) => {
        const opt = document.createElement('option');
        opt.value = uid;
        opt.textContent = u.nombre;
        select.appendChild(opt);
      });
      // Mantener seleccion si sigue existiendo
      if (valorActual && alumnosData[valorActual]) select.value = valorActual;
    }

    actualizarTablaAlumnos();
  });
}

function actualizarTablaAlumnos() {
  const tbody = document.getElementById('tablaAlumnosCuerpo');
  const tabla = document.getElementById('tablaAlumnos');
  if (!tbody) return;

  const cantidad = Object.keys(alumnosData).length;
  if (cantidad === 0) { if (tabla) tabla.style.display = 'none'; return; }
  if (tabla) tabla.style.display = 'block';

  const uidActivo = document.getElementById('selectorAlumno')?.value;
  const contenidoVisible = document.getElementById('contenidoAlumno')?.style.display !== 'none';

  tbody.innerHTML = Object.entries(alumnosData).map(([uid, u], i) => {
    const esActivo = uid === uidActivo && contenidoVisible;
    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${u.nombre}</strong></td>
      <td>${u.email || '—'}</td>
      <td>
        <button class="btn-ver-alumno ${esActivo ? 'btn-ocultar' : ''}" data-uid="${uid}" onclick="seleccionarAlumnoDesdeTabla('${uid}')">${esActivo ? 'Ocultar récords' : 'Ver récords'}</button>
      </td>
    </tr>
  `;
  }).join('');
}

window.toggleContenidoAlumno = () => {
  const contenido = document.getElementById('contenidoAlumno');
  const btn = document.querySelector('.alumno-info-card .btn-tabla-toggle');
  const oculto = contenido.style.display === 'none';
  contenido.style.display = oculto ? 'block' : 'none';
  if (btn) btn.textContent = oculto ? 'Ocultar récords' : 'Ver récords';

  // Sincronizar botón de la tabla si hay alumno seleccionado
  const uid = document.getElementById('selectorAlumno')?.value;
  if (uid) {
    const btnTabla = document.querySelector(`[data-uid="${uid}"]`);
    if (btnTabla) {
      btnTabla.textContent = oculto ? 'Ocultar récords' : 'Ver récords';
      btnTabla.classList.toggle('btn-ocultar', oculto);
    }
  }
};

window.toggleTablaAlumnos = () => {
  const tablaScroll = document.querySelector('.tabla-scroll');
  const btn = document.querySelector('.btn-tabla-toggle');
  const oculto = tablaScroll.style.display === 'none';
  tablaScroll.style.display = oculto ? 'block' : 'none';
  if (btn) btn.textContent = oculto ? 'Ocultar lista' : 'Mostrar lista';
};

window.seleccionarAlumnoDesdeTabla = (uid) => {
  const contenido = document.getElementById('contenidoAlumno');
  const select = document.getElementById('selectorAlumno');
  const btn = document.querySelector(`[data-uid="${uid}"]`);

  // Si ya está seleccionado y visible, ocultar (toggle)
  if (select?.value === uid && contenido?.style.display !== 'none') {
    contenido.style.display = 'none';
    if (btn) { btn.textContent = 'Ver récords'; btn.classList.remove('btn-ocultar'); }
    return;
  }

  // Resetear todos los botones de la tabla
  document.querySelectorAll('[data-uid]').forEach(b => {
    b.textContent = 'Ver récords';
    b.classList.remove('btn-ocultar');
  });

  if (select) { select.value = uid; window.cambiarAlumnoActivo(); }
  if (btn) { btn.textContent = 'Ocultar récords'; btn.classList.add('btn-ocultar'); }
  contenido?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Modal agregar alumno: muestra nadadores sin entrenador o con otro entrenador
window.openAgregarAlumno = async () => {
  const lista = document.getElementById('listaAlumnosDisponibles');
  if (!lista) return;
  lista.innerHTML = '<div class="record-empty">Cargando nadadores...</div>';
  document.getElementById('agregarAlumnoOverlay').classList.add('active');

  try {
    const snap = await get(ref(db, 'usuarios'));
    if (!snap.exists()) { lista.innerHTML = '<div class="record-empty">No hay nadadores registrados.</div>'; return; }

    const todos = snap.val();
    const nadadores = Object.entries(todos).filter(([, u]) => u.rol === 'nadador');

    if (nadadores.length === 0) {
      lista.innerHTML = '<div class="record-empty">No hay nadadores registrados aún.</div>';
      return;
    }

    lista.innerHTML = nadadores.map(([uid, u]) => {
      const esAlumnoMio = u.id_entrenador === uidEntrenadorActual;
      const tieneOtro  = u.id_entrenador && !esAlumnoMio;
      // Solo mostrar: alumnos propios + nadadores sin entrenador
      if (tieneOtro) return '';
      return `
        <div class="alumno-disponible-item">
          <div class="alumno-disponible-info">
            <div class="alumno-disponible-nombre">${u.nombre}</div>
            <div class="alumno-disponible-email">${u.email || ''}</div>
            ${esAlumnoMio ? '<span class="badge-ya-asignado">✓ Ya es tu alumno</span>' : ''}
          </div>
          ${!esAlumnoMio
            ? `<button class="btn-asignar" onclick="asignarAlumno('${uid}', this)">Asignar</button>`
            : `<button class="btn-desasignar" onclick="desasignarAlumno('${uid}', this)">Quitar</button>`
          }
        </div>
      `;
    }).join('');
  } catch (e) {
    lista.innerHTML = '<div class="record-empty">Error al cargar nadadores.</div>';
    console.error(e);
  }
};

window.asignarAlumno = async (uid, btn) => {
  btn.disabled = true;
  btn.textContent = 'Asignando...';
  try {
    await set(ref(db, `usuarios/${uid}/id_entrenador`), uidEntrenadorActual);
    btn.textContent = '✓ Asignado';
    btn.className = 'btn-asignar asignado';
  } catch (e) {
    btn.textContent = 'Error';
    btn.disabled = false;
    console.error(e);
  }
};

window.desasignarAlumno = async (uid, btn) => {
  if (!confirm('¿Quitás a este alumno de tu grupo?')) return;
  btn.disabled = true;
  try {
    await set(ref(db, `usuarios/${uid}/id_entrenador`), null);
    btn.textContent = '✓ Quitado';
  } catch (e) {
    btn.disabled = false;
    console.error(e);
  }
};

function mostrarSinAlumnos() {
  const sinAlumnos = document.getElementById('sinAlumnos');
  const contenido  = document.getElementById('contenidoAlumno');
  if (sinAlumnos) sinAlumnos.style.display = 'block';
  if (contenido)  contenido.style.display  = 'none';
}

window.cambiarAlumnoActivo = () => {
  const select = document.getElementById('selectorAlumno');
  const uid = select?.value;

  // Cancelar listeners anteriores
  Object.values(unsubscribeAlumno).forEach(fn => fn && fn());
  unsubscribeAlumno = {};

  const contenido = document.getElementById('contenidoAlumno');
  if (!uid) {
    if (contenido) contenido.style.display = 'none';
    return;
  }

  alumnoActivoUid = uid;
  const alumno = alumnosData[uid];
  if (contenido) contenido.style.display = 'block';

  // Info del alumno
  const avatar  = document.getElementById('alumnoAvatar');
  const nombre  = document.getElementById('alumnoNombre');
  const meta    = document.getElementById('alumnoMeta');
  if (avatar) avatar.textContent = alumno.nombre?.charAt(0).toUpperCase() || '?';
  if (nombre) nombre.textContent = alumno.nombre;
  if (meta)   meta.textContent   = `${alumno.email || ''} • Alumno del club`;

  // Cargar récords en tiempo real
  ['Crol', 'Espalda', 'Mariposa'].forEach(estilo => {
    const el = document.getElementById(`coach-records-${estilo}`);
    if (!el) return;
    el.innerHTML = '<div class="record-empty">Cargando...</div>';

    const unsub = onValue(ref(db, 'records'), (snap) => {
      const todos = snap.val() || {};
      const items = Object.values(todos)
        .filter(r => r.uid_nadador === uid && r.estilo === estilo)
        .sort((a, b) => a.segundos - b.segundos)
        .map(r => ({ nombre: `${formatTiempo(r.segundos)} — ${new Date(r.fecha).toLocaleDateString('es-AR')}${r.registradoPor && r.registradoPor !== 'Nadador' ? ' 📋' : ''}`, segundos: r.segundos }));
      if (items.length === 0) { el.innerHTML = '<div class="record-empty">Sin registros aún</div>'; return; }
      renderRankingTop(el, items, 5, 10);
    });
    unsubscribeAlumno[estilo] = unsub;
  });
};

// --- 8. FLUJO DE CARRIL (entrenamiento.html) ---
function escucharEstadoCarril() {
  onValue(ref(db, 'carriles/carril_1'), (snap) => {
    const c = snap.val();
    const offline = c?.estadoFisico === 'MODO_LOCAL';
    const aviso = document.getElementById('avisoCasillaOffline');
    document.querySelectorAll('.btn-anotarse').forEach(btn => {
      btn.disabled = offline;
      btn.style.opacity = offline ? '0.4' : '1';
    });
    if (aviso) aviso.style.display = offline ? 'flex' : 'none';
  });
}

let carrilesListener = null;
let carrilesDisponiblesListener = null;
let estiloActualTrain = null;
let carrilActivoId = null;

function mostrarPasoTrain(paso) {
  ['Buscando','Elegir','Esperando','Resultado','SinCarriles','FalsaSalida','ModoLocal'].forEach(p => {
    const el = document.getElementById(`trainPaso${p}`);
    if (el) el.style.display = p === paso ? 'block' : 'none';
  });
}

window.openTraining = (estilo) => {
  if (!auth.currentUser) return window.openLogin();
  estiloActualTrain = estilo;
  carrilActivoId = null;
  if (carrilesListener) { carrilesListener(); carrilesListener = null; }
  if (carrilesDisponiblesListener) { carrilesDisponiblesListener(); carrilesDisponiblesListener = null; }
  document.getElementById('trainEstiloLabel').textContent = `Estilo: ${estilo}`;
  document.getElementById('trainModalTitulo').textContent = 'Buscar Carril';
  mostrarPasoTrain('Buscando');
  document.getElementById('trainOverlay').classList.add('active');
  escucharCarrilesDisponibles();
};

function escucharCarrilesDisponibles() {
  if (carrilesDisponiblesListener) { carrilesDisponiblesListener(); carrilesDisponiblesListener = null; }
  carrilesDisponiblesListener = onValue(ref(db, 'carriles'), (snap) => {
    // Si ya hay un carril activo asignado, no interferir
    if (carrilActivoId) return;
    if (!snap.exists()) { mostrarPasoTrain('SinCarriles'); return; }
    const carriles = snap.val();
    const libres = Object.entries(carriles).filter(([, c]) => c.estadoFisico === 'LIBRE');
    if (libres.length === 0) { mostrarPasoTrain('SinCarriles'); return; }
    const lista = document.getElementById('trainListaCarriles');
    if (lista) {
      lista.innerHTML = libres.map(([id]) => `
        <button class="btn-submit" onclick="seleccionarCarril('${id}')">
          🏊 Usar ${id.replace('_', ' ').toUpperCase()}
        </button>`).join('');
    }
    mostrarPasoTrain('Elegir');
  });
}

window.seleccionarCarril = async (carrilId) => {
  const user = auth.currentUser;
  if (!user) return;
  carrilActivoId = carrilId;
  // Dejar de escuchar carriles disponibles, ahora escuchamos solo el carril activo
  if (carrilesDisponiblesListener) { carrilesDisponiblesListener(); carrilesDisponiblesListener = null; }

  // Obtener mejor tiempo del nadador en este estilo
  const todosRecords = (await get(ref(db, 'records'))).val() || {};
  const mejorTiempo = Object.values(todosRecords)
    .filter(r => r.uid_nadador === user.uid && r.estilo === estiloActualTrain)
    .sort((a, b) => a.segundos - b.segundos)[0]?.segundos || 9999;

  try {
    await set(ref(db, `carriles/${carrilId}`), {
      esperando:    true,
      estadoFisico: 'ESPERANDO_NADADOR',
      recordActual: mejorTiempo,
      uid_nadador:  user.uid,
      estilo:       estiloActualTrain,
      ultimoTiempo: 0
    });
    mostrarPasoTrain('Esperando');
    document.getElementById('trainModalTitulo').textContent = 'En carril';
    escucharCarril(carrilId, user.uid, estiloActualTrain);
  } catch (e) {
    console.error('❌ Error asignando carril:', e);
  }
};

function escucharCarril(carrilId, uid, estilo) {
  if (carrilesListener) carrilesListener();
  carrilesListener = onValue(ref(db, `carriles/${carrilId}`), async (snap) => {
    const c = snap.val();
    if (!c) return;
    const estadoEl = document.getElementById('trainEstadoLabel');

    switch (c.estadoFisico) {
      case 'ESPERANDO_NADADOR':
        if (estadoEl) estadoEl.textContent = '⏳ Esperando al Arduino...';
        break;
      case 'SECUENCIA':
        if (estadoEl) estadoEl.textContent = '⚠️ Preparate... ¡Ya!';
        break;
      case 'CARRERA_IDA':
      case 'CARRERA_VUELTA':
        if (estadoEl) estadoEl.textContent = '🏊‍♂️ Nadando...';
        break;
      case 'SALIDA_FALSA':
        if (carrilesListener) { carrilesListener(); carrilesListener = null; }
        await liberarCarril(carrilId);
        mostrarPasoTrain('FalsaSalida');
        break;
      case 'FIN': {
        if (carrilesListener) { carrilesListener(); carrilesListener = null; }
        const tiempoSeg = Math.round(c.ultimoTiempo);
        const todosR = (await get(ref(db, 'records'))).val() || {};
        const misRecords = Object.values(todosR).filter(r => r.uid_nadador === uid && r.estilo === estilo);
        const anterior = misRecords.filter(r => r.segundos !== tiempoSeg).sort((a, b) => a.segundos - b.segundos)[0]?.segundos;
        const esRecord = misRecords.length <= 1 || !anterior || tiempoSeg < anterior;
        mostrarResultado(tiempoSeg, esRecord);
        // El server.js libera el carril después de 3s, no hace falta hacerlo acá
        break;
      }
      case 'MODO_LOCAL':
        if (carrilesListener) { carrilesListener(); carrilesListener = null; }
        mostrarPasoTrain('ModoLocal');
        break;
      case 'LIBRE':
        // Carril liberado externamente (reset)
        if (carrilesListener) { carrilesListener(); carrilesListener = null; }
        mostrarPasoTrain('SinCarriles');
        break;
    }
  });
}

function mostrarResultado(segundos, esRecord) {
  document.getElementById('trainTiempoFinal').textContent = formatTiempo(segundos);
  document.getElementById('trainResultadoLabel').textContent = '🏁 ¡Carrera finalizada!';
  document.getElementById('trainBadgeRecord').style.display = esRecord ? 'block' : 'none';
  mostrarPasoTrain('Resultado');
}

window.cerrarResultado = () => {
  window.closeModal('trainOverlay');
  carrilActivoId = null;
};

window.cancelarCarril = async () => {
  if (carrilesListener) { carrilesListener(); carrilesListener = null; }
  if (carrilesDisponiblesListener) { carrilesDisponiblesListener(); carrilesDisponiblesListener = null; }
  if (carrilActivoId) await liberarCarril(carrilActivoId);
  carrilActivoId = null;
  window.closeModal('trainOverlay');
};

async function liberarCarril(carrilId) {
  try {
    await set(ref(db, `carriles/${carrilId}`), {
      esperando:    false,
      estadoFisico: 'LIBRE',
      recordActual: 9999,
      uid_nadador:  '',
      ultimoTiempo: 0
    });
  } catch (e) { console.error('❌ Error liberando carril:', e); }
}

// --- 9. FLUJO DE CARRIL ENTRENADOR ---
let carrilesListenerCoach = null;
let carrilesDisponiblesListenerCoach = null;
let estiloActualCoach = null;
let carrilActivoCoach = null;

function mostrarPasoCoach(paso) {
  ['Buscando','Elegir','Esperando','Resultado','SinCarriles','FalsaSalida','ModoLocal'].forEach(p => {
    const el = document.getElementById(`coachPaso${p}`);
    if (el) el.style.display = p === paso ? 'block' : 'none';
  });
}

window.openTrainingCoach = (estilo) => {
  if (!alumnoActivoUid) { alert('Seleccioná un alumno primero.'); return; }
  estiloActualCoach = estilo;
  carrilActivoCoach = null;
  if (carrilesListenerCoach) { carrilesListenerCoach(); carrilesListenerCoach = null; }
  if (carrilesDisponiblesListenerCoach) { carrilesDisponiblesListenerCoach(); carrilesDisponiblesListenerCoach = null; }
  document.getElementById('coachTrainEstiloLabel').textContent = `Estilo: ${estilo}`;
  document.getElementById('coachTrainAlumnoLabel').textContent = `Alumno: ${alumnosData[alumnoActivoUid]?.nombre || '—'}`;
  document.getElementById('coachModalTitulo').textContent = 'Buscar Carril';
  mostrarPasoCoach('Buscando');
  document.getElementById('trainCoachOverlay').classList.add('active');
  escucharCarrilesDisponiblesCoach();
};

function escucharCarrilesDisponiblesCoach() {
  if (carrilesDisponiblesListenerCoach) { carrilesDisponiblesListenerCoach(); carrilesDisponiblesListenerCoach = null; }
  carrilesDisponiblesListenerCoach = onValue(ref(db, 'carriles'), (snap) => {
    if (carrilActivoCoach) return;
    if (!snap.exists()) { mostrarPasoCoach('SinCarriles'); return; }
    const carriles = snap.val();
    const libres = Object.entries(carriles).filter(([, c]) => c.estadoFisico === 'LIBRE');
    if (libres.length === 0) { mostrarPasoCoach('SinCarriles'); return; }
    const lista = document.getElementById('coachListaCarriles');
    if (lista) {
      lista.innerHTML = libres.map(([id]) => `
        <button class="btn-submit" onclick="seleccionarCarrilCoach('${id}')">
          🏊 Usar ${id.replace('_', ' ').toUpperCase()}
        </button>`).join('');
    }
    mostrarPasoCoach('Elegir');
  });
}

window.seleccionarCarrilCoach = async (carrilId) => {
  if (!alumnoActivoUid) return;
  carrilActivoCoach = carrilId;
  if (carrilesDisponiblesListenerCoach) { carrilesDisponiblesListenerCoach(); carrilesDisponiblesListenerCoach = null; }

  const todosRecords = (await get(ref(db, 'records'))).val() || {};
  const mejorTiempo = Object.values(todosRecords)
    .filter(r => r.uid_nadador === alumnoActivoUid && r.estilo === estiloActualCoach)
    .sort((a, b) => a.segundos - b.segundos)[0]?.segundos || 9999;

  try {
    await set(ref(db, `carriles/${carrilId}`), {
      esperando:    true,
      estadoFisico: 'ESPERANDO_NADADOR',
      recordActual: mejorTiempo,
      uid_nadador:  alumnoActivoUid,
      estilo:       estiloActualCoach,
      ultimoTiempo: 0
    });
    document.getElementById('coachModalTitulo').textContent = 'En carril';
    mostrarPasoCoach('Esperando');
    escucharCarrilCoach(carrilId, alumnoActivoUid, estiloActualCoach);
  } catch (e) { console.error('❌ Error asignando carril:', e); }
};

function escucharCarrilCoach(carrilId, uid, estilo) {
  if (carrilesListenerCoach) carrilesListenerCoach();
  carrilesListenerCoach = onValue(ref(db, `carriles/${carrilId}`), async (snap) => {
    const c = snap.val();
    if (!c) return;
    const estadoEl = document.getElementById('coachEstadoLabel');

    switch (c.estadoFisico) {
      case 'ESPERANDO_NADADOR':
        if (estadoEl) estadoEl.textContent = '⏳ Esperando al Arduino...';
        break;
      case 'CARRERA_IDA':
      case 'CARRERA_VUELTA':
        if (estadoEl) estadoEl.textContent = '🏊♂️ Nadando...';
        break;
      case 'SALIDA_FALSA':
        if (carrilesListenerCoach) { carrilesListenerCoach(); carrilesListenerCoach = null; }
        mostrarPasoCoach('FalsaSalida');
        break;
      case 'MODO_LOCAL':
        if (carrilesListenerCoach) { carrilesListenerCoach(); carrilesListenerCoach = null; }
        mostrarPasoCoach('ModoLocal');
        break;
      case 'FIN': {
        if (carrilesListenerCoach) { carrilesListenerCoach(); carrilesListenerCoach = null; }
        const tiempoSeg = Math.round(c.ultimoTiempo);
        const todosR = (await get(ref(db, 'records'))).val() || {};
        const misRecords = Object.values(todosR).filter(r => r.uid_nadador === uid && r.estilo === estilo);
        const anterior = misRecords.filter(r => r.segundos !== tiempoSeg).sort((a, b) => a.segundos - b.segundos)[0]?.segundos;
        const esRecord = misRecords.length <= 1 || !anterior || tiempoSeg < anterior;
        document.getElementById('coachTiempoFinal').textContent = formatTiempo(tiempoSeg);
        document.getElementById('coachBadgeRecord').style.display = esRecord ? 'block' : 'none';
        mostrarPasoCoach('Resultado');
        break;
      }
      case 'LIBRE':
        if (carrilesListenerCoach) { carrilesListenerCoach(); carrilesListenerCoach = null; }
        mostrarPasoCoach('SinCarriles');
        break;
    }
  });
}

window.cerrarResultadoCoach = () => {
  window.closeModal('trainCoachOverlay');
  carrilActivoCoach = null;
};

window.cancelarCarrilCoach = async () => {
  if (carrilesListenerCoach) { carrilesListenerCoach(); carrilesListenerCoach = null; }
  if (carrilesDisponiblesListenerCoach) { carrilesDisponiblesListenerCoach(); carrilesDisponiblesListenerCoach = null; }
  if (carrilActivoCoach) await liberarCarril(carrilActivoCoach);
  carrilActivoCoach = null;
  window.closeModal('trainCoachOverlay');
};

// Escuchar estado del carril en entrenador.html
function escucharEstadoCarrilCoach() {
  onValue(ref(db, 'carriles/carril_1'), (snap) => {
    const c = snap.val();
    const offline = c?.estadoFisico === 'MODO_LOCAL';
    const aviso = document.getElementById('avisoCasillaOfflineCoach');
    document.querySelectorAll('.btn-anotarse').forEach(btn => {
      btn.disabled = offline;
      btn.style.opacity = offline ? '0.4' : '1';
    });
    if (aviso) aviso.style.display = offline ? 'flex' : 'none';
  });
}


function renderRankingTop(el, items, visibles = 5, max = 10) {
  const mostrar = items.slice(0, visibles);
  const hayMas = items.length > visibles && visibles < max;
  const medalClase = ['gold', 'silver', 'bronze'];

  el.innerHTML = mostrar.map((r, i) => `
    <div class="competitor">
      <div class="medal ${medalClass(i)}">${i + 1}</div>
      <div class="comp-info">
        <div class="name">${r.nombre}</div>
        <div class="pos">Puesto #${i + 1}</div>
      </div>
      <div class="comp-time">${formatTiempo(r.segundos)}</div>
    </div>
  `).join('');

  if (hayMas) {
    const btn = document.createElement('button');
    btn.className = 'btn-ver-mas';
    const siguientes = Math.min(visibles + 5, max);
    btn.textContent = `Ver más (${Math.min(items.length, max) - visibles} restantes)`;
    btn.onclick = () => renderRankingTop(el, items, siguientes, max);
    el.appendChild(btn);
  }
}

// --- 10. RANKING HOME (index.html) ---
function cargarRankingHome() {
  onValue(ref(db, 'records'), (snap) => {
    const todos = snap.exists() ? Object.values(snap.val()) : [];
    ['Crol', 'Espalda', 'Mariposa'].forEach(estilo => {
      const el = document.getElementById(`home-ranking-${estilo}`);
      if (!el) return;
      const porNadador = {};
      todos.filter(r => r.estilo === estilo).forEach(r => {
        if (!porNadador[r.uid_nadador] || r.segundos < porNadador[r.uid_nadador].segundos)
          porNadador[r.uid_nadador] = r;
      });
      const top3 = Object.values(porNadador).sort((a, b) => a.segundos - b.segundos).slice(0, 3);
      const medalClases = ['gold', 'silver', 'bronze'];
      if (top3.length === 0) { el.innerHTML = '<div class="record-empty">Sin registros aún</div>'; return; }
      el.innerHTML = top3.map((r, i) => `
        <div class="competitor">
          <div class="medal ${medalClases[i]}">${i + 1}</div>
          <div class="comp-info"><div class="name">${r.nombre_nadador}</div><div class="pos">Puesto #${i + 1}</div></div>
          <div class="comp-time">${formatTiempo(r.segundos)}</div>
        </div>`).join('');
    });
  });
}

// --- 11. RANKING EN VIVO (ranking.html) ---
function cargarRanking() {
  onValue(ref(db, 'records'), (snap) => {
    const todos = snap.exists() ? Object.values(snap.val()) : [];
    ['Crol', 'Espalda', 'Mariposa'].forEach(estilo => {
      const el = document.getElementById(`ranking-${estilo}`);
      if (!el) return;
      const porNadador = {};
      todos.filter(r => r.estilo === estilo).forEach(r => {
        if (!porNadador[r.uid_nadador] || r.segundos < porNadador[r.uid_nadador].segundos)
          porNadador[r.uid_nadador] = r;
      });
      const mejores = Object.values(porNadador).sort((a, b) => a.segundos - b.segundos);
      if (mejores.length === 0) { el.innerHTML = '<div class="record-empty">Sin registros aún</div>'; return; }
      renderRankingTop(el, mejores.map(r => ({ nombre: r.nombre_nadador, segundos: r.segundos })), 5, 10);
    });
  });
}

// --- 11. ANIMACIONES ---
function inicializarAnimaciones() {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.transitionDelay = (entry.target.dataset.delay || 0) + 'ms';
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = +el.dataset.target;
        let current = 0;
        const timer = setInterval(() => {
          current += Math.ceil(target / 50);
          if (current >= target) { el.textContent = target; clearInterval(timer); }
          else el.textContent = current;
        }, 30);
        statObserver.unobserve(el);
      }
    });
  });
  document.querySelectorAll('.stat-val[data-target]').forEach(s => statObserver.observe(s));
}

// --- 12. PANEL ADMIN ---
let todosUsuariosAdmin = {};
let todosRecordsAdmin  = {};

function iniciarPanelAdmin() {
  onValue(ref(db, 'usuarios'), (snap) => {
    todosUsuariosAdmin = snap.exists() ? snap.val() : {};
    renderTablaUsuarios(todosUsuariosAdmin);
    poblarSelectNadadores();
  });
  onValue(ref(db, 'records'), (snap) => {
    todosRecordsAdmin = snap.exists() ? snap.val() : {};
    actualizarStatsAdmin();
    const tabRecords = document.getElementById('tabRecords');
    if (tabRecords && tabRecords.style.display !== 'none') cargarRecordsAdmin();
  });
}

function actualizarStatsAdmin() {
  const usuarios = Object.values(todosUsuariosAdmin).filter(u => u.rol !== 'admin');
  const nadadores    = usuarios.filter(u => u.rol === 'nadador').length;
  const entrenadores = usuarios.filter(u => u.rol === 'entrenador').length;
  const totalRecords = Object.keys(todosRecordsAdmin).length;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setVal('statTotalUsuarios',    usuarios.length);
  setVal('statTotalNadadores',   nadadores);
  setVal('statTotalEntrenadores', entrenadores);
  setVal('statTotalRecords',     totalRecords);
}

function renderTablaUsuarios(datos) {
  const tbody = document.getElementById('tablaUsuariosCuerpo');
  const vacio = document.getElementById('usuariosVacio');
  if (!tbody) return;
  // Excluir cuentas admin de la tabla
  const entries = Object.entries(datos).filter(([, u]) => u.rol !== 'admin');
  if (entries.length === 0) {
    tbody.innerHTML = '';
    if (vacio) vacio.style.display = 'block';
    return;
  }
  if (vacio) vacio.style.display = 'none';
  tbody.innerHTML = entries.map(([uid, u], i) => {
    const entrenadorNombre = u.id_entrenador && todosUsuariosAdmin[u.id_entrenador]
      ? todosUsuariosAdmin[u.id_entrenador].nombre : '—';
    const fecha = u.fecha_registro ? new Date(u.fecha_registro).toLocaleDateString('es-AR') : '—';
    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${u.nombre || '—'}</strong></td>
      <td>${u.email || '—'}</td>
      <td><span class="badge-rol ${u.rol || 'nadador'}">${u.rol || 'nadador'}</span></td>
      <td>${entrenadorNombre}</td>
      <td>${fecha}</td>
      <td>
        <button class="btn-admin-edit" onclick="verRecordsNadador('${uid}')">📊 Récords</button>
        ${u.rol === 'entrenador' ? `<button class="btn-admin-edit" onclick="verAlumnosEntrenador('${uid}')">👥 Alumnos</button>` : ''}
        <button class="btn-admin-edit" onclick="abrirEditarUsuario('${uid}')">✏️ Editar</button>
        <button class="btn-admin-delete" onclick="eliminarUsuario('${uid}', '${(u.nombre||'').replace(/'/g,"\\'")}')">🗑️ Eliminar</button>
      </td>
    </tr>`;
  }).join('');
}

window.filtrarUsuarios = () => {
  const buscar = document.getElementById('buscarUsuario')?.value.toLowerCase() || '';
  const rol    = document.getElementById('filtroRol')?.value || '';
  const filtrado = Object.fromEntries(
    Object.entries(todosUsuariosAdmin).filter(([, u]) => {
      if (u.rol === 'admin') return false; // nunca mostrar admins
      const matchTexto = (u.nombre||'').toLowerCase().includes(buscar) || (u.email||'').toLowerCase().includes(buscar);
      const matchRol   = !rol || u.rol === rol;
      return matchTexto && matchRol;
    })
  );
  renderTablaUsuarios(filtrado);
};

window.abrirEditarUsuario = async (uid) => {
  const u = todosUsuariosAdmin[uid];
  if (!u) return;
  document.getElementById('editUserUid').value      = uid;
  document.getElementById('editUserNombre').value   = u.nombre || '';
  document.getElementById('editUserRol').value      = u.rol || 'nadador';
  document.getElementById('editUserSubtitle').textContent = u.email || '';
  document.getElementById('editUserError').style.display = 'none';

  // Poblar dropdown de entrenadores
  const selEnt = document.getElementById('editUserEntrenador');
  selEnt.innerHTML = '<option value="">Sin entrenador</option>';
  Object.entries(todosUsuariosAdmin)
    .filter(([, e]) => e.rol === 'entrenador')
    .forEach(([euid, e]) => {
      const opt = document.createElement('option');
      opt.value = euid;
      opt.textContent = e.nombre;
      if (euid === u.id_entrenador) opt.selected = true;
      selEnt.appendChild(opt);
    });

  // Mostrar/ocultar grupo entrenador
  document.getElementById('editGrupoEntrenador').style.display = u.rol === 'nadador' ? 'block' : 'none';
  document.getElementById('editUserOverlay').classList.add('active');
};

window.toggleEditEntrenador = () => {
  const rol = document.getElementById('editUserRol').value;
  document.getElementById('editGrupoEntrenador').style.display = rol === 'nadador' ? 'block' : 'none';
};

window.guardarEdicionUsuario = async () => {
  const uid    = document.getElementById('editUserUid').value;
  const nombre = document.getElementById('editUserNombre').value.trim();
  const rol    = document.getElementById('editUserRol').value;
  const entrenador = document.getElementById('editUserEntrenador').value;
  const errEl  = document.getElementById('editUserError');
  if (!nombre) { errEl.textContent = 'El nombre no puede estar vacío.'; errEl.style.display = 'block'; return; }
  try {
    await set(ref(db, `usuarios/${uid}/nombre`), nombre);
    await set(ref(db, `usuarios/${uid}/rol`), rol);
    if (rol === 'nadador') {
      await set(ref(db, `usuarios/${uid}/id_entrenador`), entrenador || null);
    } else {
      await set(ref(db, `usuarios/${uid}/id_entrenador`), null);
    }
    window.closeModal('editUserOverlay');
  } catch (e) {
    errEl.textContent = 'Error al guardar. Verificá los permisos.';
    errEl.style.display = 'block';
  }
};

window.eliminarUsuario = async (uid, nombre) => {
  if (!confirm(`¿Eliminás al usuario "${nombre}" y todos sus datos? Esta acción no se puede deshacer.`)) return;
  try {
    await set(ref(db, `usuarios/${uid}`), null);
  } catch (e) { alert('Error al eliminar. Verificá los permisos de Firebase.'); }
};

// Records admin — expuesta globalmente para que el onchange del select funcione
window.cargarRecordsAdmin = function cargarRecordsAdmin() {
  const estilo = document.getElementById('filtroEstiloRecords')?.value || 'Crol';
  const buscar = document.getElementById('buscarRecord')?.value.toLowerCase() || '';
  const tbody  = document.getElementById('tablaRecordsCuerpo');
  const vacio  = document.getElementById('recordsVacio');
  if (!tbody) return;

  const filas = Object.entries(todosRecordsAdmin)
    .filter(([, r]) => r.estilo === estilo && (!buscar || (r.nombre_nadador||'').toLowerCase().includes(buscar)))
    .map(([rid, r]) => ({ rid, ...r }));

  filas.sort((a, b) => a.segundos - b.segundos);

  if (filas.length === 0) {
    tbody.innerHTML = '';
    if (vacio) vacio.style.display = 'block';
    return;
  }
  if (vacio) vacio.style.display = 'none';

  tbody.innerHTML = filas.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${r.nombre_nadador}</strong></td>
      <td>${formatTiempo(r.segundos)}</td>
      <td>${r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR') : '—'}</td>
      <td>${r.registradoPor && r.registradoPor !== 'Nadador' ? `<span class="badge-coach">📋 ${r.registradoPor}</span>` : 'Nadador'}</td>
      <td>
        <button class="btn-admin-edit" onclick="abrirEditarRecord('${r.rid}')">✏️ Editar</button>
        <button class="btn-admin-delete" onclick="eliminarRecord('${r.rid}')">🗑️ Eliminar</button>
      </td>
    </tr>`).join('');
}

window.eliminarRecord = async (rid) => {
  if (!confirm('¿Eliminás este récord?')) return;
  try {
    await set(ref(db, `records/${rid}`), null);
  } catch (e) { alert('Error al eliminar récord.'); }
};

// Agregar récord manual
function poblarSelectNadadores() {
  const select = document.getElementById('addRecordNadador');
  if (!select) return;
  select.innerHTML = '';
  Object.entries(todosUsuariosAdmin)
    .filter(([, u]) => u.rol === 'nadador')
    .forEach(([uid, u]) => {
      const opt = document.createElement('option');
      opt.value = uid;
      opt.textContent = u.nombre;
      select.appendChild(opt);
    });
}

window.openAddRecord = () => {
  document.getElementById('addRecordError').style.display = 'none';
  document.getElementById('addRecordTiempo').value = '';
  poblarSelectNadadores();
  document.getElementById('addRecordOverlay').classList.add('active');
};

window.guardarRecordManual = async () => {
  const uid    = document.getElementById('addRecordNadador').value;
  const estilo = document.getElementById('addRecordEstilo').value;
  const tiempo = document.getElementById('addRecordTiempo').value.trim();
  const errEl  = document.getElementById('addRecordError');
  errEl.style.display = 'none';

  const partes = tiempo.split(':');
  if (partes.length !== 2 || isNaN(partes[0]) || isNaN(partes[1])) {
    errEl.textContent = 'Formato inválido. Usá mm:ss (ej: 01:23)';
    errEl.style.display = 'block';
    return;
  }
  const segundos = parseInt(partes[0]) * 60 + parseInt(partes[1]);
  if (segundos < 1) { errEl.textContent = 'El tiempo debe ser mayor a 0.'; errEl.style.display = 'block'; return; }

  const u = todosUsuariosAdmin[uid];
  try {
    await push(ref(db, 'records'), {
      uid_nadador:    uid,
      nombre_nadador: u?.nombre || '—',
      estilo,
      segundos,
      fecha: new Date().toISOString(),
      registradoPor: 'Admin'
    });
    window.closeModal('addRecordOverlay');
  } catch (e) {
    errEl.textContent = 'Error al guardar. Verificá los permisos.';
    errEl.style.display = 'block';
  }
};

let uidEntrenadorVerAlumnos = null;

window.verAlumnosEntrenador = (uid) => {
  uidEntrenadorVerAlumnos = uid;
  const e = todosUsuariosAdmin[uid];
  if (!e) return;
  document.getElementById('verAlumnosNombre').textContent = e.nombre;
  renderListaAlumnos(uid);
  // Poblar select transferencia masiva
  const sel = document.getElementById('selectTransferirEntrenador');
  sel.innerHTML = '<option value="">— Elegir entrenador —</option>';
  Object.entries(todosUsuariosAdmin)
    .filter(([euid, u]) => u.rol === 'entrenador' && euid !== uid)
    .forEach(([euid, u]) => {
      const opt = document.createElement('option');
      opt.value = euid;
      opt.textContent = u.nombre;
      sel.appendChild(opt);
    });
  document.getElementById('verAlumnosOverlay').classList.add('active');
};

function renderListaAlumnos(uid) {
  const contenido = document.getElementById('verAlumnosContenido');
  const alumnos = Object.entries(todosUsuariosAdmin).filter(([, u]) => u.id_entrenador === uid && u.rol === 'nadador');
  if (alumnos.length === 0) {
    contenido.innerHTML = '<div class="record-empty">Sin alumnos asignados.</div>';
    return;
  }
  contenido.innerHTML = alumnos.map(([auid, u]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eee;">
      <div>
        <div style="font-weight:600;">${u.nombre}</div>
        <div style="font-size:0.82em;color:#888;">${u.email || ''}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn-admin-edit" style="font-size:0.8em;" onclick="abrirTransferirAlumno('${auid}')">Transferir</button>
        <button class="btn-admin-delete" style="font-size:0.8em;" onclick="desasignarAlumnoAdmin('${auid}')">Quitar</button>
      </div>
    </div>`).join('');
}

let uidAlumnoATransferir = null;

window.abrirTransferirAlumno = (auid) => {
  uidAlumnoATransferir = auid;
  const sel = document.getElementById('selectTransferirIndividual');
  sel.innerHTML = '<option value="">— Elegir entrenador —</option>';
  Object.entries(todosUsuariosAdmin)
    .filter(([euid, u]) => u.rol === 'entrenador' && euid !== uidEntrenadorVerAlumnos)
    .forEach(([euid, u]) => {
      const opt = document.createElement('option');
      opt.value = euid;
      opt.textContent = u.nombre;
      sel.appendChild(opt);
    });
  document.getElementById('transferirAlumnoOverlay').classList.add('active');
};

window.confirmarTransferirAlumno = async () => {
  const nuevoUid = document.getElementById('selectTransferirIndividual')?.value;
  if (!nuevoUid) { alert('Elegí un entrenador destino.'); return; }
  try {
    await set(ref(db, `usuarios/${uidAlumnoATransferir}/id_entrenador`), nuevoUid);
    window.closeModal('transferirAlumnoOverlay');
    renderListaAlumnos(uidEntrenadorVerAlumnos);
  } catch (e) { alert('Error al transferir.'); }
};

window.transferirAlumno = async (auid) => {
  const nuevoUid = document.getElementById(`transfer-${auid}`)?.value;
  if (!nuevoUid) { alert('Elegí un entrenador destino.'); return; }
  try {
    await set(ref(db, `usuarios/${auid}/id_entrenador`), nuevoUid);
    renderListaAlumnos(uidEntrenadorVerAlumnos);
  } catch (e) { alert('Error al transferir.'); }
};

window.transferirTodosAlumnos = async () => {
  const nuevoUid = document.getElementById('selectTransferirEntrenador')?.value;
  if (!nuevoUid) { alert('Elegí un entrenador destino.'); return; }
  if (!confirm('¿Transferís todos los alumnos a este entrenador?')) return;
  const alumnos = Object.entries(todosUsuariosAdmin)
    .filter(([, u]) => u.id_entrenador === uidEntrenadorVerAlumnos && u.rol === 'nadador');
  try {
    await Promise.all(alumnos.map(([auid]) => set(ref(db, `usuarios/${auid}/id_entrenador`), nuevoUid)));
    renderListaAlumnos(uidEntrenadorVerAlumnos);
  } catch (e) { alert('Error al transferir.'); }
};

window.desasignarAlumnoAdmin = async (auid) => {
  if (!confirm('¿Quitás a este alumno del entrenador?')) return;
  try {
    await set(ref(db, `usuarios/${auid}/id_entrenador`), null);
    renderListaAlumnos(uidEntrenadorVerAlumnos);
  } catch (e) { alert('Error al desasignar.'); }
};

window.verRecordsNadador = (uid) => {
  const u = todosUsuariosAdmin[uid];
  if (!u) return;
  document.getElementById('verRecordsNombre').textContent = u.nombre;
  const contenido = document.getElementById('verRecordsContenido');
  const records = Object.values(todosRecordsAdmin).filter(r => r.uid_nadador === uid);
  const estilos = ['Crol', 'Espalda', 'Mariposa'];
  contenido.innerHTML = estilos.map(estilo => {
    const mejor = records.filter(r => r.estilo === estilo).sort((a, b) => a.segundos - b.segundos)[0];
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #eee;">
        <span style="font-weight:600;">${estilo}</span>
        ${mejor
          ? `<span style="color:var(--accent);font-weight:700;">${formatTiempo(mejor.segundos)}</span>`
          : `<span style="color:#aaa;">Sin registros</span>`
        }
      </div>`;
  }).join('');
  document.getElementById('verRecordsOverlay').classList.add('active');
};

window.abrirEditarRecord = (rid) => {
  const r = todosRecordsAdmin[rid];
  if (!r) return;
  document.getElementById('editRecordId').value = rid;
  document.getElementById('editRecordSubtitle').textContent = `${r.nombre_nadador} — ${r.estilo}`;
  const m = String(Math.floor(r.segundos / 60)).padStart(2, '0');
  const s = String(r.segundos % 60).padStart(2, '0');
  document.getElementById('editRecordTiempo').value = `${m}:${s}`;
  document.getElementById('editRecordFecha').value = r.fecha ? r.fecha.split('T')[0] : '';
  document.getElementById('editRecordError').style.display = 'none';
  document.getElementById('editRecordOverlay').classList.add('active');
};

window.guardarEdicionRecord = async () => {
  const rid    = document.getElementById('editRecordId').value;
  const tiempo = document.getElementById('editRecordTiempo').value.trim();
  const fecha  = document.getElementById('editRecordFecha').value;
  const errEl  = document.getElementById('editRecordError');
  errEl.style.display = 'none';
  const partes = tiempo.split(':');
  if (partes.length !== 2 || isNaN(partes[0]) || isNaN(partes[1])) {
    errEl.textContent = 'Formato inválido. Usá mm:ss';
    errEl.style.display = 'block';
    return;
  }
  const segundos = parseInt(partes[0]) * 60 + parseInt(partes[1]);
  if (segundos < 1) { errEl.textContent = 'El tiempo debe ser mayor a 0.'; errEl.style.display = 'block'; return; }
  try {
    await set(ref(db, `records/${rid}/segundos`), segundos);
    if (fecha) await set(ref(db, `records/${rid}/fecha`), new Date(fecha).toISOString());
    window.closeModal('editRecordOverlay');
  } catch (e) {
    errEl.textContent = 'Error al guardar.';
    errEl.style.display = 'block';
  }
};

window.adminTab = (tab) => {
  ['usuarios','records'].forEach(t => {
    const content = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (content) content.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.admin-tab').forEach((btn, i) => {
    const tabs = ['usuarios','records'];
    btn.classList.toggle('active', tabs[i] === tab);
  });
  if (tab === 'records') window.cargarRecordsAdmin();
};

// --- FORZAR LIBERACIÓN DE CARRIL (entrenador/admin) ---
window.forzarLiberacionCarril = async () => {
  if (!confirm('¿Resetear carril_1 y dejarlo LIBRE?')) return;
  await liberarCarril('carril_1');
  alert('✅ Carril liberado correctamente.');
};

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('overlay')) e.target.classList.remove('active');
});

window.addEventListener('scroll', () => {
  document.querySelector('nav')?.classList.toggle('scrolled', window.scrollY > 40);
});

cargarComponentes();
