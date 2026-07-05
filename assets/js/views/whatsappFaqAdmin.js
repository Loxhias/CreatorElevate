import { whatsapp as api } from '../api.js';
import { appState } from '../main.js';

export async function renderWhatsappFaqAdmin(container) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:220px;margin-bottom:1.5rem;"></div>
            ${Array(3).fill('<div class="skel-panel" style="height:90px;margin-bottom:1rem;"></div>').join('')}
        </div>`;

    try {
        const faqs = await api.listFaq();
        renderContent(container, faqs);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            Error al cargar las preguntas frecuentes: ${err.message}
        </div>`;
    }
}

function renderContent(container, faqs) {
    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;gap:1rem;">
                <h1 style="margin:0;font-size:1.5rem;">Preguntas Frecuentes (Asistente WhatsApp)</h1>
                <button id="add-faq-btn" class="btn btn-primary" style="font-size:0.82rem;"><i class="ph-bold ph-plus"></i> Nueva Pregunta</button>
            </div>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1.5rem;">
                Si el mensaje de un creador contiene alguna de las palabras clave, el asistente responde con esta respuesta fija (sin usar IA). Si no matchea ninguna, responde con IA.
            </p>

            <!-- Formulario nueva/editar FAQ -->
            <div id="faq-form" class="glass-panel" style="padding:1.25rem;margin-bottom:1.5rem;display:none;">
                <h3 id="faq-form-title" style="margin-top:0;font-size:0.95rem;">Nueva Pregunta</h3>
                <div style="display:flex;flex-direction:column;gap:0.75rem;">
                    <div>
                        <label style="font-size:0.72rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:0.35rem;">TÍTULO (para vos, no lo ve el creador)</label>
                        <input id="faq-label-input" type="text" class="input-control" placeholder="Ej: Horario de pagos" maxlength="150">
                    </div>
                    <div>
                        <label style="font-size:0.72rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:0.35rem;">PALABRAS CLAVE (separadas por coma)</label>
                        <input id="faq-keywords-input" type="text" class="input-control" placeholder="Ej: pago, cobro, cuando cobro">
                    </div>
                    <div>
                        <label style="font-size:0.72rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:0.35rem;">RESPUESTA</label>
                        <textarea id="faq-answer-input" class="input-control" rows="3" placeholder="Lo que le va a responder el asistente..." maxlength="600" style="resize:vertical;font-family:inherit;"></textarea>
                    </div>
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--text-secondary);">
                        <input type="checkbox" id="faq-active-input" checked style="width:auto;"> Activa
                    </label>
                    <div style="display:flex;gap:0.6rem;">
                        <button id="faq-save-btn" class="btn btn-primary" style="flex:1;">Guardar</button>
                        <button id="faq-cancel-btn" class="btn btn-ghost">Cancelar</button>
                    </div>
                </div>
            </div>

            <!-- Lista -->
            <div id="faq-list" style="display:flex;flex-direction:column;gap:0.5rem;">
                ${!faqs.length
                    ? `<div class="glass-panel" style="padding:3rem 2rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">
                        No hay preguntas cargadas aún. Creá la primera con el botón de arriba.
                       </div>`
                    : faqs.map(renderFaqRow).join('')}
            </div>
        </div>`;

    wireForm(container, faqs);
    wireFaqActions(container, faqs);
}

function renderFaqRow(f) {
    return `
        <div class="faq-item glass-panel" data-fid="${f.id}" style="padding:0.9rem 1rem;display:flex;align-items:flex-start;gap:0.75rem;${!f.active ? 'opacity:0.55;' : ''}">
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                    <span style="font-size:0.85rem;font-weight:700;">${esc(f.question_label)}</span>
                    ${!f.active ? '<span style="font-size:0.62rem;font-weight:700;padding:0.1rem 0.45rem;border-radius:999px;background:rgba(255,255,255,0.06);color:var(--text-muted);">INACTIVA</span>' : ''}
                </div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">
                    Palabras clave: ${(f.keywords || []).map(k => `<code style="background:rgba(255,255,255,0.06);padding:0.05rem 0.4rem;border-radius:4px;">${esc(k)}</code>`).join(' ') || '—'}
                </div>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.4rem;">${esc(f.answer)}</div>
            </div>
            <div style="display:flex;gap:0.4rem;flex-shrink:0;">
                <button class="f-edit-btn" data-fid="${f.id}"
                    style="font-size:0.7rem;padding:0.25rem 0.55rem;border-radius:6px;background:rgba(124,110,247,0.1);color:var(--primary-light);border:none;cursor:pointer;"><i class="ph-bold ph-pencil-simple"></i></button>
                <button class="f-del-btn" data-fid="${f.id}"
                    style="font-size:0.7rem;padding:0.25rem 0.55rem;border-radius:6px;background:rgba(255,85,105,0.1);color:var(--danger);border:none;cursor:pointer;"><i class="ph-bold ph-trash"></i></button>
            </div>
        </div>`;
}

function wireForm(container, faqs) {
    const addBtn     = container.querySelector('#add-faq-btn');
    const form       = container.querySelector('#faq-form');
    const formTitle  = container.querySelector('#faq-form-title');
    const labelIn    = container.querySelector('#faq-label-input');
    const keywordsIn = container.querySelector('#faq-keywords-input');
    const answerIn   = container.querySelector('#faq-answer-input');
    const activeIn   = container.querySelector('#faq-active-input');
    const saveBtn    = container.querySelector('#faq-save-btn');
    const cancelBtn  = container.querySelector('#faq-cancel-btn');

    let editingId = null;

    const closeForm = () => {
        form.style.display = 'none';
        editingId = null;
        labelIn.value = '';
        keywordsIn.value = '';
        answerIn.value = '';
        activeIn.checked = true;
        formTitle.textContent = 'Nueva Pregunta';
        saveBtn.textContent = 'Guardar';
    };

    addBtn.onclick = () => {
        if (form.style.display !== 'none' && !editingId) { closeForm(); return; }
        closeForm();
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        labelIn.focus();
    };
    cancelBtn.onclick = closeForm;

    saveBtn.onclick = async () => {
        const question_label = labelIn.value.trim();
        const answer = answerIn.value.trim();
        const keywords = keywordsIn.value.split(',').map(k => k.trim()).filter(Boolean);
        if (!question_label) return appState.showToast('El título es obligatorio', 'warning');
        if (!answer) return appState.showToast('La respuesta es obligatoria', 'warning');
        if (!keywords.length) return appState.showToast('Cargá al menos una palabra clave', 'warning');

        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
        try {
            await api.upsertFaq({
                id: editingId,
                question_label,
                answer,
                keywords,
                active: activeIn.checked,
            });
            appState.showToast(editingId ? 'Pregunta actualizada' : 'Pregunta creada', 'success');
            renderWhatsappFaqAdmin(container);
        } catch (err) {
            appState.showToast('Error: ' + err.message, 'danger');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Guardar';
        }
    };

    container.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.f-edit-btn');
        if (editBtn) {
            const fid = editBtn.dataset.fid;
            const f = faqs.find(x => x.id === fid);
            if (!f) return;
            editingId = fid;
            labelIn.value = f.question_label;
            keywordsIn.value = (f.keywords || []).join(', ');
            answerIn.value = f.answer;
            activeIn.checked = f.active;
            formTitle.textContent = 'Editar Pregunta';
            saveBtn.textContent = 'Actualizar';
            form.style.display = 'block';
            form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            labelIn.focus();
        }
    });
}

function wireFaqActions(container, faqs) {
    container.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('.f-del-btn');
        if (!delBtn) return;
        const fid = delBtn.dataset.fid;
        const f = faqs.find(x => x.id === fid);
        if (!confirm(`¿Eliminar la pregunta "${f?.question_label || fid}"?`)) return;
        try {
            await api.deleteFaq(fid);
            appState.showToast('Pregunta eliminada', 'info');
            renderWhatsappFaqAdmin(container);
        } catch (err) {
            appState.showToast('Error: ' + err.message, 'danger');
        }
    });
}

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
