// Pantalla de admin: "Configuración de Comisiones" — edita, por agencia, el
// objetivo mensual de diamantes y las tasas/umbrales de la fórmula de
// compensación de managers (ver assets/js/managerComp.js y
// MANAGER_COMP_SQL.sql). Sin esto, esos números quedarían hardcodeados como
// en config.js — acá el admin los ajusta sin depender de un deploy.
import { appState } from '../main.js';
import { managerComp } from '../api.js';

const AGENCY_OPTS = [
    { id: 'latam', label: '🌎 LATAM' },
    { id: 'usa',   label: '🇺🇸 USA'  },
];

const FIELDS = [
    { group: 'Objetivo de la agencia', items: [
        { key: 'objetivo_mensual', label: 'Objetivo mensual de diamantes', type: 'number' },
    ]},
    { group: 'Pago base — Tier 1', items: [
        { key: 'tier1_nuevos',    label: 'Nuevos reclutados mínimos', type: 'number' },
        { key: 'tier1_monetizan', label: 'Puntaje de monetización mínimo', type: 'number', step: '0.1' },
        { key: 'tier1_graduados', label: 'Graduados mínimos', type: 'number' },
        { key: 'tier1_pago',      label: 'Pago ($)', type: 'number' },
    ]},
    { group: 'Pago base — Tier 2', items: [
        { key: 'tier2_nuevos',    label: 'Nuevos reclutados mínimos', type: 'number' },
        { key: 'tier2_monetizan', label: 'Puntaje de monetización mínimo', type: 'number', step: '0.1' },
        { key: 'tier2_graduados', label: 'Graduados mínimos', type: 'number' },
        { key: 'tier2_pago',      label: 'Pago ($)', type: 'number' },
    ]},
    { group: 'Umbrales de "productor real"', items: [
        { key: 'umbral_monetizan_completo', label: 'Diamantes para monetización completa', type: 'number' },
        { key: 'umbral_monetizan_parcial',  label: 'Diamantes para monetización parcial', type: 'number' },
        { key: 'peso_monetizan_parcial',    label: 'Peso de la monetización parcial (0-1)', type: 'number', step: '0.1' },
    ]},
    { group: 'Comisión por rango', items: [
        { key: 'tasa_subir',    label: 'Tasa al subir de rango (%)', type: 'number', step: '0.1' },
        { key: 'tasa_mantener', label: 'Tasa al mantener rango alto (%)', type: 'number', step: '0.1' },
    ]},
    { group: 'Comisión por actividad', items: [
        { key: 'tasas_actividad', label: 'Tasas por tier de actividad (%, separadas por coma — 5 valores)', type: 'array' },
    ]},
    { group: 'Comisión por incremento de ingresos', items: [
        { key: 'incremento_tiers_min', label: '% del objetivo mensual que activa cada tasa (separados por coma)', type: 'array' },
        { key: 'tasas_incremento',     label: 'Tasas correspondientes (%, mismo orden)', type: 'array' },
    ]},
];

function fieldValue(settings, f) {
    const v = settings[f.key];
    if (f.type === 'array') return Array.isArray(v) ? v.join(', ') : '';
    return v ?? '';
}

function parseFieldValue(raw, f) {
    if (f.type === 'array') {
        return raw.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    }
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : n;
}

export async function renderCompSettingsView(container) {
    container.innerHTML = `<div class="skel-panel" style="height:400px;"></div>`;

    let selectedAgency = localStorage.getItem('ce_agency') || 'latam';

    async function load() {
        container.innerHTML = `<div class="skel-panel" style="height:400px;"></div>`;
        let settings;
        try {
            settings = await managerComp.getSettings(selectedAgency);
        } catch (err) {
            container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">Error: ${err.message}</div>`;
            return;
        }
        renderForm(settings);
    }

    function renderForm(settings) {
        container.innerHTML = `
            <div class="animate-fadeIn">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:1.5rem;">
                    <div>
                        <h2 style="margin:0;">Configuración de Comisiones</h2>
                        <p class="text-sm text-muted" style="margin-top:0.2rem;">Objetivo mensual y tasas de pago a managers, por agencia.</p>
                    </div>
                    <div style="display:flex;gap:0.3rem;background:rgba(0,0,0,0.25);border-radius:var(--radius-md);padding:0.2rem;">
                        ${AGENCY_OPTS.map(a => `
                            <button class="cs-ag-btn" data-ag="${a.id}"
                                style="background:${selectedAgency === a.id ? 'var(--bg-elevated,#141720)' : 'transparent'};
                                       border:none;color:${selectedAgency === a.id ? 'var(--text-primary)' : 'var(--text-muted)'};
                                       font-size:0.82rem;font-weight:700;padding:0.38rem 0.9rem;border-radius:var(--radius-sm);
                                       cursor:pointer;white-space:nowrap;">
                                ${a.label}
                            </button>`).join('')}
                    </div>
                </div>

                <form id="cs-form">
                    ${FIELDS.map(g => `
                        <div class="glass-panel section-card" style="margin-bottom:1rem;">
                            <h3 style="font-size:0.9rem;margin-bottom:0.8rem;">${g.group}</h3>
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.8rem;">
                                ${g.items.map(f => `
                                    <div class="input-group" style="margin-bottom:0;">
                                        <label style="font-size:0.75rem;">${f.label}</label>
                                        <input type="${f.type === 'array' ? 'text' : 'number'}" ${f.step ? `step="${f.step}"` : ''}
                                            class="input-control" data-field="${f.key}" value="${fieldValue(settings, f)}">
                                    </div>`).join('')}
                            </div>
                        </div>`).join('')}

                    <p class="text-xs text-muted" style="margin-bottom:1rem;">
                        No se muestra acá el % de reparto de comisiones entre agencia y manager — es un valor interno
                        que no forma parte de esta pantalla.
                    </p>

                    <button type="submit" class="btn btn-primary" style="width:100%;">Guardar</button>
                </form>
            </div>`;

        container.querySelectorAll('.cs-ag-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                selectedAgency = btn.dataset.ag;
                localStorage.setItem('ce_agency', selectedAgency);
                load();
            });
        });

        container.querySelector('#cs-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Guardando...';
            try {
                const patch = {};
                FIELDS.forEach(g => g.items.forEach(f => {
                    const input = container.querySelector(`[data-field="${f.key}"]`);
                    patch[f.key] = parseFieldValue(input.value, f);
                }));
                await managerComp.updateSettings(selectedAgency, patch);
                appState.showToast('Configuración guardada', 'success');
            } catch (err) {
                appState.showToast('Error: ' + err.message, 'danger');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Guardar';
            }
        });
    }

    await load();
}
