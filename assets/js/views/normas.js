export function renderNormas(container) {
    container.innerHTML = `
        <div class="animate-fadeIn">

            <!-- ══════════════════════════════════════════
                 NORMAS DE LA AGENCIA
            ══════════════════════════════════════════ -->
            <div style="margin-bottom:2rem;">
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;">
                    <div style="width:36px;height:36px;border-radius:var(--radius-sm);background:linear-gradient(135deg,rgba(124,110,247,0.25),rgba(244,113,181,0.15));display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">📋</div>
                    <div>
                        <h1 style="margin:0;font-size:1.4rem;font-weight:800;">Normas de la Agencia</h1>
                        <p style="margin:0;font-size:0.75rem;color:var(--text-muted);">Interactik Agency · Creator Elevate</p>
                    </div>
                </div>
                <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.75rem;line-height:1.6;">
                    Estas normas aplican a todos los creadores de la agencia. Cumplirlas es requisito para acceder a los beneficios mensuales y mantener tu lugar en el equipo.
                </p>
            </div>

            <!-- Tarjetas de normas de agencia -->
            <div style="display:flex;flex-direction:column;gap:1rem;margin-bottom:2.5rem;">

                <!-- Actividad mínima mensual -->
                <div class="glass-panel" style="padding:1.25rem 1.4rem;border-left:3px solid var(--primary);">
                    <div style="display:flex;align-items:flex-start;gap:1rem;">
                        <div style="width:42px;height:42px;border-radius:var(--radius-sm);background:rgba(124,110,247,0.12);display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">📅</div>
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.4rem;">
                                <h3 style="margin:0;font-size:0.95rem;font-weight:700;">Actividad Mínima Mensual</h3>
                                <span style="background:rgba(124,110,247,0.15);color:var(--primary-light);border-radius:999px;padding:0.15rem 0.65rem;font-size:0.65rem;font-weight:800;">OBLIGATORIO</span>
                            </div>
                            <p style="margin:0 0 0.75rem;font-size:0.82rem;color:var(--text-secondary);line-height:1.6;">
                                Para ser considerado un creador <strong style="color:var(--text-primary);">activo</strong> dentro de la agencia, debes completar un mínimo de <strong style="color:var(--primary-light);">10 días válidos de transmisión</strong> cada mes.
                            </p>
                            <div style="background:rgba(124,110,247,0.07);border:1px solid rgba(124,110,247,0.15);border-radius:var(--radius-sm);padding:0.75rem 1rem;">
                                <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--primary-light);margin-bottom:0.5rem;">¿Qué cuenta como día válido?</div>
                                <div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.8rem;color:var(--text-secondary);">
                                    <span style="color:var(--accent);flex-shrink:0;">✓</span>
                                    <span>Transmitir en TikTok LIVE durante <strong style="color:var(--text-primary);">más de 1 hora continua</strong> sin cortes en el mismo día.</span>
                                </div>
                                <div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.8rem;color:var(--text-secondary);margin-top:0.4rem;">
                                    <span style="color:var(--danger);flex-shrink:0;">✗</span>
                                    <span>Múltiples transmisiones cortas que sumen 1 hora <strong style="color:var(--text-primary);">no cuentan</strong> como día válido — debe ser continua.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Multicuentas prohibidas -->
                <div class="glass-panel" style="padding:1.25rem 1.4rem;border-left:3px solid var(--danger);background:rgba(255,85,105,0.03);">
                    <div style="display:flex;align-items:flex-start;gap:1rem;">
                        <div style="width:42px;height:42px;border-radius:var(--radius-sm);background:rgba(255,85,105,0.12);display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">🚫</div>
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.4rem;">
                                <h3 style="margin:0;font-size:0.95rem;font-weight:700;">Prohibición de Multicuentas en LIVE</h3>
                                <span style="background:rgba(255,85,105,0.18);color:var(--danger);border-radius:999px;padding:0.15rem 0.65rem;font-size:0.65rem;font-weight:800;">TOLERANCIA CERO</span>
                            </div>
                            <p style="margin:0 0 0.75rem;font-size:0.82rem;color:var(--text-secondary);line-height:1.6;">
                                Está <strong style="color:var(--danger);">estrictamente prohibido</strong> utilizar múltiples cuentas de TikTok para realizar transmisiones en vivo (LIVE). Esta práctica viola los términos de servicio de TikTok directamente.
                            </p>
                            <div style="background:rgba(255,85,105,0.07);border:1px solid rgba(255,85,105,0.2);border-radius:var(--radius-sm);padding:0.75rem 1rem;">
                                <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--danger);margin-bottom:0.5rem;">Consecuencias</div>
                                <div style="display:flex;flex-direction:column;gap:0.35rem;">
                                    <div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.8rem;color:var(--text-secondary);">
                                        <span style="color:var(--danger);flex-shrink:0;">⚠</span>
                                        <span>TikTok puede <strong style="color:var(--text-primary);">bloquear permanentemente todas las cuentas</strong> del usuario involucrado, sin posibilidad de recuperación.</span>
                                    </div>
                                    <div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.8rem;color:var(--text-secondary);">
                                        <span style="color:var(--danger);flex-shrink:0;">⚠</span>
                                        <span>La sanción de TikTok se aplica a <strong style="color:var(--text-primary);">todas las cuentas vinculadas</strong>, no solo a la cuenta infractora.</span>
                                    </div>
                                    <div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.8rem;color:var(--text-secondary);">
                                        <span style="color:var(--danger);flex-shrink:0;">⚠</span>
                                        <span>El incumplimiento implica <strong style="color:var(--text-primary);">desvinculación inmediata</strong> de la agencia.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Comportamiento profesional -->
                <div class="glass-panel" style="padding:1.25rem 1.4rem;border-left:3px solid var(--accent);">
                    <div style="display:flex;align-items:flex-start;gap:1rem;">
                        <div style="width:42px;height:42px;border-radius:var(--radius-sm);background:rgba(0,217,166,0.1);display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">🤝</div>
                        <div style="flex:1;min-width:0;">
                            <h3 style="margin:0 0 0.4rem;font-size:0.95rem;font-weight:700;">Conducta y Representación</h3>
                            <p style="margin:0 0 0.6rem;font-size:0.82rem;color:var(--text-secondary);line-height:1.6;">
                                Al formar parte de Interactik Agency, eres embajador de la agencia. Tu comportamiento en LIVE y redes sociales refleja directamente la imagen del equipo.
                            </p>
                            <div style="display:flex;flex-direction:column;gap:0.35rem;">
                                <div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.8rem;color:var(--text-secondary);">
                                    <span style="color:var(--accent);flex-shrink:0;">✓</span>
                                    <span>Mantener un trato respetuoso con la audiencia y otros creadores.</span>
                                </div>
                                <div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.8rem;color:var(--text-secondary);">
                                    <span style="color:var(--accent);flex-shrink:0;">✓</span>
                                    <span>Comunicar con tu manager cualquier problema técnico o personal que afecte tu actividad.</span>
                                </div>
                                <div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.8rem;color:var(--text-secondary);">
                                    <span style="color:var(--accent);flex-shrink:0;">✓</span>
                                    <span>Reportar actividades sospechosas o violaciones de normas que observes en la plataforma.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Beneficios y métricas -->
                <div class="glass-panel" style="padding:1.25rem 1.4rem;border-left:3px solid var(--gold);">
                    <div style="display:flex;align-items:flex-start;gap:1rem;">
                        <div style="width:42px;height:42px;border-radius:var(--radius-sm);background:rgba(245,166,35,0.1);display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">💰</div>
                        <div style="flex:1;min-width:0;">
                            <h3 style="margin:0 0 0.4rem;font-size:0.95rem;font-weight:700;">Acceso a Beneficios</h3>
                            <p style="margin:0 0 0.6rem;font-size:0.82rem;color:var(--text-secondary);line-height:1.6;">
                                Los bonos en efectivo, premios en diamantes y la suscripción a Interactik App están sujetos al cumplimiento de métricas mensuales. Revisa la sección <strong style="color:var(--text-primary);">Objetivos</strong> en tu panel para ver el progreso en tiempo real.
                            </p>
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.6rem;">
                                <div style="background:rgba(245,166,35,0.06);border:1px solid rgba(245,166,35,0.15);border-radius:var(--radius-sm);padding:0.6rem 0.75rem;text-align:center;">
                                    <div style="font-size:1.1rem;font-weight:800;color:var(--gold);">10</div>
                                    <div style="font-size:0.65rem;color:var(--text-muted);margin-top:0.1rem;">días mínimos activos</div>
                                </div>
                                <div style="background:rgba(245,166,35,0.06);border:1px solid rgba(245,166,35,0.15);border-radius:var(--radius-sm);padding:0.6rem 0.75rem;text-align:center;">
                                    <div style="font-size:1.1rem;font-weight:800;color:var(--gold);">+1h</div>
                                    <div style="font-size:0.65rem;color:var(--text-muted);margin-top:0.1rem;">por día para ser válido</div>
                                </div>
                                <div style="background:rgba(245,166,35,0.06);border:1px solid rgba(245,166,35,0.15);border-radius:var(--radius-sm);padding:0.6rem 0.75rem;text-align:center;">
                                    <div style="font-size:1.1rem;font-weight:800;color:var(--gold);">0</div>
                                    <div style="font-size:0.65rem;color:var(--text-muted);margin-top:0.1rem;">tolerancia en multicuentas</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <!-- ══════════════════════════════════════════
                 DIRECTRICES DE COMUNIDAD DE TIKTOK
            ══════════════════════════════════════════ -->
            <div style="margin-bottom:1.5rem;">
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;">
                    <div style="width:36px;height:36px;border-radius:var(--radius-sm);background:linear-gradient(135deg,rgba(255,0,80,0.2),rgba(0,242,234,0.1));display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">🎵</div>
                    <div>
                        <h2 style="margin:0;font-size:1.2rem;font-weight:800;">Directrices de Comunidad de TikTok</h2>
                        <p style="margin:0;font-size:0.72rem;color:var(--text-muted);">Normas oficiales de la plataforma · tiktok.com/safety</p>
                    </div>
                </div>
                <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.75rem;line-height:1.6;">
                    TikTok establece normas de comunidad que todos los creadores deben respetar. El incumplimiento puede resultar en restricciones de cuenta, suspensión de LIVE o bloqueo permanente.
                </p>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;margin-bottom:2rem;">

                <!-- Seguridad de menores -->
                <div class="glass-panel" style="padding:1.15rem 1.25rem;">
                    <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.65rem;">
                        <div style="width:38px;height:38px;border-radius:var(--radius-sm);background:rgba(244,113,181,0.12);display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">🧒</div>
                        <h3 style="margin:0;font-size:0.9rem;font-weight:700;">Seguridad de Menores</h3>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin:0 0 0.65rem;">
                        TikTok protege estrictamente a los menores de edad. Está prohibido publicar, compartir o promover cualquier contenido que los explote, dañe o ponga en riesgo.
                    </p>
                    <div style="display:flex;flex-direction:column;gap:0.3rem;">
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> No interactuar de forma inapropiada con menores en LIVE.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> No aceptar regalos de cuentas que parezcan ser de menores.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> No producir contenido de índole sexual que involucre menores.
                        </div>
                    </div>
                </div>

                <!-- Contenido violento y peligroso -->
                <div class="glass-panel" style="padding:1.15rem 1.25rem;">
                    <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.65rem;">
                        <div style="width:38px;height:38px;border-radius:var(--radius-sm);background:rgba(255,85,105,0.1);display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">⚠️</div>
                        <h3 style="margin:0;font-size:0.9rem;font-weight:700;">Contenido Peligroso y Violento</h3>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin:0 0 0.65rem;">
                        Está prohibido publicar contenido que muestre, glorifique o incite a la violencia, retos peligrosos o actividades que pongan en riesgo la integridad física.
                    </p>
                    <div style="display:flex;flex-direction:column;gap:0.3rem;">
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Retos peligrosos o que inviten a la autolesión.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Contenido que muestre violencia física extrema o gore.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Amenazas directas o indirectas a personas o grupos.
                        </div>
                    </div>
                </div>

                <!-- Acoso y bullying -->
                <div class="glass-panel" style="padding:1.15rem 1.25rem;">
                    <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.65rem;">
                        <div style="width:38px;height:38px;border-radius:var(--radius-sm);background:rgba(255,181,71,0.1);display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">🛡️</div>
                        <h3 style="margin:0;font-size:0.9rem;font-weight:700;">Acoso y Bullying</h3>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin:0 0 0.65rem;">
                        TikTok no tolera el acoso, la intimidación ni el hostigamiento hacia ninguna persona, ya sea pública o privada, dentro o fuera de la plataforma.
                    </p>
                    <div style="display:flex;flex-direction:column;gap:0.3rem;">
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Ataques personales, insultos o comentarios degradantes.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Organizar o promover campañas de odio contra usuarios.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Difundir rumores o contenido falso para dañar la reputación de otros.
                        </div>
                    </div>
                </div>

                <!-- Odio y discriminación -->
                <div class="glass-panel" style="padding:1.15rem 1.25rem;">
                    <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.65rem;">
                        <div style="width:38px;height:38px;border-radius:var(--radius-sm);background:rgba(124,110,247,0.12);display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">🤲</div>
                        <h3 style="margin:0;font-size:0.9rem;font-weight:700;">Discurso de Odio</h3>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin:0 0 0.65rem;">
                        No se permite contenido que promueva el odio, la discriminación o la superioridad basada en raza, etnia, religión, género, orientación sexual, discapacidad u origen.
                    </p>
                    <div style="display:flex;flex-direction:column;gap:0.3rem;">
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Insultos o epítetos basados en identidad o características protegidas.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Representaciones deshumanizantes de personas o grupos.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Contenido que glorifique ideologías de odio o supremacistas.
                        </div>
                    </div>
                </div>

                <!-- Integridad y autenticidad -->
                <div class="glass-panel" style="padding:1.15rem 1.25rem;">
                    <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.65rem;">
                        <div style="width:38px;height:38px;border-radius:var(--radius-sm);background:rgba(0,217,166,0.1);display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">✅</div>
                        <h3 style="margin:0;font-size:0.9rem;font-weight:700;">Integridad y Autenticidad</h3>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin:0 0 0.65rem;">
                        TikTok exige que los creadores sean auténticos. No se permiten prácticas que manipulen artificialmente el alcance, los seguidores o las interacciones.
                    </p>
                    <div style="display:flex;flex-direction:column;gap:0.3rem;">
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Uso de bots, cuentas falsas o servicios de seguidores comprados.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Desinformación o noticias falsas que puedan causar daño.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Hacerse pasar por otra persona, marca o entidad oficial.
                        </div>
                    </div>
                </div>

                <!-- Privacidad -->
                <div class="glass-panel" style="padding:1.15rem 1.25rem;">
                    <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.65rem;">
                        <div style="width:38px;height:38px;border-radius:var(--radius-sm);background:rgba(0,217,166,0.08);display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">🔒</div>
                        <h3 style="margin:0;font-size:0.9rem;font-weight:700;">Privacidad y Datos Personales</h3>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin:0 0 0.65rem;">
                        Compartir información privada de otras personas sin su consentimiento (doxing) está estrictamente prohibido y puede resultar en banning permanente.
                    </p>
                    <div style="display:flex;flex-direction:column;gap:0.3rem;">
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Publicar ubicaciones, teléfonos o datos personales de otros.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Grabar y publicar personas sin su consentimiento explícito.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Exponer conversaciones privadas sin permiso del involucrado.
                        </div>
                    </div>
                </div>

                <!-- Actividades ilegales -->
                <div class="glass-panel" style="padding:1.15rem 1.25rem;">
                    <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.65rem;">
                        <div style="width:38px;height:38px;border-radius:var(--radius-sm);background:rgba(255,85,105,0.08);display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">⚖️</div>
                        <h3 style="margin:0;font-size:0.9rem;font-weight:700;">Actividades Ilegales</h3>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin:0 0 0.65rem;">
                        Está prohibido promover, facilitar o instruir en actividades ilegales, incluyendo el tráfico de bienes regulados o el fraude de cualquier tipo.
                    </p>
                    <div style="display:flex;flex-direction:column;gap:0.3rem;">
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Venta o promoción de drogas, armas o bienes ilegales.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Instrucciones para cometer delitos o evadir autoridades.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Fraude, estafas o engaños para obtener beneficios económicos.
                        </div>
                    </div>
                </div>

                <!-- Derechos de autor -->
                <div class="glass-panel" style="padding:1.15rem 1.25rem;">
                    <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.65rem;">
                        <div style="width:38px;height:38px;border-radius:var(--radius-sm);background:rgba(124,110,247,0.1);display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">🎵</div>
                        <h3 style="margin:0;font-size:0.9rem;font-weight:700;">Propiedad Intelectual</h3>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin:0 0 0.65rem;">
                        Respetar los derechos de autor es obligatorio. Usar música, videos o contenido de terceros sin licencia puede resultar en la eliminación del contenido y sanciones a la cuenta.
                    </p>
                    <div style="display:flex;flex-direction:column;gap:0.3rem;">
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--accent);flex-shrink:0;">✓</span> Usa la biblioteca de música de TikTok para evitar infracciones.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Reproducir canciones o películas con derechos sin autorización.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Republicar contenido de otros creadores sin crédito o permiso.
                        </div>
                    </div>
                </div>

                <!-- Normas específicas de LIVE -->
                <div class="glass-panel" style="padding:1.15rem 1.25rem;border-left:3px solid rgba(255,0,80,0.5);background:rgba(255,0,80,0.02);">
                    <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.65rem;">
                        <div style="width:38px;height:38px;border-radius:var(--radius-sm);background:rgba(255,0,80,0.12);display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">🔴</div>
                        <div>
                            <h3 style="margin:0;font-size:0.9rem;font-weight:700;">Normas Específicas de TikTok LIVE</h3>
                            <span style="font-size:0.65rem;color:rgba(255,80,80,0.9);font-weight:700;">Aplica directamente a creadores</span>
                        </div>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin:0 0 0.65rem;">
                        Las transmisiones en vivo tienen reglas adicionales. TikTok monitorea los LIVE en tiempo real y puede suspender la transmisión o la cuenta de inmediato.
                    </p>
                    <div style="display:flex;flex-direction:column;gap:0.3rem;">
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Contenido sexual explícito o sugerente durante el LIVE.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Solicitar dinero, regalos o pagos de forma coercitiva o engañosa.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Transmitir bajo efectos de alcohol o sustancias.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Mostrar armas reales, actividades peligrosas o conducción en LIVE.
                        </div>
                        <div style="display:flex;gap:0.45rem;font-size:0.75rem;color:var(--text-muted);">
                            <span style="color:var(--danger);flex-shrink:0;">✗</span> Usar múltiples cuentas simultáneamente para transmitir.
                        </div>
                    </div>
                </div>

            </div>

            <!-- Footer informativo -->
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radius-md);padding:1.1rem 1.25rem;">
                <div style="display:flex;align-items:flex-start;gap:0.75rem;">
                    <span style="font-size:1.1rem;flex-shrink:0;">ℹ️</span>
                    <div>
                        <div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);margin-bottom:0.3rem;">Información adicional</div>
                        <p style="font-size:0.74rem;color:var(--text-muted);line-height:1.6;margin:0;">
                            Las directrices de TikTok se actualizan periódicamente. Para consultar la versión más reciente y completa, visita
                            <a href="https://www.tiktok.com/safety/es/" target="_blank" rel="noopener noreferrer" style="color:var(--primary-light);text-decoration:none;font-weight:600;">tiktok.com/safety</a>.
                            Ante cualquier duda sobre las normas de la agencia, contacta directamente a tu manager.
                        </p>
                    </div>
                </div>
            </div>

        </div>`;
}
