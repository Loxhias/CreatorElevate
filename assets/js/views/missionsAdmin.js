import { missions as api } from '../api.js';
import { appState } from '../main.js';

const MAX_DAY = 14;

export async function renderMissionsAdmin(container) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:200px;margin-bottom:1.5rem;"></div>
            ${Array(3).fill('<div class="skel-panel" style="height:160px;margin-bottom:1rem;"></div>').join('')}
        </div>`;

    try {
        const [allMissions, counts] = await Promise.all([
            api.list(),
            api.getCompletionCounts(),
        ]);
        renderContent(container, allMissions, counts);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            Error al cargar misiones: ${err.message}
        </div>`;
    }
}

function renderContent(container, allMissions, counts) {
    const byDay = {};
    for (const m of allMissions) {
        if (!byDay[m.day_number]) byDay[m.day_number] = [];
        byDay[m.day_number].push(m);
    }
    const usedDays = Object.keys(byDay).map(Number).sort((a, b) => a - b);
    // Always offer adding to existing days + one new day
    const maxExisting = usedDays.length ? Math.max(...usedDays) : 0;
    const availableDays = Array.from({ length: Math.min(maxExisting + 1, MAX_DAY) }, (_, i) => i + 1);

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem;">
                <h1 style="margin:0;font-size:1.5rem;">Gestión de Misiones</h1>
                <button id="add-mission-btn" class="btn btn-primary" style="font-size:0.82rem;"><i class="ph-bold ph-plus"></i> Nueva Misión</button>
            </div>

            <!-- Formulario nueva misión -->
            <div id="mission-form" class="glass-panel" style="padding:1.25rem;margin-bottom:1.5rem;display:none;">
                <h3 id="form-title" style="margin-top:0;font-size:0.95rem;">Nueva Misión</h3>
                <div style="display:flex;flex-direction:column;gap:0.75rem;">
                    <div style="display:grid;grid-template-columns:120px 1fr;gap:0.75rem;">
                        <div>
                            <label style="font-size:0.72rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:0.35rem;">DÍA</label>
                            <select id="form-day" class="input-control">
                                ${availableDays.map(d => `<option value="${d}">Día ${d}</option>`).join('')}
                                <option value="${maxExisting + 1}">Día ${maxExisting + 1} (nuevo)</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.72rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:0.35rem;">MISIÓN</label>
                            <input id="form-title-input" type="text" class="input-control" placeholder="Ej: Logra 1 hr de LIVE" maxlength="150">
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.72rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:0.35rem;">DESCRIPCIÓN (opcional)</label>
                        <input id="form-desc" type="text" class="input-control" placeholder="Detalles adicionales para el creador..." maxlength="300">
                    </div>
                    <div style="display:flex;gap:0.6rem;">
                        <button id="form-save-btn" class="btn btn-primary" style="flex:1;">Guardar</button>
                        <button id="form-cancel-btn" class="btn btn-ghost">Cancelar</button>
                    </div>
                </div>
            </div>

            <!-- Lista de misiones por día -->
            <div id="missions-list">
                ${!allMissions.length
                    ? `<div class="glass-panel" style="padding:3rem 2rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">
                        No hay misiones cargadas aún. Creá la primera con el botón de arriba.
                       </div>`
                    : usedDays.map(day => renderDaySection(day, byDay[day], counts)).join('')}
            </div>
        </div>`;

    wireForm(container, allMissions, counts, maxExisting);
    wireMissionActions(container, allMissions, counts);
}

function renderDaySection(day, missions, counts) {
    return `
        <div class="day-section glass-panel" data-day="${day}" style="padding:1.1rem 1.25rem;margin-bottom:1rem;">
            <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.85rem;">
                <div style="width:28px;height:28px;border-radius:50%;
                    background:rgba(124,110,247,0.15);border:2px solid rgba(124,110,247,0.3);
                    display:flex;align-items:center;justify-content:center;
                    font-size:0.72rem;font-weight:800;color:var(--primary-light);flex-shrink:0;">
                    ${day}
                </div>
                <h3 style="margin:0;font-size:0.92rem;font-weight:700;">Día ${day}</h3>
                <span style="font-size:0.68rem;color:var(--text-muted);background:rgba(255,255,255,0.05);
                    border-radius:999px;padding:0.15rem 0.5rem;">${missions.length} misión${missions.length !== 1 ? 'es' : ''}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.4rem;">
                ${missions.map(m => renderMissionRow(m, counts[m.id] || 0)).join('')}
            </div>
        </div>`;
}

function renderMissionRow(m, completions) {
    return `
        <div class="mission-item" data-mid="${m.id}" style="
            display:flex;align-items:flex-start;gap:0.75rem;
            padding:0.6rem 0.75rem;border-radius:var(--radius-sm);
            background:rgba(255,255,255,0.02);border:1px solid var(--glass-border);">
            <div style="flex:1;min-width:0;">
                <div class="m-title" style="font-size:0.83rem;font-weight:600;color:var(--text-primary);">${esc(m.title)}</div>
                ${m.description ? `<div class="m-desc" style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem;">${esc(m.description)}</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
                ${completions ? `<span style="font-size:0.65rem;color:var(--accent);background:rgba(0,217,166,0.08);border-radius:999px;padding:0.15rem 0.5rem;"><i class="ph-bold ph-check"></i> ${completions}</span>` : ''}
                <button class="m-edit-btn" data-mid="${m.id}"
                    style="font-size:0.7rem;padding:0.2rem 0.5rem;border-radius:6px;
                           background:rgba(124,110,247,0.1);color:var(--primary-light);border:none;cursor:pointer;"><i class="ph-bold ph-pencil-simple"></i></button>
                <button class="m-del-btn" data-mid="${m.id}"
                    style="font-size:0.7rem;padding:0.2rem 0.5rem;border-radius:6px;
                           background:rgba(255,85,105,0.1);color:var(--danger);border:none;cursor:pointer;"><i class="ph-bold ph-trash"></i></button>
            </div>
        </div>`;
}

function wireForm(container, allMissions, counts, maxExisting) {
    const addBtn    = container.querySelector('#add-mission-btn');
    const form      = container.querySelector('#mission-form');
    const formTitle = container.querySelector('#form-title');
    const daySelect = container.querySelector('#form-day');
    const titleIn   = container.querySelector('#form-title-input');
    const descIn    = container.querySelector('#form-desc');
    const saveBtn   = container.querySelector('#form-save-btn');
    const cancelBtn = container.querySelector('#form-cancel-btn');

    let editingId = null;

    const closeForm = () => {
        form.style.display = 'none';
        editingId = null;
        titleIn.value = '';
        descIn.value  = '';
        if (daySelect) daySelect.value = '1';
        formTitle.textContent = 'Nueva Misión';
        saveBtn.textContent   = 'Guardar';
    };

    addBtn.onclick = () => {
        if (form.style.display !== 'none' && !editingId) { closeForm(); return; }
        closeForm();
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        titleIn.focus();
    };
    cancelBtn.onclick = closeForm;

    saveBtn.onclick = async () => {
        const title   = titleIn.value.trim();
        const desc    = descIn.value.trim();
        const dayNum  = parseInt(daySelect?.value) || 1;
        if (!title) return appState.showToast('El título es obligatorio', 'warning');

        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
        try {
            if (editingId) {
                await api.update(editingId, { title, description: desc, day_number: dayNum });
                appState.showToast('Misión actualizada', 'success');
            } else {
                const existing = allMissions.filter(m => m.day_number === dayNum);
                const sort_order = existing.length ? Math.max(...existing.map(m => m.sort_order || 0)) + 1 : 0;
                await api.create({ day_number: dayNum, title, description: desc, sort_order });
                appState.showToast('Misión creada', 'success');
            }
            renderMissionsAdmin(container);
        } catch (err) {
            appState.showToast('Error: ' + err.message, 'danger');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Guardar';
        }
    };

    // Wire edit buttons (delegated)
    container.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.m-edit-btn');
        if (editBtn) {
            const mid = editBtn.dataset.mid;
            const m   = allMissions.find(x => x.id === mid);
            if (!m) return;
            editingId = mid;
            titleIn.value = m.title;
            descIn.value  = m.description || '';
            if (daySelect) daySelect.value = String(m.day_number);
            formTitle.textContent = 'Editar Misión';
            saveBtn.textContent   = 'Actualizar';
            form.style.display    = 'block';
            form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            titleIn.focus();
        }
    });
}

function wireMissionActions(container, allMissions, counts) {
    container.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('.m-del-btn');
        if (!delBtn) return;
        const mid = delBtn.dataset.mid;
        const m   = allMissions.find(x => x.id === mid);
        if (!confirm(`¿Eliminar la misión "${m?.title || mid}"?`)) return;
        try {
            await api.remove(mid);
            appState.showToast('Misión eliminada', 'info');
            renderMissionsAdmin(container);
        } catch (err) {
            appState.showToast('Error: ' + err.message, 'danger');
        }
    });
}

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
