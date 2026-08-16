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

-- 1. ONBOARDING
INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['que hago', 'ahora que', 'soy nuevo', 'recien entro', 'como empiezo', 'primeros pasos'],
    'Onboarding: ¿ahora qué hago?',
    $$¡Hola! ¡Qué gusto tenerte en nuestra agencia, Interactik Agency! 🚀

En nuestra comunidad nos esforzamos por brindarte un servicio de calidad: herramientas, recursos, capacitaciones y beneficios exclusivos, todo de forma 100% gratuita.

Al formar parte de la agencia, tu participación y progreso son fundamentales. Recuerda que al mantener un crecimiento constante, no solo nos ayudas a seguir funcionando, sino que impulsas al máximo tu propia carrera profesional. 📈

Queda un gran camino por delante. Para asegurar tu éxito, ten en cuenta estas reglas clave:

• Transmite diariamente: Es la única forma de acumular días y horas válidas.
• Tiempo mínimo: Para que un día cuente, tu transmisión debe durar más de 1 hora y 10 minutos de forma continua y sin cortes.
• El reloj manda: Recuerda que TikTok se rige por el horario de Londres (GMT/BST). ¡Tenlo en cuenta para cumplir tus objetivos diarios!

Unete a las capacitaciones: durante la semana realizamos varias reuniones, revisa los grupos periódicamente para no perderte nada!$$,
    10
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Onboarding: ¿ahora qué hago?');

-- 2. BENEFICIOS
INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['beneficio', 'para que sirve', 'que gano', 'que me da la agencia', 'ventajas'],
    'Beneficios de la agencia',
    $$✨ ¡En Interactik Agency tenemos los mejores beneficios para ti! ✨

💰 0% Comisión: No te cobramos nada sobre tus ganancias. Te ayudamos a generar más ingresos y el 100% de lo que ganes será tuyo.

💵 Bonificaciones mensuales: Según tu nivel mensual, podrás obtener bonos en dólares y regalos en diamantes en tus transmisiones.

📚 Capacitación VIP: Te entrenamos para que domines las normas, funciones y herramientas que impulsarán tu carrera como creador.

🪄 Magic sin costo: Muchos creadores pagan cientos de dólares por las animaciones y alertas en pantalla para su transmisión — nosotros te damos el primer mes de Magic 100% gratis, y podrás mantenerlo gratis alcanzando tus objetivos de días y diamantes.

🚀 ¡No desaproveches esta oportunidad de llevar tu contenido al siguiente nivel! Estamos listos para impulsarte.$$,
    20
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Beneficios de la agencia');

-- El INSERT de arriba es idempotente (no pisa una fila que ya exista), así
-- que si este seed ya corrió antes en producción con el texto viejo
-- ("Interactik Interactive" / bullets duplicados de Magic), el INSERT solo
-- no alcanza para corregirlo — este UPDATE lo hace explícito, sin duplicar
-- la respuesta acá.
UPDATE public.whatsapp_faq
SET answer = $$✨ ¡En Interactik Agency tenemos los mejores beneficios para ti! ✨

💰 0% Comisión: No te cobramos nada sobre tus ganancias. Te ayudamos a generar más ingresos y el 100% de lo que ganes será tuyo.

💵 Bonificaciones mensuales: Según tu nivel mensual, podrás obtener bonos en dólares y regalos en diamantes en tus transmisiones.

📚 Capacitación VIP: Te entrenamos para que domines las normas, funciones y herramientas que impulsarán tu carrera como creador.

🪄 Magic sin costo: Muchos creadores pagan cientos de dólares por las animaciones y alertas en pantalla para su transmisión — nosotros te damos el primer mes de Magic 100% gratis, y podrás mantenerlo gratis alcanzando tus objetivos de días y diamantes.

🚀 ¡No desaproveches esta oportunidad de llevar tu contenido al siguiente nivel! Estamos listos para impulsarte.$$
WHERE question_label = 'Beneficios de la agencia' AND answer LIKE '%Interactik Interactive%';

-- 3. REQUISITOS (DÍAS VÁLIDOS)
INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['dias validos', 'dia valido', 'minimo', 'cuantos dias', 'requisito', 'que debo cumplir'],
    'Requisito de días válidos',
    $$🚨 ¿Cómo ser un creador activo en la agencia? 🚨

