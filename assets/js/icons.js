/**
 * Phosphor Icons helper — devuelve HTML string para usar en template literals.
 * Requiere @phosphor-icons/web cargado en index.html.
 *
 * Pesos disponibles: bold (default), regular, fill, thin, light, duotone
 */
export const ph = (name, { size = '1em', color = '', weight = 'bold', ml = '', mr = '' } = {}) => {
    const cls = weight === 'regular' ? 'ph' : `ph-${weight}`;
    const parts = [];
    if (size  !== '1em') parts.push(`font-size:${size}`);
    if (color)           parts.push(`color:${color}`);
    if (ml)              parts.push(`margin-left:${ml}`);
    if (mr)              parts.push(`margin-right:${mr}`);
    const st = parts.length ? ` style="${parts.join(';')}"` : '';
    return `<i class="${cls} ph-${name}"${st}></i>`;
};

// ── Iconos semánticos de la app ───────────────────────────────────────────────

// Navegación
export const I = {
    dashboard:    (s = '1.1em') => ph('chart-bar',           { size: s }),
    creators:     (s = '1.1em') => ph('users',               { size: s }),
    channels:     (s = '1.1em') => ph('megaphone-simple',    { size: s }),
    bell:         (s = '1.1em') => ph('bell',                { size: s }),
    points:       (s = '1.1em') => ph('star',                { size: s }),
    diamond:      (s = '1.1em') => ph('diamond',             { size: s }),
    missions:     (s = '1.1em') => ph('target',              { size: s }),
    rules:        (s = '1.1em') => ph('clipboard-text',      { size: s }),
    trainings:    (s = '1.1em') => ph('graduation-cap',      { size: s }),
    events:       (s = '1.1em') => ph('calendar-blank',      { size: s }),
    profile:      (s = '1.1em') => ph('user',                { size: s }),
    manager:      (s = '1.1em') => ph('briefcase',           { size: s }),
    admin:        (s = '1.1em') => ph('key',                 { size: s }),
    myMetrics:    (s = '1.1em') => ph('video-camera',        { size: s }),
    install:      (s = '1.1em') => ph('device-mobile',       { size: s }),

    // Acciones
    add:          (s = '1em')   => ph('plus',                { size: s }),
    edit:         (s = '1em')   => ph('pencil-simple',       { size: s }),
    trash:        (s = '1em')   => ph('trash',               { size: s }),
    save:         (s = '1em')   => ph('floppy-disk',         { size: s }),
    send:         (s = '1em')   => ph('paper-plane-right',   { size: s }),
    notify:       (s = '1em')   => ph('megaphone',           { size: s }),
    search:       (s = '1em')   => ph('magnifying-glass',    { size: s }),
    close:        (s = '1em')   => ph('x',                   { size: s }),
    upload:       (s = '1em')   => ph('upload-simple',       { size: s }),
    download:     (s = '1em')   => ph('download-simple',     { size: s }),
    check:        (s = '1em')   => ph('check',               { size: s }),
    checkCircle:  (s = '1em')   => ph('check-circle',        { size: s }),
    warning:      (s = '1em')   => ph('warning',             { size: s }),
    info:         (s = '1em')   => ph('info',                { size: s }),
    refresh:      (s = '1em')   => ph('arrows-clockwise',    { size: s }),
    external:     (s = '1em')   => ph('arrow-square-out',    { size: s }),
    chevronDown:  (s = '1em')   => ph('caret-down',          { size: s }),

    // Estado de misiones
    lock:         (s = '1em')   => ph('lock',                { size: s }),
    lightning:    (s = '1em')   => ph('lightning',           { size: s }),
    trophy:       (s = '1em')   => ph('trophy',              { size: s }),
    clock:        (s = '1em')   => ph('clock',               { size: s }),

    // Admin cards
    auditCard:    () => ph('chart-bar-horizontal', { size: '1.6rem' }),
    manageCard:   () => ph('users-three',          { size: '1.6rem' }),
    uploadCard:   () => ph('upload-simple',        { size: '1.6rem' }),
    historyCard:  () => ph('trend-up',             { size: '1.6rem' }),
    channelsCard: () => ph('megaphone-simple',     { size: '1.6rem' }),
    missionsCard: () => ph('target',               { size: '1.6rem' }),
};
