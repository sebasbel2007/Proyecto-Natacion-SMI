const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { URL } = require('url');

// 👇 NUEVA FORMA DE IMPORTAR FIREBASE ADMIN (Versiones 12+)
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase }         = require('firebase-admin/database');

// ── FIREBASE ADMIN ───────────────────────────────────────────────────────────
// En Render (o cualquier host) se puede definir FIREBASE_SERVICE_ACCOUNT (JSON
// completo) y FIREBASE_DATABASE_URL por variables de entorno. En local se sigue
// usando serviceAccountKey.json y la URL por defecto.
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
        console.error('❌ FIREBASE_SERVICE_ACCOUNT no es JSON válido:', e.message);
        process.exit(1);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
    } catch (e) {
        console.error('❌ No se encontró serviceAccountKey.json ni FIREBASE_SERVICE_ACCOUNT.');
        process.exit(1);
    }
}

const databaseURL = process.env.FIREBASE_DATABASE_URL || 'https://club-de-natacion-smi-default-rtdb.firebaseio.com';

// 👇 NUEVA FORMA DE INICIALIZAR LA APP
const app = initializeApp({
    credential: cert(serviceAccount),
    databaseURL
});

// 👇 NUEVA FORMA DE LLAMAR A LA BASE DE DATOS
const db = getDatabase(app);

const CARRIL_ID  = 'carril_1';
const CARRIL_REF = db.ref(`carriles/${CARRIL_ID}`);

const ESTADO_LIBRE = {
    esperando:    false,
    estadoFisico: 'LIBRE',
    recordActual: 9999,
    uid_nadador:  '',
    ultimoTiempo: 0
};

// ── SERVIDOR HTTP ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const MIME = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
};

http.createServer(async (req, res) => {
    const urlProcesada = new URL(req.url, `http://localhost:${PORT}`);
    const ruta = urlProcesada.pathname;

    // ── RUTA 1: POLLING DEL ARDUINO (/estado_carril) ────────────────────────
    if (ruta === '/estado_carril') {
        try {
            const snap = await CARRIL_REF.once('value');
            const carril = snap.val();
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            if (carril?.esperando) {
                res.end(`CMD:START,${(carril.recordActual || 9999).toFixed(2)}`);
                console.log(`📡 Polling -> CMD:START | Record: ${carril.recordActual}s | Nadador: ${carril.uid_nadador}`);
            } else {
                res.end('CMD:WAIT,0');
            }
        } catch (e) {
            console.error('❌ Error leyendo carril:', e.message);
            res.writeHead(500);
            res.end('ERROR');
        }
        return;
    }

    // ── RUTA 2: NOTIFICACIONES DEL ARDUINO (/notificar) ─────────────────────
    if (ruta === '/notificar') {
        const evento = urlProcesada.searchParams.get('evento');
        const tiempo = parseFloat(urlProcesada.searchParams.get('tiempo') || '0');
        const logStr = urlProcesada.searchParams.get('log') || '';

        console.log(`\n[📡 ARDUINO] Evento: ${evento}`);

        // Responder OK inmediatamente para no trabar al Arduino
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');

        // Procesar el evento de forma asíncrona
        try {
            switch (evento) {

                case 'SISTEMA_INICIANDO':
                    console.log('⚡ Arduino encendido. Liberando carril por seguridad.');
                    await CARRIL_REF.set(ESTADO_LIBRE);
                    break;

                case 'START_RECIBIDO':
                    console.log('✅ Arduino recibió la orden. Actualizando estadoFisico.');
                    await CARRIL_REF.update({ estadoFisico: 'ESPERANDO_NADADOR' });
                    break;

                case 'MODO_LOCAL':
                    console.log('⚠️ Arduino en Modo Manual OFFLINE. Bloqueando carril hasta reset manual.');
                    await CARRIL_REF.update({ estadoFisico: 'MODO_LOCAL', esperando: false });
                    // NO liberamos automáticamente — el carril queda bloqueado
                    // hasta que el Arduino mande RESET o SISTEMA_INICIANDO
                    break;

                case 'RESET':
                    console.log('🔄 Reset físico. Liberando carril.');
                    await CARRIL_REF.set(ESTADO_LIBRE);
                    break;

                case 'FALSA_SALIDA':
                    console.log('❌ ¡SALIDA FALSA! Notificando al frontend.');
                    await CARRIL_REF.update({ estadoFisico: 'SALIDA_FALSA', esperando: false });
                    break;

                case 'FIN': {
                    const tiempoSeg = Math.round(tiempo);
                    console.log(`🏁 FIN | Tiempo: ${tiempoSeg}s`);

                    if (logStr) {
                        console.log('--- RECONSTRUCCIÓN DE LA CARRERA ---');
                        if (logStr.includes('SEQ-')) console.log(' ⏱️ Nadador en plataforma.');
                        if (logStr.includes('GO-'))  console.log(' 🟢 ¡Largada!');
                        if (logStr.includes('IDA'))  console.log(' 🏊 Toque de IDA.');
                        console.log('------------------------------------');
                    }

                    // Leer quién está en el carril
                    const snap = await CARRIL_REF.once('value');
                    const carril = snap.val();
                    const uid = carril?.uid_nadador;

                    if (uid) {
                        // Leer nombre del nadador
                        const userSnap = await db.ref(`usuarios/${uid}/nombre`).once('value');
                        const nombre = userSnap.val() || '—';

                        // Leer estilo — guardado en el carril cuando el frontend lo asignó
                        const estilo = carril?.estilo || 'Crol';

                        // Guardar récord en records/
                        await db.ref('records').push({
                            uid_nadador:    uid,
                            nombre_nadador: nombre,
                            estilo,
                            segundos:       tiempoSeg,
                            fecha:          new Date().toISOString(),
                            registradoPor:  'Hardware'
                        });
                        console.log(`✅ Récord guardado: ${nombre} | ${estilo} | ${tiempoSeg}s`);
                    } else {
                        console.warn('⚠️ FIN recibido pero no hay uid_nadador en el carril.');
                    }

                    // Poner esperando: false INMEDIATAMENTE para que el Arduino
                    // no vuelva a leer CMD:START en el próximo polling
                    await CARRIL_REF.update({
                        esperando:    false,
                        estadoFisico: 'FIN',
                        ultimoTiempo: tiempoSeg
                    });

                    // Pequeña pausa para que el frontend lea el FIN antes de liberar
                    await new Promise(r => setTimeout(r, 3000));
                    await CARRIL_REF.set(ESTADO_LIBRE);
                    console.log('✅ Carril liberado. Arduino volverá a reposo en el próximo polling.');
                    break;
                }

                default:
                    console.log(`Evento desconocido: ${evento}`);
            }
        } catch (e) {
            console.error('❌ Error procesando evento:', e.message);
        }
        return;
    }

    // ── RUTA 3: SERVIR ARCHIVOS DE LA APP WEB ───────────────────────────────
    let filePath = path.join(__dirname, ruta === '/' ? 'index.html' : ruta);
    const ext = path.extname(filePath);

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
        res.end(data);
    });

}).listen(PORT, () => {
    console.log('=================================================');
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📡 Escuchando /estado_carril y /notificar`);
    console.log(`🔥 Firebase Admin conectado`);
    console.log('=================================================');
});