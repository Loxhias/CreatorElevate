import { store } from '../store.js';
import { agencyEvents as api } from '../api.js';
import { appState } from '../main.js';

export async function renderEventsView(container) {
    const isAdmin = store.getCurrentUser()?.role === 'admin';

    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:180px;margin-bottom:1.5rem;"></div>
            <div style="display:flex;flex-direction:column;gap:1.2rem;">
                ${Array(3).fill('<div class="skel-panel" style="height:280px;"></div>').join('')}
            </div>
        </div>`;

    try {
        const items = await api.list();
        renderContent(container, items, isAdmin);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            Error al cargar eventos: ${err.message}
        </div>`;
    }
}

function renderContent(container, items, isAdmin) {
    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;gap:1rem;flex-wrap:wrap;">
                <h1 style="margin:0;font-size:1.5rem;">📅 Eventos</h1>
                ${isAdmin ? `<button id="add-ev-btn" class="btn btn-primary" style="font-size:0.8rem;white-space:nowrap;">+ Agregar Evento</button>` : ''}
            </div>

            ${isAdmin ? `
            <div id="ev-form" class="glass-panel" style="padding:1.25rem;margin-bottom:1.5rem;display:none;">
                <h3 id="ev-form-title" style="margin-top:0;font-size:0.95rem;">Nuevo Evento</h3>
                <div style="display:flex;flex-direction:column;gap:0.8rem;">
                    <input type="text" id="ev-title" class="input-control" placeholder="Nombre del evento" maxlength="100">
                    <textarea id="ev-desc" class="input-control" style="height:100px;resize:none;" placeholder="Descripción del evento..." maxlength="1000"></textarea>
                    <input type="date" id="ev-date" class="input-control" style="color:var(--text-secondary);">

                    <div>
                        <label style="display:block;font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.4rem;">IMAGEN DEL EVENTO</label>
                        <div style="display:flex;gap:0.5rem;margin-bottom:0.6rem;">
                            <button id="ev-tab-file" class="btn btn-sm active" style="font-size:0.72rem;">📁 Subir archivo</button>
                            <button id="ev-tab-url"  class="btn btn-sm btn-ghost" style="font-size:0.72rem;">🔗 Pegar URL</button>
                        </div>
                        <div id="ev-input-file">
                            <input type="file" id="ev-file" accept="image/*" class="input-control" style="padding:0.6rem;">
                        </div>
                        <div id="ev-input-url" style="display:none;">
                            <input type="url" id="ev-url" class="input-control" placeholder="https://... (URL de imagen)">
                        </div>
                    </div>

                    <div id="ev-img-preview" style="display:none;border-radius:8px;overflow:hidden;max-width:360px;border:1px solid var(--glass-border);">
                        <img id="ev-preview-img" style="width:100%;display:block;max-height:240px;object-fit:cover;" alt="Previsualización">
                    </div>

                    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
                        <button id="ev-save-btn" class="btn btn-primary" style="flex:1;min-width:120px;">Publicar Evento</button>
                        <button id="ev-cancel-btn" class="btn btn-ghost">Cancelar</button>
                    </div>
                </div>
            </div>` : ''}

            ${!items.length
                ? `<div class="glass-panel" style="padding:3rem 2rem;text-align:center;">
                    <div style="font-size:2.5rem;margin-bottom:1rem;">📅</div>
                    <p style="color:var(--text-muted);font-size:0.9rem;">No hay eventos publicados todavía.</p>
                   </div>`
                : `<div style="display:flex;flex-direction:column;gap:1.2rem;" id="events-feed">
                    ${items.map(ev => renderEventCard(ev, isAdmin)).join('')}
                   </div>`}
        </div>
    `;

    if (!isAdmin) return;

    let editingId      = null;
    let existingImgUrl = null;

    const addBtn    = container.querySelector('#add-ev-btn');
    const form      = container.querySelector('#ev-form');
    const formTitle = container.querySelector('#ev-form-title');
    const cancelBtn = container.querySelector('#ev-cancel-btn');
    const saveBtn   = container.querySelector('#ev-save-btn');
    const tabFile   = container.querySelector('#ev-tab-file');
    const tabUrl    = container.querySelector('#ev-tab-url');
    const inputFile = container.querySelector('#ev-input-file');
    const inputUrl  = container.querySelector('#ev-input-url');
    const fileEl    = container.querySelector('#ev-file');
    const urlEl     = container.querySelector('#ev-url');
    const preview   = container.querySelector('#ev-img-preview');
    const prevImg   = container.querySelector('#ev-preview-img');

    const switchToUrlTab = () => {
        tabUrl.classList.add('active'); tabUrl.classList.remove('btn-ghost');
        tabFile.classList.remove('active'); tabFile.classList.add('btn-ghost');
        inputUrl.style.display = 'block'; inputFile.style.display = 'none';
    };
    const switchToFileTab = () => {
        tabFile.classList.add('active'); tabFile.classList.remove('btn-ghost');
        tabUrl.classList.remove('active'); tabUrl.classList.add('btn-ghost');
        inputFile.style.display = 'block'; inputUrl.style.display = 'none';
    };

    const closeForm = () => {
        form.style.display = 'none';
        editingId = null; existingImgUrl = null;
        formTitle.textContent = 'Nuevo Evento';
        saveBtn.textContent   = 'Publicar Evento';
        container.querySelector('#ev-title').value = '';
        container.querySelector('#ev-desc').value  = '';
        container.querySelector('#ev-date').value  = '';
        urlEl.value = '';
        fileEl.value = '';
        preview.style.display = 'none';
        switchToFileTab();
    };

    addBtn.onclick = () => {
        if (form.style.display !== 'none' && !editingId) { closeForm(); return; }
        closeForm();
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    cancelBtn.onclick = closeForm;

    tabFile.onclick = () => { switchToFileTab(); preview.style.display = 'none'; };
    tabUrl.onclick  = () => { switchToUrlTab();  preview.style.display = 'none'; };

    fileEl.addEventListener('change', () => {
        const file = fileEl.files[0];
        if (!file) return;
        prevImg.src = URL.createObjectURL(file);
        preview.style.display = 'block';
    });

    urlEl.addEventListener('blur', () => {
        const v = urlEl.value.trim();
        if (v) { prevImg.src = v; preview.style.display = 'block'; }
        else { preview.style.display = 'none'; }
    });

    saveBtn.onclick = async () => {
        const title     = container.querySelector('#ev-title').value.trim();
        const desc      = container.querySelector('#ev-desc').value.trim();
        const eventDate = container.querySelector('#ev-date').value;
        const usingFile = inputFile.style.display !== 'none';

        if (!title) return appState.showToast('El nombre del evento es obligatorio', 'warning');

        saveBtn.disabled = true; saveBtn.textContent = 'Guardando...';
        try {
            let imageUrl = existingImgUrl;

            if (usingFile && fileEl.files[0]) {
                saveBtn.textContent = 'Subiendo imagen...';
                imageUrl = await api.uploadImage(fileEl.files[0]);
            } else if (!usingFile && urlEl.value.trim()) {
                imageUrl = urlEl.value.trim();
            }

            if (editingId) {
                await api.update(editingId, { title, description: desc, image_url: imageUrl, event_date: eventDate || null });
                appState.showToast('Evento actualizado', 'success');
            } else {
                await api.create({ title, description: desc, image_url: imageUrl, event_date: eventDate || null });
                appState.showToast('Evento publicado', 'success');
            }
            renderEventsView(container);
        } catch (err) {
            appState.showToast('Error: ' + err.message, 'danger');
            saveBtn.disabled = false; saveBtn.textContent = editingId ? 'Actualizar' : 'Publicar Evento';
        }
    };

    container.querySelectorAll('.ev-edit-btn').forEach(btn => {
        btn.onclick = () => {
            const id = btn.dataset.id;
            const ev = items.find(e => String(e.id) === String(id));
            if (!ev) return;
            editingId = ev.id;
            existingImgUrl = ev.image_url || null;
            formTitle.textContent = 'Editar Evento';
            saveBtn.textContent   = 'Actualizar';
            container.querySelector('#ev-title').value = ev.title || '';
            container.querySelector('#ev-desc').value  = ev.description || '';
            container.querySelector('#ev-date').value  = ev.event_date || '';
            // Pre-fill image URL if available
            if (ev.image_url) {
                switchToUrlTab();
                urlEl.value = ev.image_url;
                prevImg.src = ev.image_url;
                preview.style.display = 'block';
            } else {
                switchToFileTab();
                preview.style.display = 'none';
            }
            form.style.display = 'block';
            form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };
    });

    container.querySelectorAll('.ev-del-btn').forEach(btn => {
        btn.onclick = async () => {
            if (!confirm('¿Eliminar este evento?')) return;
            try {
                await api.remove(btn.dataset.id);
                appState.showToast('Evento eliminado', 'info');
                renderEventsView(container);
            } catch (err) { appState.showToast('Error: ' + err.message, 'danger'); }
        };
    });
}

function renderEventCard(ev, isAdmin) {
    const dateLabel = ev.event_date
        ? new Date(ev.event_date + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : null;
    const createdLabel = new Date(ev.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

    return `
        <div class="glass-panel no-pad animate-fadeIn" style="overflow:hidden;">
            ${ev.image_url ? `
            <div style="width:100%;max-height:340px;overflow:hidden;background:#000;">
                <img src="${ev.image_url}" alt="${ev.title}"
                     style="width:100%;max-height:340px;object-fit:cover;display:block;"
                     onerror="this.parentElement.style.display='none'">
            </div>` : ''}

            <div style="padding:1.1rem;">
                ${dateLabel ? `
                <div style="display:inline-flex;align-items:center;gap:0.35rem;
                            background:rgba(124,110,247,0.12);color:var(--primary-light);
                            border-radius:999px;padding:0.2rem 0.7rem;
                            font-size:0.68rem;font-weight:700;margin-bottom:0.65rem;text-transform:capitalize;">
                    📅 ${dateLabel}
                </div>` : ''}

                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
                    <h2 style="margin:0 0 0.5rem;font-size:1.05rem;line-height:1.3;flex:1;">${ev.title}</h2>
                    ${isAdmin ? `
                    <div style="display:flex;gap:0.35rem;flex-shrink:0;">
                        <button class="ev-edit-btn" data-id="${ev.id}"
                            style="font-size:0.72rem;padding:0.25rem 0.5rem;border-radius:6px;
                                   background:rgba(124,110,247,0.1);color:var(--primary-light);
                                   border:none;cursor:pointer;">✏️ Editar</button>
                        <button class="ev-del-btn" data-id="${ev.id}"
                            style="font-size:0.72rem;padding:0.25rem 0.5rem;border-radius:6px;
                                   background:rgba(255,85,105,0.1);color:var(--danger);
                                   border:none;cursor:pointer;">🗑</button>
                    </div>` : ''}
                </div>

                ${ev.description ? `
                <p style="font-size:0.82rem;color:var(--text-secondary);margin:0 0 0.75rem;line-height:1.6;">
                    ${ev.description.replace(/\n/g, '<br>')}
                </p>` : ''}

                <span style="font-size:0.62rem;color:var(--text-muted);">Publicado el ${createdLabel}</span>
            </div>
        </div>`;
}
