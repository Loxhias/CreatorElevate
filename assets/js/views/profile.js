import { store } from '../store.js';
import { auth, push } from '../api.js';
import { appState } from '../main.js';
import { env } from '../env.js';

export async function renderProfile(container) {
    const profile = store.getProfile();
    if (!profile) return;

    container.innerHTML = `
        <div class="page-header animate-fade-in">
            <h1>👤 Mi Perfil</h1>
            <p>Gestiona tu información pública y de contacto</p>
        </div>

        <div class="glass-panel" style="padding:1.5rem;margin-bottom:1.5rem;">
            <form id="profile-form">
                <div id="profile-msg"></div>
                
                <div class="input-group">
                    <label>Nombre a mostrar</label>
                    <input type="text" id="prof-name" class="input-control" value="${profile.display_name || ''}" placeholder="Tu nombre real o artístico">
                </div>

                <div class="input-group">
                    <label>WhatsApp / Teléfono</label>
                    <input type="text" id="prof-phone" class="input-control" value="${profile.phone || ''}" placeholder="+54 9 11 ...">
                    <small style="display:block;margin-top:0.3rem;font-size:0.7rem;color:var(--text-muted);">
                        ${profile.role === 'manager' ? '⚡ Fundamental para que tus creadores puedan contactarte.' : 'Opcional.'}
                    </small>
                </div>

                <div class="input-group">
                    <label>URL del Avatar (opcional)</label>
                    <input type="text" id="prof-avatar" class="input-control" value="${profile.avatar_url || ''}" placeholder="https://...">
                </div>

                ${profile.role === 'creator' ? `
                <div class="input-group">
                    <label>Fecha de ingreso a la agencia</label>
                    <input type="date" id="prof-joining-date" class="input-control" value="${profile.joining_date || ''}">
                    <small style="display:block;margin-top:0.3rem;font-size:0.7rem;color:var(--text-muted);">
                        ⚡ Indica cuándo comenzaste a trabajar con nosotros. Se usa para habilitar las Misiones y el Reto de 90 Días.
                    </small>
                </div>
                ` : ''}

                <div style="margin-top:1.5rem;padding-top:1.2rem;border-top:1px solid rgba(255,255,255,0.05);">
                    <button type="submit" class="btn btn-primary" style="width:100%;padding:0.9rem;">
                        Guardar Cambios
                    </button>
                </div>
            </form>
        </div>

        <div class="glass-panel" style="padding:1.5rem;margin-bottom:1.5rem;">
            <h3 style="margin-top:0; font-size:1rem;">🔔 Notificaciones</h3>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1.5rem;">Recibe alertas sobre métricas, bonos y mensajes de la agencia en tu dispositivo.</p>
            
            <div id="push-status" style="margin-bottom:1rem; font-size:0.85rem;"></div>
            <button id="enable-push" class="btn" style="background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); width:100%;">
                Configurar Notificaciones
            </button>
        </div>

        <div class="glass-panel" style="padding:1.2rem;border-color:rgba(255,85,105,0.15);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-weight:700;font-size:0.88rem;color:var(--text-primary);">Cuenta</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">${profile.email}</div>
                </div>
                <div style="font-size:0.65rem;font-weight:800;padding:0.25rem 0.5rem;border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">
                    ${profile.role}
                </div>
            </div>
        </div>
    `;

    // Lógica de Notificaciones
    const btnPush = container.querySelector('#enable-push');
    const statusPush = container.querySelector('#push-status');

    const updatePushStatus = async () => {
        if (!('serviceWorker' in navigator)) {
            if (statusPush) statusPush.innerText = '⚠️ Tu navegador no soporta notificaciones.';
            return;
        }
        
        const permission = Notification.permission;
        if (permission === 'denied') {
            statusPush.innerHTML = '<span style="color:var(--danger)">❌ Bloqueadas.</span> Cámbialo en los ajustes de tu navegador.';
            if (btnPush) btnPush.disabled = true;
        } else if (permission === 'granted') {
            statusPush.innerHTML = '<span style="color:var(--accent)">✅ Activadas en este navegador.</span>';
            if (btnPush) btnPush.innerText = 'Actualizar Registro';
        } else {
            statusPush.innerText = '⚪ Pendientes de configurar.';
        }
    };

    if (btnPush) {
        btnPush.onclick = async () => {
            btnPush.disabled = true;
            btnPush.innerText = 'Configurando...';
            
            try {
                // Vincular con OneSignal (Versión moderna)
                if (window.OneSignalDeferred) {
                    OneSignalDeferred.push(async function(OneSignal) {
                        await OneSignal.login(user.id);
                        await OneSignal.User.addTag("role", user.role);
                        await OneSignal.Notifications.requestPermission();
                    });
                }
                
                appState.showToast('¡Notificaciones activadas!', 'success');
            } catch (e) {
                console.error(e);
                appState.showToast('Error: ' + e.message, 'danger');
            } finally {
                updatePushStatus();
                btnPush.disabled = false;
            }
        };
    }

    updatePushStatus();

    container.querySelector('#profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const msg = container.querySelector('#profile-msg');
        
        const patch = {
            display_name: container.querySelector('#prof-name').value.trim(),
            phone:        container.querySelector('#prof-phone').value.trim(),
            avatar_url:   container.querySelector('#prof-avatar').value.trim(),
        };

        const joiningInput = container.querySelector('#prof-joining-date');
        if (joiningInput) {
            patch.joining_date = joiningInput.value || null;
        }

        btn.disabled = true;
        btn.textContent = 'Guardando…';
        msg.innerHTML = '';

        try {
            await auth.updateOwnProfile(patch);
            await store.refreshProfile();
            msg.innerHTML = `<div class="form-success" style="margin-bottom:1rem;">✓ Perfil actualizado correctamente.</div>`;
            appState.showToast('Perfil actualizado');
        } catch (err) {
            console.error(err);
            msg.innerHTML = `<div class="form-error" style="margin-bottom:1rem;">⚠ Error: ${err.message}</div>`;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar Cambios';
        }
    });
}
