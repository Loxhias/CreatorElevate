import { store } from '../store.js';
import { trainings as api } from '../api.js';
import { appState } from '../main.js';

function getYoutubeId(url) {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/\s]+)/);
    return m ? m[1] : null;
}

export async function renderTrainingsView(container) {
    const isAdmin = store.getCurrentUser()?.role === 'admin';

    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:200px;margin-bottom:1.5rem;"></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.2rem;">
                ${Array(4).fill('<div class="skel-panel" style="height:230px;"></div>').join('')}
            </div>
        </div>`;

    try {
        const items = await api.list();
        renderContent(container, items, isAdmin);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            Error al cargar capacitaciones: ${err.message}
        </div>`;
    }
}

function renderContent(container, items, isAdmin) {
    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;gap:1rem;flex-wrap:wrap;">
                <h1 style="margin:0;font-size:1.5rem;">🎓 Capacitaciones</h1>
                ${isAdmin ? `<button id="add-tr-btn" class="btn btn-primary" style="font-size:0.8rem;white-space:nowrap;">+ Agregar</button>` : ''}
            </div>

            ${isAdmin ? `
            <div id="tr-form" class="glass-panel" style="padding:1.25rem;margin-bottom:1.5rem;display:none;">
                <h3 style="margin-top:0;font-size:0.95rem;">Nueva Capacitación</h3>
                <div style="display:flex;flex-direction:column;gap:0.8rem;">
                    <input type="text" id="tr-title" class="input-control" placeholder="Título de la capacitación" maxlength="100">
                    <textarea id="tr-desc" class="input-control" style="height:80px;resize:none;" placeholder="Descripción breve..." maxlength="500"></textarea>
                    <input type="url" id="tr-url" class="input-control" placeholder="https://www.youtube.com/watch?v=...">
                    <div id="tr-preview" style="display:none;border-radius:8px;overflow:hidden;max-width:360px;">
                        <img id="tr-thumb" style="width:100%;display:block;" alt="Miniatura">
                    </div>
                    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
                        <button id="tr-save-btn" class="btn btn-primary" style="flex:1;min-width:120px;">Guardar</button>
                        <button id="tr-cancel-btn" class="btn btn-ghost">Cancelar</button>
                    </div>
                </div>
            </div>` : ''}

            ${!items.length
                ? `<div class="glass-panel" style="padding:3rem 2rem;text-align:center;">
                    <div style="font-size:2.5rem;margin-bottom:1rem;">🎓</div>
                    <p style="color:var(--text-muted);font-size:0.9rem;">No hay capacitaciones publicadas todavía.</p>
                   </div>`
                : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.2rem;">
                    ${items.map(t => renderCard(t, isAdmin)).join('')}
                   </div>`}
        </div>
    `;

    if (!isAdmin) return;

    const addBtn    = container.querySelector('#add-tr-btn');
    const form      = container.querySelector('#tr-form');
    const cancelBtn = container.querySelector('#tr-cancel-btn');
    const urlInput  = container.querySelector('#tr-url');
    const preview   = container.querySelector('#tr-preview');
    const thumb     = container.querySelector('#tr-thumb');
    const saveBtn   = container.querySelector('#tr-save-btn');

    addBtn.onclick = () => {
        const open = form.style.display === 'none';
        form.style.display = open ? 'block' : 'none';
        if (open) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    cancelBtn.onclick = () => { form.style.display = 'none'; };

    urlInput.addEventListener('input', () => {
        const id = getYoutubeId(urlInput.value.trim());
        if (id) {
            thumb.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }
    });

    saveBtn.onclick = async () => {
        const title = container.querySelector('#tr-title').value.trim();
        const desc  = container.querySelector('#tr-desc').value.trim();
        const url   = urlInput.value.trim();
        if (!title) return appState.showToast('El título es obligatorio', 'warning');
        if (!getYoutubeId(url)) return appState.showToast('Ingresa una URL de YouTube válida', 'warning');
        saveBtn.disabled = true; saveBtn.textContent = 'Guardando...';
        try {
            await api.create({ title, description: desc, youtube_url: url });
            appState.showToast('Capacitación agregada', 'success');
            renderTrainingsView(container);
        } catch (err) {
            appState.showToast('Error: ' + err.message, 'danger');
            saveBtn.disabled = false; saveBtn.textContent = 'Guardar';
        }
    };

    container.querySelectorAll('.tr-del-btn').forEach(btn => {
        btn.onclick = async () => {
            if (!confirm('¿Eliminar esta capacitación?')) return;
            try {
                await api.remove(btn.dataset.id);
                appState.showToast('Eliminada', 'info');
                renderTrainingsView(container);
            } catch (err) { appState.showToast('Error: ' + err.message, 'danger'); }
        };
    });
}

function renderCard(t, isAdmin) {
    const ytId  = getYoutubeId(t.youtube_url);
    const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '';
    const date  = new Date(t.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

    return `
        <div class="glass-panel" style="padding:0;overflow:hidden;display:flex;flex-direction:column;">
            <a href="${t.youtube_url}" target="_blank" rel="noopener noreferrer"
               style="display:block;position:relative;background:#000;flex-shrink:0;">
                ${thumb
                    ? `<img src="${thumb}" alt="${t.title}"
                           style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;opacity:0.92;"
                           onerror="this.parentElement.style.minHeight='120px'">`
                    : `<div style="width:100%;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);">
                           <span style="font-size:2rem;">🎬</span>
                       </div>`}
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                    <div style="width:48px;height:48px;background:rgba(255,0,0,0.85);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(0,0,0,0.5);">
                        <span style="font-size:1.1rem;margin-left:3px;color:#fff;">▶</span>
                    </div>
                </div>
            </a>
            <div style="padding:0.9rem;flex:1;display:flex;flex-direction:column;gap:0.35rem;">
                <div style="font-weight:700;font-size:0.88rem;line-height:1.3;">${t.title}</div>
                ${t.description
                    ? `<p style="font-size:0.75rem;color:var(--text-muted);margin:0;line-height:1.5;flex:1;">${t.description}</p>`
                    : ''}
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.5rem;gap:0.4rem;flex-wrap:wrap;">
                    <span style="font-size:0.62rem;color:var(--text-muted);">${date}</span>
                    <div style="display:flex;gap:0.35rem;align-items:center;">
                        <a href="${t.youtube_url}" target="_blank" rel="noopener noreferrer"
                           style="font-size:0.68rem;padding:0.2rem 0.5rem;border-radius:6px;
                                  background:rgba(255,0,0,0.12);color:#ff4444;text-decoration:none;font-weight:600;white-space:nowrap;">
                            ▶ YouTube
                        </a>
                        ${isAdmin ? `<button class="tr-del-btn" data-id="${t.id}"
                            style="font-size:0.68rem;padding:0.2rem 0.45rem;border-radius:6px;
                                   background:rgba(255,85,105,0.1);color:var(--danger);
                                   border:none;cursor:pointer;">🗑</button>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
}
