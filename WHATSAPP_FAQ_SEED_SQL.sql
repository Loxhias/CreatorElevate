-- ─────────────────────────────────────────────────────────────────────────────
-- FAQ inicial del asistente de WhatsApp — preguntas típicas de un creador
-- recién ingresado. Contenido basado en assets/js/views/normas.js (no inventado).
--
-- Idempotente: cada INSERT chequea que no exista ya una fila con el mismo
-- question_label, así que es seguro re-ejecutar este archivo.
--
-- Nota: preguntas que dependen de datos propios del creador (p. ej. "¿qué
-- objetivos tengo?" o "¿con quién hablo?") NO están acá a propósito — esas
-- las responde la IA con el contexto personalizado que ya arma el webhook
-- (ver buildUserContext en functions/api/whatsapp-webhook.js), no una
-- respuesta fija igual para todos.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['que hago', 'ahora que', 'soy nuevo', 'recien entro', 'como empiezo', 'primeros pasos'],
    'Onboarding: ¿ahora qué hago?',
    '¡Bienvenido/a a Interactik Agency! Para arrancar: 1) completá tu fecha de ingreso y tu WhatsApp en tu perfil, 2) revisá la sección Misiones (tenés un camino de 7 días para orientarte) y la sección Normas, 3) empezá a transmitir cumpliendo el mínimo mensual (10 días con al menos 1 hora continua cada uno), y 4) estate atento a los mensajes de tu manager. Cualquier duda, seguí preguntando por acá.',
    10
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Onboarding: ¿ahora qué hago?');

INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['beneficio', 'para que sirve', 'que gano', 'que me da la agencia', 'ventajas'],
    'Beneficios de la agencia',
    'La agencia te da: bono en efectivo mensual, premio en diamantes, y la suscripción gratis a Interactik App — según el nivel que alcances cada mes. Además tenés el acompañamiento de un manager y capacitaciones. Revisá la sección Objetivos en tu panel para ver tu progreso en tiempo real.',
    20
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Beneficios de la agencia');

INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['dias validos', 'dia valido', 'minimo', 'cuantos dias', 'requisito'],
    'Requisito de días válidos',
    'Para ser considerado creador activo necesitás cumplir 10 días válidos por mes. Un día válido = transmitir en TikTok LIVE más de 1 hora continua (sin cortes) ese día — varias transmisiones cortas que sumen 1 hora no cuentan.',
    30
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Requisito de días válidos');

INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['multicuenta', 'dos cuentas', 'otra cuenta'],
    'Multicuentas',
    'Está totalmente prohibido usar más de una cuenta de TikTok para transmitir en LIVE — es tolerancia cero. TikTok puede banear todas tus cuentas vinculadas de forma permanente, y además implica desvinculación inmediata de la agencia.',
    40
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Multicuentas');
