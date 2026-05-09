/**
 * SCRIPT DE SUBIDA MANUAL (ANTIGRAVITY)
 * Este script sube la función 'send-push' sin usar el CLI de Supabase.
 */
const fs = require('fs');
const https = require('https');

// --- CONFIGURACIÓN ---
const ACCESS_TOKEN = 'REEMPLAZA_CON_TU_TOKEN'; 
const PROJECT_ID = 'kvrkrlvjfrdwxfolcbon';
const FUNCTION_NAME = 'send-push';
const FILE_PATH = './supabase/functions/send-push/index.ts';

// ---------------------

const code = fs.readFileSync(FILE_PATH, 'utf8');

const options = {
    hostname: 'api.supabase.com',
    port: 443,
    path: `/v1/projects/${PROJECT_ID}/functions/${FUNCTION_NAME}`,
    method: 'PATCH',
    headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    }
};

console.log(`🚀 Intentando subir función '${FUNCTION_NAME}' a proyecto '${PROJECT_ID}'...`);

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
            console.log('✅ ¡ÉXITO! La función se ha subido correctamente.');
        } else {
            console.error(`❌ ERROR (${res.statusCode}):`, body);
        }
    });
});

req.on('error', (e) => console.error('❌ Error de conexión:', e));
req.write(JSON.stringify({
    name: FUNCTION_NAME,
    slug: FUNCTION_NAME,
    body: code,
    verify_jwt: false
}));
req.end();
