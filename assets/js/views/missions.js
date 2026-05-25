import { store } from '../store.js';
import { missions as api } from '../api.js';
import { appState } from '../main.js';

export async function renderMissionsView(container) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:220px;margin-bottom:1rem;"></div>
            <div class="skel-panel" style="height:80px;margin-bottom:1.5rem;"></div>
            ${Array(3).fill('<div class="skel-panel" style="height:140px;margin-bottom:1rem;"></div>').join('')}
        </div>`;

    try {
        const profile = store.getProfile();
        const [allMissions, completions] = await Promise.all([
            api.list(),
            api.getCompletions(),
        ]);
        const daysSince = profile?.created_at
            ? Math.floor((Date.now() - new Date(profile.created_at)) / 86400000)
            : 0;
        renderContent(container, allMissions, completions, daysSince);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            Error al cargar misiones: ${err.message}
        </div>`;
    }
}

function renderContent(container, allMissions, completions, daysSince) {
    const completedIds = new Set(completions.map(c => c.mission_id));

    // Agrupar por día
    const byDay = {};
    for (const m of allMissions) {
        if (!byDay[m.day_number]) byDay[m.day_number] = [];
        byDay[m.day_number].push(m);
    }
    const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);

    const totalMissions   = allMissions.length;
    const totalCompleted  = allMissions.filter(m => completedIds.has(m.id)).length;
    const allDone         = totalMissions > 0 && totalCompleted === totalMissions;
    const pct             = totalMissions ? Math.round((totalCompleted / totalMissions) * 100) : 0;

    // Calcular estado de cada día
    const dayState = {}; // 'locked-time' | 'locked-prev' | 'available' | 'done'
    for (const day of days) {
        const missions  = byDay[day];
        const allCheck  = missions.every(m => completedIds.has(m.id));
        const timeLock  = daysSince < (day - 1);

        if (timeLock) {
            dayState[day] = 'locked-time';
        } else {
            // Check if previous day is fully complete
            const prevDay = days.find(d => d === day - 1) ?? null;
            const prevDone = !prevDay || (byDay[prevDay] || []).every(m => completedIds.has(m.id));
            if (!prevDone) {
                dayState[day] = 'locked-prev';
            } else if (allCheck) {
                dayState[day] = 'done';
            } else {
                dayState[day] = 'available';
            }
        }
    }

    container.innerHTML = `
        <div class="animate-fadeIn">
            <h1 style="margin-bottom:1rem;font-size:1.5rem;">Camino del Creador</h1>

            ${allDone ? `
            <div class="glass-panel" style="padding:1.5rem;margin-bottom:1.5rem;text-align:center;
                background:linear-gradient(135deg,rgba(0,217,166,0.1),rgba(124,110,247,0.1));
                border-color:rgba(0,217,166,0.4);">
                <div style="font-size:2.5rem;margin-bottom:0.5rem;"><i class="ph-bold ph-trophy"></i></div>
                <h2 style="margin:0 0 0.4rem;font-size:1.1rem;color:var(--accent);">¡Camino completado!</h2>
                <p style="font-size:0.82rem;color:var(--text-secondary);margin:0;">
                    Completaste los 7 días de entrenamiento. ¡Sos un creador preparado!
                </p>
            </div>` : ''}

            <!-- Barra de progreso -->
            <div class="glass-panel" style="padding:1rem 1.25rem;margin-bottom:1.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;">
                    <span style="font-size:0.8rem;font-weight:700;color:var(--text-secondary);">Progreso general</span>
                    <span style="font-size:0.8rem;font-weight:800;color:var(--primary-light);">${totalCompleted}/${totalMissions} misiones</span>
                </div>
                <div style="height:8px;border-radius:999px;background:rgba(255,255,255,0.07);overflow:hidden;">
                    <div style="height:100%;border-radius:999px;width:${pct}%;
                        background:linear-gradient(90deg,var(--primary),var(--accent));
                        transition:width 0.5s ease;"></div>
                </div>
            </div>

            <!-- Días -->
            <div style="display:flex;flex-direction:column;gap:1rem;" id="days-container">
                ${days.map(day => renderDayCard(day, byDay[day], dayState[day], completedIds)).join('')}
            </div>
        </div>`;

    // Wiring checkboxes
    container.querySelectorAll('.mission-row[data-mid]').forEach(row => {
        row.addEventListener('click', async () => {
            if (row.dataset.locked === 'true') return;
            const mid = row.dataset.mid;
            const wasChecked = completedIds.has(mid);

            // Optimistic update
            const box = row.querySelector('.m-checkbox');
            if (wasChecked) {
                completedIds.delete(mid);
                box.classList.remove('checked');
            } else {
                completedIds.add(mid);
                box.classList.add('checked');
            }
            updateDayHeaders(container, byDay, days, completedIds, daysSince);

            try {
                if (wasChecked) await api.uncomplete(mid);
                else            await api.complete(mid);
            } catch (err) {
                // Revert
                if (wasChecked) completedIds.add(mid);
                else            completedIds.delete(mid);
                box.classList.toggle('checked', wasChecked);
                updateDayHeaders(container, byDay, days, completedIds, daysSince);
                appState.showToast('Error: ' + err.message, 'danger');
            }
        });
    });
}

