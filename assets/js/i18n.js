// ── Locale detection & translations ──────────────────────────────────────────
// Only creator-facing UI is translated. Admin/manager UI stays in Spanish.

const T = {
    es: {
        // Navigation
        'nav.dashboard':   'Dashboard',
        'nav.messages':    'Mensajes',
        'nav.rules':       'Normas',
        'nav.channels':    'Canales',
        'nav.trainings':   'Capacitaciones',
        'nav.events':      'Eventos',
        'nav.profile':     'Perfil',
        'nav.install':     'Instalar App',
        'nav.install_mob': 'Instalar',
        'nav.logout':      'Cerrar Sesión',
        'nav.logout_mob':  'Salir',
        'nav.install_ios': 'En iOS: pulsa el botón "Compartir" (abajo) y luego "Añadir a pantalla de inicio" 📲',

        // Creator dashboard tabs
        'tab.metrics':   '📊 Métricas',
        'tab.goals':     '🎯 Objetivos',
        'tab.benefits':  '🎁 Beneficios',
        'tab.missions':  '🚀 Misiones',
        'tab.challenge': '🏆 Reto 90d',
        'tab.inbox':     '🔔 Mensajes',
        'tab.update':    '✏️ Actualizar',

        // Metrics submission form
        'metrics.title':       'Mis métricas del mes',
        'metrics.desc':        'Cargá tus métricas de TikTok del mes actual. Podés actualizar estos valores cuando quieras hasta el cierre del período.',
        'metrics.valid_days':  'DÍAS VÁLIDOS (0–31)',
        'metrics.live_hours':  'HORAS DE LIVE (HH:MM o HH:MM:SS)',
        'metrics.diamonds':    'DIAMANTES TOTALES DEL MES',
        'metrics.save':        'Guardar métricas',
        'metrics.saving':      'Guardando...',
        'metrics.ph_days':     'ej: 18',
        'metrics.ph_hours':    'ej: 42:30',
        'metrics.ph_diamonds': 'ej: 125000',
        'metrics.err_days':    'Días válidos debe estar entre 0 y 31.',
        'metrics.err_hours':   'Formato de horas inválido. Usá HH:MM o HH:MM:SS (ej: 42:30).',
        'metrics.err_diamonds':'Los diamantes no pueden ser negativos.',
        'metrics.err_generic': 'Error al guardar. Intenta de nuevo.',

        // Daily tracker
        'daily.section':    'Seguimiento Diario',
        'daily.today':      'Hoy',
        'daily.saved':      'Guardado',
        'daily.streamed':   'Transmití hoy',
        'daily.valid_note': '(cuenta como día válido)',
        'daily.diamonds':   'Diamantes de hoy',
        'daily.time':       'Tiempo live (HH:MM)',
        'daily.goal':       'Meta',
        'daily.save_day':   '+ Guardar día',
        'daily.update_day': '✏️ Actualizar hoy',
        'daily.sync':       '📤 Cargar al perfil',
        'daily.syncing':    'Guardando...',
        'daily.synced':     '✓ Guardado',
        'daily.valid_days': 'días válidos',
        'daily.live':       'en live',
        'daily.past':       'Días anteriores',
        'daily.time_err':   'Formato inválido. Usá HH:MM (ej: 1:30).',

        // Inbox
        'inbox.title':       '🔔 Mensajes',
        'inbox.empty_title': 'Sin mensajes',
        'inbox.empty_sub':   'Aquí verás los mensajes que te envíe el equipo de Interactik.',
        'inbox.error':       'Error al cargar mensajes',
        'inbox.view_more':   'Ver más →',
        'inbox.section':     'Mensajes del equipo',
        'inbox.go_section':  'Ir a la sección',
        'inbox.just_now':    'hace un momento',
        'inbox.min_ago':     'hace {n} min',
        'inbox.h_ago':       'hace {n}h',
    },
    en: {
        // Navigation
        'nav.dashboard':   'Dashboard',
        'nav.messages':    'Messages',
        'nav.rules':       'Rules',
        'nav.channels':    'Channels',
        'nav.trainings':   'Trainings',
        'nav.events':      'Events',
        'nav.profile':     'Profile',
        'nav.install':     'Install App',
        'nav.install_mob': 'Install',
        'nav.logout':      'Sign Out',
        'nav.logout_mob':  'Exit',
        'nav.install_ios': 'On iOS: tap the "Share" button (below) then "Add to Home Screen" 📲',

        // Creator dashboard tabs
        'tab.metrics':   '📊 Metrics',
        'tab.goals':     '🎯 Goals',
        'tab.benefits':  '🎁 Benefits',
        'tab.missions':  '🚀 Missions',
        'tab.challenge': '🏆 90d Challenge',
        'tab.inbox':     '🔔 Messages',
        'tab.update':    '✏️ Update',

        // Metrics submission form
        'metrics.title':       'My Monthly Metrics',
        'metrics.desc':        'Enter your TikTok metrics for the current month. You can update these values any time before the period closes.',
        'metrics.valid_days':  'VALID DAYS (0–31)',
        'metrics.live_hours':  'LIVE HOURS (HH:MM or HH:MM:SS)',
        'metrics.diamonds':    'TOTAL MONTHLY DIAMONDS',
        'metrics.save':        'Save metrics',
        'metrics.saving':      'Saving...',
        'metrics.ph_days':     'e.g.: 18',
        'metrics.ph_hours':    'e.g.: 42:30',
        'metrics.ph_diamonds': 'e.g.: 125000',
        'metrics.err_days':    'Valid days must be between 0 and 31.',
        'metrics.err_hours':   'Invalid format. Use HH:MM or HH:MM:SS (e.g.: 42:30).',
        'metrics.err_diamonds':'Diamonds cannot be negative.',
        'metrics.err_generic': 'Error saving. Please try again.',

        // Daily tracker
        'daily.section':    'Daily Tracking',
        'daily.today':      'Today',
        'daily.saved':      'Saved',
        'daily.streamed':   'I streamed today',
        'daily.valid_note': '(counts as a valid day)',
        'daily.diamonds':   "Today's diamonds",
        'daily.time':       'Live time (HH:MM)',
        'daily.goal':       'Goal',
        'daily.save_day':   '+ Save day',
        'daily.update_day': '✏️ Update today',
        'daily.sync':       '📤 Sync to profile',
        'daily.syncing':    'Saving...',
        'daily.synced':     '✓ Saved',
        'daily.valid_days': 'valid days',
        'daily.live':       'live time',
        'daily.past':       'Previous days',
        'daily.time_err':   'Invalid format. Use HH:MM (e.g.: 1:30).',

        // Inbox
        'inbox.title':       '🔔 Messages',
        'inbox.empty_title': 'No messages',
        'inbox.empty_sub':   'Messages from the Interactik team will appear here.',
        'inbox.error':       'Error loading messages',
        'inbox.view_more':   'View more →',
        'inbox.section':     'Team messages',
        'inbox.go_section':  'Go to section',
        'inbox.just_now':    'just now',
        'inbox.min_ago':     '{n} min ago',
        'inbox.h_ago':       '{n}h ago',
    },
};

