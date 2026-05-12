import { store } from '../store.js';
import { appState } from '../main.js';
import { auth } from '../api.js';
import { isSupabaseConfigured } from '../supabase.js';

export function renderLogin(container) {
    container.innerHTML = `
        <div class="login-page animate-fade-in">
            <div class="glass-panel login-card">
                <div class="login-brand">
                    <div class="login-brand-logo">
                        <img src="/iconos/logo_morado.png" alt="Creator Elevate Logo" style="width:100%;height:100%;object-fit:contain;">
                    </div>
                    <h1 class="text-gradient">Creator Elevate</h1>
                    <p>Tu panel de crecimiento en TikTok LIVE</p>
                </div>

                <div id="login-tabs" style="display:flex;gap:0.4rem;margin-bottom:1.25rem;background:rgba(0,0,0,0.25);border-radius:var(--radius-md);padding:0.3rem;">
                    <button class="tab-btn active" data-tab="signin"  style="flex:1;">Ingresar</button>
                    <button class="tab-btn"        data-tab="signup"  style="flex:1;">Crear cuenta</button>
                </div>

                <div id="login-pane"></div>

                ${isSupabaseConfigured ? '' : `
                    <div class="hint-box" style="margin-top:1rem;">
                        <strong>Modo DEMO</strong><br>
                        Supabase no está configurado. Estás usando datos de ejemplo.<br>
                        Admin: <code>admin</code> · Manager: <code>manager1</code>, <code>manager2</code><br>
                        Creador: ej. <code>loxhias</code>, <code>uplunaz</code>
                    </div>
                `}
            </div>
        </div>
    `;

    if (!document.getElementById('login-tab-styles')) {
        const s = document.createElement('style');
        s.id = 'login-tab-styles';
        s.textContent = `
            #login-tabs .tab-btn {
                background:transparent;border:none;color:var(--text-muted);
                font-family:var(--font-sans);font-size:0.82rem;font-weight:600;
                padding:0.55rem 0.5rem;border-radius:var(--radius-sm);
                cursor:pointer;transition:all 0.22s ease;
            }
            #login-tabs .tab-btn:hover { color:var(--text-secondary); background:rgba(255,255,255,0.04);}
            #login-tabs .tab-btn.active {
                background:var(--bg-elevated,#141720);color:var(--text-primary);
                box-shadow:0 2px 8px rgba(0,0,0,0.3);
            }
            .form-error{
                background:rgba(255,85,105,0.08);border:1px solid rgba(255,85,105,0.25);
                border-radius:var(--radius-sm);color:#ff8094;font-size:0.78rem;
                padding:0.6rem 0.75rem;margin-bottom:0.75rem;
            }
            .form-success{
                background:rgba(0,217,166,0.08);border:1px solid rgba(0,217,166,0.25);
                border-radius:var(--radius-sm);color:var(--accent);font-size:0.78rem;
                padding:0.6rem 0.75rem;margin-bottom:0.75rem;
            }
        `;
        document.head.appendChild(s);
    }

    const pane = container.querySelector('#login-pane');

    function renderSignIn() {
        pane.innerHTML = `
            <form id="signin-form">
                <div id="signin-error"></div>
                <div class="input-group">
                    <label for="si-id">Usuario de TikTok o email</label>
                    <input type="text" id="si-id" class="input-control" placeholder="ej: loxhias o tu@email.com" required autocomplete="username">
                </div>
                <div class="input-group" style="margin-bottom:0.5rem;">
                    <label for="si-pass">Contraseña</label>
                    <input type="password" id="si-pass" class="input-control" placeholder="••••••••" ${isSupabaseConfigured ? 'required' : ''} autocomplete="current-password">
                </div>
                <div style="text-align:right; margin-bottom:1.5rem;">
                    <a href="#" id="forgot-link" style="font-size:0.75rem; color:var(--primary-light); text-decoration:none; font-weight:600;">¿Olvidaste tu contraseña?</a>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;font-size:1rem;padding:0.9rem;">
                    Ingresar al Panel
                </button>
            </form>`;

        const forgotLink = pane.querySelector('#forgot-link');
        if (forgotLink) forgotLink.onclick = (e) => { e.preventDefault(); renderForgotPassword(); };

        pane.querySelector('#signin-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = pane.querySelector('#si-id').value.trim();
            const pass = pane.querySelector('#si-pass').value;
            const errBox = pane.querySelector('#signin-error');
            errBox.innerHTML = '';

            if (!id) return;

            // ── Modo DEMO (sin Supabase) ──
            if (!isSupabaseConfigured) {
                let role = 'creator';
                if (id.toLowerCase() === 'admin') role = 'admin';
                else if (id.toLowerCase().startsWith('manager')) role = 'manager';
                store.loginDemo({ username: id, role });
                appState.navigate(role);
                appState.showToast(`¡Bienvenido/a, ${id}!`);
                return;
            }

            // ── Modo Supabase ──
            const btn = pane.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Ingresando…';
            try {
                await auth.signIn(id, pass);
                await store.refreshProfile();
                const u = store.getCurrentUser();
                if (!u) throw new Error('No se encontró el perfil del usuario.');
                appState.navigate(u.role);
                appState.showToast(`¡Bienvenido/a, ${u.username}!`);
            } catch (err) {
                errBox.innerHTML = `<div class="form-error">⚠ ${err.message || 'Credenciales inválidas.'}</div>`;
            } finally {
                btn.disabled = false; btn.textContent = 'Ingresar al Panel';
            }
        });
    }

    function renderSignUp() {
        pane.innerHTML = `
            <form id="signup-form">
                <div id="signup-msg"></div>
                ${!isSupabaseConfigured ? `
                    <div class="form-error">⚠ El registro requiere Supabase configurado. Estás en modo DEMO.</div>
                ` : ''}
                <div class="input-group">
                    <label for="su-tt">Usuario de TikTok <span style="color:var(--danger)">*</span></label>
                    <input type="text" id="su-tt" class="input-control" placeholder="ej: loxhias (sin @)" required autocomplete="username" ${!isSupabaseConfigured ? 'disabled' : ''}>
                    <small style="display:block;margin-top:0.3rem;font-size:0.7rem;color:var(--text-muted);">Solo puede haber una cuenta por usuario.</small>
                </div>
                <div class="input-group">
                    <label for="su-email">Email</label>
                    <input type="email" id="su-email" class="input-control" placeholder="tu@email.com" required autocomplete="email" ${!isSupabaseConfigured ? 'disabled' : ''}>
                </div>
                <div class="input-group" style="margin-bottom:1.25rem;">
                    <label for="su-pass">Contraseña (mín. 6 caracteres)</label>
                    <input type="password" id="su-pass" class="input-control" placeholder="••••••••" required minlength="6" autocomplete="new-password" ${!isSupabaseConfigured ? 'disabled' : ''}>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;font-size:1rem;padding:0.9rem;" ${!isSupabaseConfigured ? 'disabled' : ''}>
                    Crear mi cuenta
                </button>
            </form>`;

        if (!isSupabaseConfigured) return;

        pane.querySelector('#signup-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const tt = pane.querySelector('#su-tt').value.trim().replace(/^@/, '').toLowerCase();
            const email = pane.querySelector('#su-email').value.trim().toLowerCase();
            const pass = pane.querySelector('#su-pass').value;
            const msg = pane.querySelector('#signup-msg');
            msg.innerHTML = '';

            const btn = pane.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Creando cuenta…';
            try {
                const res = await auth.signUpCreator({
                    tiktokUsername: tt,
                    email,
                    password: pass,
                });

                // Si confirmEmail está activo en Supabase, no habrá session.
                if (!res.session) {
                    msg.innerHTML = `<div class="form-success">✓ Cuenta creada. Revisa tu email para confirmar y luego inicia sesión.</div>`;
                    pane.querySelector('#signup-form').reset();
                } else {
                    await store.refreshProfile();
                    const u = store.getCurrentUser();
                    appState.navigate(u.role);
                    appState.showToast(`¡Bienvenido/a, ${u.username}!`);
                }
            } catch (err) {
                msg.innerHTML = `<div class="form-error">⚠ ${err.message || 'No se pudo crear la cuenta.'}</div>`;
            } finally {
                btn.disabled = false; btn.textContent = 'Crear mi cuenta';
            }
        });
    }

    function renderForgotPassword() {
        pane.innerHTML = `
            <form id="forgot-form">
                <h3 style="margin-bottom:1rem; font-size:1.1rem;">Recuperar Contraseña</h3>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1.25rem;">
                    Ingresa tu email y te enviaremos un enlace para restablecer tu clave.
                </p>
                <div id="forgot-msg"></div>
                <div class="input-group">
                    <label for="fo-email">Tu Email</label>
                    <input type="email" id="fo-email" class="input-control" placeholder="tu@email.com" required autocomplete="email">
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;font-size:1rem;padding:0.9rem; margin-top:0.5rem;">
                    Enviar Instrucciones
                </button>
                <div style="text-align:center; margin-top:1.25rem;">
                    <a href="#" id="back-to-login" style="font-size:0.8rem; color:var(--text-muted); text-decoration:none;">← Volver al ingreso</a>
                </div>
            </form>`;

        pane.querySelector('#back-to-login').onclick = (e) => { e.preventDefault(); renderSignIn(); };

        pane.querySelector('#forgot-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = pane.querySelector('#fo-email').value.trim();
            const msg = pane.querySelector('#forgot-msg');
            const btn = pane.querySelector('button[type=submit]');
            msg.innerHTML = '';
            btn.disabled = true; btn.textContent = 'Enviando…';
            try {
                await auth.resetPassword(email);
                msg.innerHTML = `<div class="form-success">✓ Enlace enviado. Revisa tu correo electrónico.</div>`;
                pane.querySelector('#forgot-form').reset();
            } catch (err) {
                msg.innerHTML = `<div class="form-error">⚠ ${err.message || 'Error al enviar el enlace.'}</div>`;
            } finally {
                btn.disabled = false; btn.textContent = 'Enviar Instrucciones';
            }
        });
    }

    /**
     * Se llama cuando el usuario viene de un email de recuperación
     * (Supabase adjunta el token en la URL fragmentada)
     */
    function renderRecoverPassword() {
        pane.innerHTML = `
            <form id="recover-form">
                <h3 style="margin-bottom:1rem; font-size:1.1rem;">Nueva Contraseña</h3>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1.25rem;">
                    Elige una nueva clave de acceso para tu cuenta.
                </p>
                <div id="recover-msg"></div>
                <div class="input-group">
                    <label for="re-pass">Nueva Contraseña (mín. 6 caracteres)</label>
                    <input type="password" id="re-pass" class="input-control" placeholder="••••••••" required minlength="6" autocomplete="new-password">
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;font-size:1rem;padding:0.9rem; margin-top:0.5rem;">
                    Cambiar Contraseña
                </button>
            </form>`;

        pane.querySelector('#recover-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const pass = pane.querySelector('#re-pass').value;
            const msg = pane.querySelector('#recover-msg');
            const btn = pane.querySelector('button[type=submit]');
            msg.innerHTML = '';
            btn.disabled = true; btn.textContent = 'Actualizando…';
            try {
                await auth.updatePassword(pass);
                appState.showToast('✓ Contraseña actualizada correctamente', 'success');
                renderSignIn();
            } catch (err) {
                msg.innerHTML = `<div class="form-error">⚠ ${err.message || 'Error al actualizar.'}</div>`;
            } finally {
                btn.disabled = false; btn.textContent = 'Cambiar Contraseña';
            }
        });
    }

    // Detección de flujo de recuperación (Hash o Query)
    const isRecovery = window.location.href.includes('type=recovery');
    if (isRecovery) {
        renderRecoverPassword();
        const tabs = container.querySelector('#login-tabs');
        if (tabs) tabs.style.display = 'none'; // Ocultar tabs durante recuperación
    } else {
        renderSignIn();
    }

    container.querySelectorAll('#login-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('#login-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (btn.dataset.tab === 'signin') renderSignIn(); else renderSignUp();
        });
    });
}