function renderDayCard(day, missions, state, completedIds) {
    const doneCount   = missions.filter(m => completedIds.has(m.id)).length;
    const isDone      = state === 'done';
    const isAvailable = state === 'available';
    const isLockedPrev = state === 'locked-prev';
    const isLockedTime = state === 'locked-time';
    const isLocked    = isLockedPrev || isLockedTime;

    const headerIcon  = isDone ? '<i class="ph-bold ph-check"></i>' : isAvailable ? '<i class="ph-bold ph-lightning"></i>' : '<i class="ph-bold ph-lock"></i>';
    const daysToUnlock = day - 1; // days_since needed

    const borderColor = isDone
        ? 'rgba(0,217,166,0.3)'
        : isAvailable
        ? 'rgba(124,110,247,0.3)'
        : 'var(--glass-border)';
    const bg = isDone
        ? 'rgba(0,217,166,0.04)'
        : isAvailable
        ? 'rgba(124,110,247,0.04)'
        : 'transparent';

    return `
        <div class="glass-panel day-card" data-day="${day}"
            style="padding:1.1rem 1.25rem;border-color:${borderColor};background:${bg};">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${isLocked && missions.length ? '0.75rem' : '0'};">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <span style="font-size:1rem;">${headerIcon}</span>
                    <div>
                        <span style="font-size:0.9rem;font-weight:800;">Día ${day}</span>
                        ${isDone ? `<span style="font-size:0.68rem;color:var(--accent);margin-left:0.5rem;font-weight:700;">Completado</span>` : ''}
                        ${isAvailable ? `<span style="font-size:0.68rem;color:var(--primary-light);margin-left:0.5rem;font-weight:700;">${doneCount}/${missions.length}</span>` : ''}
                    </div>
                </div>
                ${isLockedTime ? `<span style="font-size:0.7rem;color:var(--text-muted);background:rgba(255,255,255,0.05);border-radius:999px;padding:0.2rem 0.6rem;">
                    Se desbloquea en ${daysToUnlock} día${daysToUnlock !== 1 ? 's' : ''}
                </span>` : ''}
                ${isLockedPrev ? `<span style="font-size:0.7rem;color:var(--text-muted);background:rgba(255,255,255,0.05);border-radius:999px;padding:0.2rem 0.6rem;">
                    Completa el Día ${day - 1} primero
                </span>` : ''}
            </div>
            ${missions.length ? `
            <div style="display:flex;flex-direction:column;gap:0.3rem;${isLocked ? 'opacity:0.45;' : ''}">
                ${missions.map(m => renderMissionRow(m, completedIds.has(m.id), isLocked)).join('')}
            </div>` : ''}
        </div>`;
}

function renderMissionRow(m, checked, locked) {
    return `
        <div class="mission-row" data-mid="${m.id}" data-locked="${locked}"
            style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.55rem 0.5rem;
                border-radius:var(--radius-sm);cursor:${locked ? 'default' : 'pointer'};
                transition:background 0.15s;">
            <div class="m-checkbox${checked ? ' checked' : ''}" style="
                flex-shrink:0;margin-top:0.1rem;
                width:18px;height:18px;border-radius:5px;
                border:2px solid ${checked ? 'var(--accent)' : 'rgba(255,255,255,0.25)'};
                background:${checked ? 'var(--accent)' : 'transparent'};
                display:flex;align-items:center;justify-content:center;
                font-size:11px;color:#000;font-weight:900;
                transition:all 0.15s;">
                ${checked ? '<i class="ph-bold ph-check"></i>' : ''}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.83rem;font-weight:${checked ? '600' : '600'};
                    color:${checked ? 'var(--text-muted)' : 'var(--text-primary)'};
                    text-decoration:${checked ? 'line-through' : 'none'};
                    line-height:1.4;">
                    ${esc(m.title)}
                </div>
                ${m.description ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.1rem;line-height:1.4;">${esc(m.description)}</div>` : ''}
            </div>
        </div>`;
}

function updateDayHeaders(container, byDay, days, completedIds, daysSince) {
    // Re-evaluate lock states and update day headers without full re-render
    for (const day of days) {
        const missions = byDay[day];
        const card     = container.querySelector(`.day-card[data-day="${day}"]`);
        if (!card) continue;
        const doneCount = missions.filter(m => completedIds.has(m.id)).length;
        const countEl   = card.querySelector('.day-count');
        if (countEl) countEl.textContent = `${doneCount}/${missions.length}`;
    }
    // Update progress bar
    const totalMissions  = days.flatMap(d => byDay[d]).length;
    const totalCompleted = days.flatMap(d => byDay[d]).filter(m => completedIds.has(m.id)).length;
    const pct = totalMissions ? Math.round((totalCompleted / totalMissions) * 100) : 0;
    const bar = container.querySelector('#days-container')?.previousElementSibling?.querySelector('[style*="linear-gradient"]');
    if (bar) bar.style.width = pct + '%';
}

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
