# Contexto de negocio — Interactik Agency

> Esta sección resume decisiones, fórmulas y contexto de negocio validados en trabajo previo
> sobre las herramientas internas de Interactik Agency (panel de creadores, reparto entre
> socios, guías para managers y creadores). No es documentación de este repositorio — es
> contexto de negocio para cualquier tarea relacionada con creadores, managers, bonificaciones
> u objetivos dentro de este proyecto. Si algo acá entra en conflicto con lo que pide el
> usuario en el momento, gana lo que diga el usuario: esto es punto de partida, no verdad fija.

## Quién es quién

- **Interactik Agency**: agencia de livestreaming de TikTok, partner oficial de TikTok LIVE LATAM.
- Dos socios/dueños: **Patricio** (patriciosalguerofrias@gmail.com, usuario que habla con Claude) y **Deian** (deianblaz@gmail.com).
- Managers de reclutamiento externos, actualmente todos gestionados y pagados por Patricio (no por Deian): ancastro178@gmail.com, cquintana20@gmail.com, contymansilla11@gmail.com, luisitagavi@gmail.com, sergira007@gmail.com.
- Objetivo mensual de diamantes de la agencia (referencia para las fórmulas de comisión): **7.660.000 diamantes**.

## Fórmulas de compensación de managers (verificadas, viven en el Panel de Creadores)

Pago mensual de un manager = **pago base** (por tier de reclutamiento) + **comisión variable** (3 fuentes).

**Pago base por tier:**
| Tier | Nuevos creadores/mes | "Monetizan" (score) | Graduados | Pago |
|---|---|---|---|---|
| 1 | ≥25 | ≥10 | ≥4 | $250 |
| 2 | ≥20 | ≥5 | ≥1 | $200 |
| 3 (no alcanza) | — | — | — | $0, a discreción, con riesgo de desvinculación |

- "Monetizan" (`pesoMonetiza`): un creador pesa 1.0 si generó ≥80.000 💎 en el último mes, 0.5 si generó entre 40.000 y 80.000, 0 si menos.
- Un creador cuenta hacia la cuota de 25 reclutados desde que se incorpora, sea cual sea el resultado de su prueba de inducción — pero si no pasa la prueba, baja el % de cartera activa del manager, y eso sí le cuesta comisión.

**Las 3 fuentes de comisión variable** (todas usan la misma fórmula base):
```
comisionDolares(diamantes, tasaPct) = diamantes * tasaPct / 10000 * (pctRepartoComisiones / 100)
```
- `pctRepartoComisiones = 40` → el manager se queda con el **40%** del pool de comisión que genera; el otro **60% queda para la agencia** (los dueños). Esta cifra es información interna — no se expone en las guías dirigidas a managers.
- **Subida de rango** (`tasaSubir = 4`): un creador subió de nivel de rango este período → 4%.
- **Retención de rango alto** (`tasaMantener = 2`): un creador se mantuvo en nivel >2 sin subir → 2%. (Evitar el término "retención de rango 3+" con managers — confunde; usar "mantener un rango alto".)
- **Actividad** (`tasasActividad = [0.5, 1, 1.5, 2, 2.5]`): tiers por días válidos de LIVE + horas de duración: {8d/20h}, {12d/35h}, {15d/50h}, {18d/70h}, {22d/90h} → tasa según el tier más alto alcanzado.
- **Incremento de ingresos de la agencia** (`INCREMENTO_TIERS`): tasa según qué % del objetivo mensual (7.660.000 💎) alcanzó TODA la agencia ese mes, aplicada sobre los diamantes que gestiona cada manager: ≥90% → 5.5%, ≥100% → 9%. Por debajo de 90%, tasa 0.

**Manejar 20+ creadores que suben de rango en un mismo mes es prácticamente imposible en la práctica** — un ejemplo realista ronda 4-5 subiendo de rango, 15 manteniendo rango alto, 25 cumpliendo el umbral de actividad, no docenas.

**Qué NO afecta el pago de un manager** (y por qué, para explicarlo si hace falta): horas dedicadas (no hay forma de controlar horas reales trabajadas, así que se paga por resultado), antigüedad en la agencia, que un creador se haya ido (ya se refleja en las otras métricas), tamaño del roster en sí (importa el resultado, no el volumen bruto).

## Reparto entre Socios — cómo se divide la ganancia entre Patricio y Deian

No es 50/50 fijo — se recalcula cada mes según **diamantes atribuibles a cada dueño**:

- Cada creador se clasifica según su "Agente" (manager de reclutamiento) real: si el agente pertenece a la lista de Patricio → cuenta para Patricio; si pertenece a la de Deian → cuenta para Deian.
- **Cartera "legacy"**: creadores con mucha antigüedad bajo el agente de un dueño pero sin manager de reclutamiento activo — se reparten con un algoritmo de **partición balanceada por total** (no por promedio — balancear por promedio es inestable si hay un outlier grande y puede volcar casi todo a un solo lado). Se puede reasignar cualquiera a mano.
- **gestorManagers**: como los managers de reclutamiento externos hoy los gestiona y les paga Patricio, todos los diamantes que ellos generan cuentan para el lado de Patricio, y el costo de pagarles también sale de su lado — Deian no gana ni pierde según el desempeño de esos managers.
- **modeloGestion** (togglable): alternativa donde la gestión de esos managers se paga con un fee fijo en vez de por diamantes.
- Solo los "productores reales" (≥80.000 💎/mes) mueven el % de reparto — la cola larga de creadores casi sin producción no se pelea.
- Herramienta: `B:\ANALISIS DE CREADORES\Reparto entre Socios.html` (standalone, datos en localStorage del navegador). Permite: asignar manualmente CUALQUIER creador a un dueño (la asignación manual siempre gana sobre la clasificación automática por agente), importar una agrupación externa desde Excel (ej. la que arma Deian, "Grupos_equilibrados_XXX_creadores.xlsx" — ese archivo balancea por diamantes puros, ignorando quién gestiona a quién hoy, así que hay que mapear a mano qué grupo es de cada dueño antes de aplicar), y exportar la cartera final de cada dueño a un .xlsx con dos hojas.

**Insight clave (verificado con cálculo, no solo intuición):** el pool total de comisión que genera un diamante es el mismo sin importar quién lo gestione. La única diferencia entre "con managers" y "sin managers" es que managers se quedan con el 40% del pool que ellos gestionan + su pago base — ese costo cae **enteramente del lado del dueño que los gestiona** (Patricio), no se reparte con el otro socio. Tener managers solo se paga solo si permiten reclutar/gestionar más volumen del que el dueño podría manejar personalmente — en plata pura, sobre una cartera ya existente, es un costo neto.

## Documentos ya construidos (referencia, no reconstruir desde cero)

Todos en `B:\ANALISIS DE CREADORES\`:
- **Panel de Creadores.html** — app principal de gestión (fuente: `shell.html` en el scratchpad de esa sesión).
- **Reparto entre Socios.html** — herramienta de reparto descrita arriba.
- **Monetizacion para managers.pdf** — guía para managers: cómo monetizan, tiers de pago base, las 3 comisiones, "Tener criterio no es discriminar" (selectividad al reclutar), casos de monetización (no alcanza cupo, mínimo, justo, con bono base, mejor caso con bono más alto), qué NO afecta el pago.
- **Guia para creadores - Objetivos y expectativas.pdf** — guía para creadores nuevos o que no alcanzan objetivos: programa de inducción de 4 semanas, tiers de bonificación, cómo calcular el objetivo diario, qué mide TikTok como "interacción", la "trampa del hobby" (dedicarle tiempo sin tratarlo como трabajo), reglas del Club de fans, proceso de reactivación (7 días de inactividad).
- **Protocolo operativo - Reclutamiento, Induccion y Reactivacion.pdf** — proceso completo: reclutamiento (25 nuevos/manager/mes, 3 preguntas de filtro antes de incorporar), inducción progresiva de 4 semanas (1.000 → 5.000 → 10-15.000 → 15-20.000 💎, exigencia sube si no cumple), reactivación (7 días, ≥5 días de transmisión, ≥10.000 💎), plantillas de comunicación (incluye 7 variantes de "gancho" para el primer mensaje, sin saludo inicial — el gancho tiene que ser la primera línea).

**Identidad visual de los 3 PDFs**: fondo casi negro (`#050505`), morado como color principal (`#bf5af2` / `#7c3aed`), dorado/rojo/verde como acentos secundarios estilo TikTok — tomado de la paleta real de interactikagency.com. Tipografía "TikTok Sans". Un solo tema oscuro, sin modo claro.

## Estilo al escribir para managers o creadores

- **Nunca exponer el % de reparto de comisiones (40%) ni la fórmula literal** en contenido dirigido a managers — es información interna de márgenes.
- **Evitar intensificadores que suenan a IA/guion**, no a mensaje humano: "de verdad", "muchísimo", "bastante", "real" usado como refuerzo, frases tipo "y eso es justo lo que buscamos". Preferir la versión más simple y directa.
- **En mensajes de outreach en frío**: nada de saludo largo tipo "Buenas! Soy [nombre] de Interactik Agency, Partner oficial..." como apertura — eso se ignora. El gancho/pregunta va primero, la identificación (quién sos, que es oficial y gratis) va en la segunda frase, después de haber generado curiosidad.
- Voseo (vos/tenés/podés), no "tú/tienes/puedes".
- Ejemplos numéricos siempre realistas y verificables — nunca inflar cifras (ej.: no decir "23 creadores suben de rango en un mes", el techo real ronda 4-5).