let _lang = 'es';

/**
 * Detecta el locale del navegador y lo persiste.
 * Solo en-US activa la interfaz en inglés. Cualquier otra locale → español.
 * @returns {{ lang: string, agency: string, isNew: boolean }}
 */
export function setupLocale() {
    const stored = localStorage.getItem('ce_lang');
    if (stored === 'en' || stored === 'es') {
        _lang = stored;
        return { lang: _lang, agency: _lang === 'en' ? 'usa' : 'latam', isNew: false };
    }
    const nav = (navigator.language || navigator.userLanguage || 'es').toLowerCase();
    // Solo en-US activa inglés (evita falsos positivos para creadores LATAM con browser en inglés)
    _lang = nav === 'en-us' ? 'en' : 'es';
    localStorage.setItem('ce_lang', _lang);
    return { lang: _lang, agency: _lang === 'en' ? 'usa' : 'latam', isNew: true };
}

/** Agencia inferida del locale actual. */
export function detectAgency() {
    return _lang === 'en' ? 'usa' : 'latam';
}

export function getLang()   { return _lang; }

export function setLang(lang) {
    if (lang !== 'es' && lang !== 'en') return;
    _lang = lang;
    localStorage.setItem('ce_lang', lang);
}

/**
 * Traduce una clave. Soporta sustitución: t('inbox.min_ago', { n: 5 }) → "5 min ago"
 */
export function t(key, vars = {}) {
    let str = T[_lang]?.[key] ?? T.es[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, v);
    }
    return str;
}