Para mantener tu estatus, necesitas cumplir con un mínimo de 10 días válidos por mes.

✨ ¿Qué es un día válido?
Significa transmitir en TikTok LIVE más de 1 hora y 10 minutos de forma continua y sin cortes dentro del mismo día.
⚠️ Nota importante: Varias transmisiones cortas que sumen más de una hora no cuentan como día válido. Tiene que ser de corrido.

🌍 ¡Atención al reloj!
Recuerda que TikTok se rige estrictamente por el horario de Londres. Te recomendamos revisar la diferencia horaria de tu país para planificar tus directos y asegurarte de no perder tus objetivos.$$,
    30
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Requisito de días válidos');

-- 4. MULTICUENTAS
INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['multicuenta', 'dos cuentas', 'otra cuenta'],
    'Multicuentas',
    $$Está totalmente prohibido usar más de una cuenta de TikTok para transmitir en LIVE — es tolerancia cero. TikTok puede banear todas tus cuentas vinculadas de forma permanente, y además implica desvinculación inmediata de la agencia.$$,
    40
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Multicuentas');

-- 5. BANEOS Y ADVERTENCIAS
INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['baneo', 'banearon', 'advertencia', 'bloqueo', 'restriccion', 'no puedo transmitir'],
    'Baneos y Advertencias',
    $$⚠️ ¿Te banearon o recibiste una advertencia? ⚠️

1. Mantén la calma: Las agencias no tenemos el poder de remover un baneo directamente, pero sí podemos asesorarte para apelar.
2. Revisa la notificación: TikTok siempre te indica el motivo exacto (contenido inapropiado, derechos de autor, menores en pantalla, etc.).
3. Apela de inmediato: Ve al centro de seguridad en tu app de TikTok y envía la apelación.
4. Avisa a tu Team Leader: Pásanos una captura de pantalla del motivo del baneo para que podamos revisar tu caso y guiarte.$$,
    50
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Baneos y Advertencias');

-- 6. COBROS Y MONETIZACIÓN
INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['cobrar', 'pago', 'ganancias', 'plata', 'dinero', 'comision', 'retirar'],
    '¿Cómo y cuándo cobro?',
    $$💰 ¿Cómo cobras tus ganancias? 💰

¡Directamente desde tu aplicación de TikTok! La agencia NO intermedia en tus cobros básicos. El 100% de los diamantes que generes en tus transmisiones van a tu billetera de TikTok, y puedes retirarlos cuando quieras según los métodos disponibles en tu país (PayPal, cuenta bancaria, etc.).

Respecto a las bonificaciones mensuales de la agencia por cumplir tus metas, se liquidan de forma interna al finalizar el mes. ¡Tu Team Leader te guiará con el proceso!$$,
    60
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = '¿Cómo y cuándo cobro?');

-- 7. CONTRATO Y EXCLUSIVIDAD
INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['contrato', 'exclusividad', 'irme', 'salir', 'permanencia'],
    'Contrato y Exclusividad',
    $$📋 ¿Hay contrato de exclusividad o permanencia? 📋

No, en Interactik Agency no te atamos con contratos forzosos. Eres libre de transmitir el contenido que desees. Nuestra permanencia se basa en los resultados y en el valor mutuo. Si en algún momento decides dejar la agencia, puedes solicitar tu desvinculación. ¡Queremos creadores que elijan crecer con nosotros día a día!$$,
    70
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Contrato y Exclusividad');

-- 8. MENORES DE EDAD
INSERT INTO public.whatsapp_faq (keywords, question_label, answer, sort_order)
SELECT
    ARRAY['menor', 'niño', 'hijo', 'hermano', 'edad', 'aparece'],
    'Menores de edad en LIVE',
    $$🚫 Política estricta: Menores de edad en pantalla 🚫

TikTok prohíbe terminantemente que menores de 18 años aparezcan en las transmisiones en vivo (incluso si están acompañados por un adulto). 

Si un menor habla, saluda o aparece un segundo frente a la cámara, tu transmisión será suspendida inmediatamente y de forma permanente. Cuida tu cuenta y asegúrate de transmitir en un entorno privado.$$,
    80
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_faq WHERE question_label = 'Menores de edad en LIVE');