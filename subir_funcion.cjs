/**
 * SCRIPT DE SUBIDA MANUAL (ANTIGRAVITY)
 */
const fs = require('fs');
const https = require('https');

const ACCESS_TOKEN = 'REEMPLAZA_CON_TU_TOKEN'; 
const PROJECT_ID = 'kvrkrlvjfrdwxfolcbon';
const FUNCTION_NAME = 'send-push';
const FILE_PATH = './supabase/functions/send-push/index.ts';

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

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
            console.log('✅ ¡ÉXITO!');
        } else {
            console.error(`❌ ERROR (${res.statusCode}):`, body);
        }
    });
});

req.on('error', (e) => console.error('❌ Error:', e));
req.write(JSON.stringify({
    name: FUNCTION_NAME,
    slug: FUNCTION_NAME,
    body: code,
    verify_jwt: false
}));
req.end();
