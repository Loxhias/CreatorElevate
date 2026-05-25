import { points as api } from '../api.js';
import { appState } from '../main.js';

const DIAMONDS_PER_POINT = 250;

export async function renderPointsView(container) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:180px;margin-bottom:1.5rem;"></div>
            <div class="skel-panel" style="height:220px;margin-bottom:1.25rem;"></div>
            <div class="skel-panel" style="height:160px;"></div>
        </div>`;

    try {
        const [balance, history] = await Promise.all([
            api.getBalance(),
            api.myRedemptions(),
        ]);
        renderContent(container, balance, history);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            Error al cargar puntos: ${err.message}
        </div>`;
    }
}

function renderContent(container, balance, history) {
    const canRedeem  = balance > 0;
    const diamonds   = balance * DIAMONDS_PER_POINT;

    const timeAgo = (iso) => {
        const s = Math.floor((Date.now() - new Date(iso)) / 1000);
        if (s < 60)    return 'hace un momento';
        if (s < 3600)  return `hace ${Math.floor(s / 60)} min`;
        if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
        return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    container.innerHTML = `
        <div class="animate-fadeIn">
            <h1 style="margin-bottom:1.5rem;font-size:1.5rem;">Mis Puntos</h1>

            <!-- Balance card -->
            <div class="glass-panel" style="padding:1.5rem 1.75rem;margin-bottom:1.25rem;
                background:linear-gradient(135deg,rgba(124,110,247,0.12),rgba(244,113,181,0.06));
                border-color:rgba(124,110,247,0.3);">
                <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--primary-light);margin-bottom:0.5rem;">Saldo actual</div>
                <div style="display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.4rem;">
                    <span style="font-size:3rem;font-weight:800;line-height:1;"><i class="ph-bold ph-star"></i> ${balance}</span>
                    <span style="font-size:1rem;color:var(--text-secondary);">punto${balance !== 1 ? 's' : ''}</span>
                </div>
                ${canRedeem ? `
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:1.25rem;">
                    = <strong style="color:var(--accent);">${(diamonds).toLocaleString('es')} <i class="ph-bold ph-diamond"></i></strong> disponibles para canjear
                </div>` : `
                <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1.25rem;">
                    Aún no tenés puntos. Referí creadores a la agencia para ganarlos.
                </div>`}

                <button id="redeem-btn" class="btn btn-primary"
                    style="width:100%;padding:0.85rem;font-size:0.9rem;font-weight:700;${!canRedeem ? 'opacity:0.45;cursor:not-allowed;' : ''}"
                    ${!canRedeem ? 'disabled' : ''}>
                    ${canRedeem ? `Canjear ${balance} punto${balance !== 1 ? 's' : ''} → ${(diamonds).toLocaleString('es')} <i class="ph-bold ph-diamond"></i>` : 'Sin puntos para canjear'}
                </button>
            </div>

            <!-- Exchange rate info -->
            <div class="glass-panel" style="padding:1rem 1.25rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;">
                <div style="font-size:1.8rem;flex-shrink:0;"><i class="ph-bold ph-lightbulb"></i></div>
                <div>
                    <div style="font-size:0.82rem;font-weight:700;margin-bottom:0.15rem;">Tasa de canje</div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);">
                        Cada <strong style="color:var(--primary-light);">1 punto</strong> equivale a
                        <strong style="color:var(--accent);">${DIAMONDS_PER_POINT.toLocaleString('es')} <i class="ph-bold ph-diamond"></i></strong>.
                        Los puntos se obtienen refiriendo nuevos creadores a la agencia.
                    </div>
                </div>
            </div>

            <!-- Redemption history -->
            <h3 style="font-size:0.85rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.75rem;">Historial de Canjes</h3>
            ${!history.length
                ? `<div class="glass-panel" style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">
                    Todavía no realizaste ningún canje.
                   </div>`
                : `<div style="display:flex;flex-direction:column;gap:0.5rem;">
                    ${history.map(r => `
                        <div style="padding:0.85rem 1rem;border:1px solid var(--glass-border);border-radius:var(--radius-md);background:rgba(255,255,255,0.02);display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
                            <div>
                                <div style="font-size:0.82rem;font-weight:700;">
                                    <i class="ph-bold ph-star"></i> ${r.points_redeemed} punto${r.points_redeemed !== 1 ? 's' : ''}
                                    → <span style="color:var(--accent);">${(r.diamonds_earned).toLocaleString('es')} <i class="ph-bold ph-diamond"></i></span>
                                </div>
                                <div style="font-size:0.68rem;color:var(--text-muted);margin-top:0.15rem;">${timeAgo(r.redeemed_at)}</div>
                            </div>
                            <span style="font-size:0.68rem;padding:0.2rem 0.65rem;border-radius:999px;font-weight:700;
                                background:${r.status === 'processed' ? 'rgba(0,217,166,0.12)' : 'rgba(251,191,36,0.12)'};
                                color:${r.status === 'processed' ? 'var(--accent)' : '#fbbf24'};">
                                ${r.status === 'processed' ? '<i class="ph-bold ph-check"></i> Procesado' : '<i class="ph-bold ph-clock"></i> Pendiente'}
                            </span>
                        </div>`).join('')}
                   </div>`}
        </div>`;

    if (!canRedeem) return;

    container.querySelector('#redeem-btn').addEventListener('click', async () => {
        const confirmed = confirm(
            `¿Canjear ${balance} punto${balance !== 1 ? 's' : ''} por ${diamonds.toLocaleString('es')} 💎?\n\n` +
            `El admin procesará la acreditación de diamantes en tu cuenta de TikTok.`
        );
        if (!confirmed) return;

        const btn = container.querySelector('#redeem-btn');
        btn.disabled = true;
        btn.textContent = 'Canjeando...';

        try {
            const result = await api.redeem();
            appState.showToast(
                `Canjeaste ${result.pointsRedeemed} punto${result.pointsRedeemed !== 1 ? 's' : ''} por ${result.diamondsEarned.toLocaleString('es')} diamantes. El admin lo procesará pronto.`,
                'success'
            );
            // Reload with updated data
            const [newBalance, newHistory] = await Promise.all([api.getBalance(), api.myRedemptions()]);
            renderContent(container, newBalance, newHistory);
        } catch (err) {
            appState.showToast('Error al canjear: ' + err.message, 'danger');
            btn.disabled = false;
            btn.innerHTML = `Canjear ${balance} punto${balance !== 1 ? 's' : ''} → ${diamonds.toLocaleString('es')} <i class="ph-bold ph-diamond"></i>`;
        }
    });
}
