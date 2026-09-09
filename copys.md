# Copiloto de Ruta — bitácora de frases

Todo lo que dice la app hoy, organizado por dónde aparece. Corrige lo que
quieras (puedes mandarme la lista con los cambios y la actualizo de un tirón).

## 🔔 Notificaciones push (llegan aunque la app esté cerrada)

| # | Evento | Título | Mensaje |
|---|---|---|---|
| 1 | Cada hora de manejo | 🚗 Un mensaje de tu copiloto | Llevas {N} horas manejando. |
| 2 | 30 min antes del máximo (4:30h) | ☕ Se acerca tu descanso | En 30 minutos cumplirás 5 horas de conducción 🙂 |
| 3 | Máximo alcanzado (5h) | 🛑 Hora de parar | Ya llevas 5 horas manejando. Por tu seguridad, es momento de detenerte a descansar. |
| 4 | Descanso cumplido (solo si finalizó como "viaje", no "jornada") | ✅ ¡Ya descansaste! | ¡Buen descanso! Ya puedes retomar tu viaje cuando gustes 🚗 |
| 5 | Genérica (si por algún motivo no llega la info completa) | Copiloto de Ruta | Tienes un nuevo aviso 🙂 |

## 🕐 Tarjeta central del cronómetro

| Estado | Título | Subtítulo |
|---|---|---|
| Sin viaje iniciado | LISTO PARA VIAJAR | Cuando quieras, presiona "Iniciar viaje" |
| En pausa corta | ☕ TOMANDO UNA PAUSA | Sin apuro · retoma cuando estés list@ |
| Pasó las 5 horas | 🛑 ES HORA DE DESCANSAR | Por tu seguridad, te recomendamos {X} de descanso. |
| Entre 4:30 y 5:00 | ☕ SE ACERCA TU DESCANSO | En {X} más, busquemos dónde parar. |
| Manejando normal | 🚗 EN VIAJE | Vas muy bien. Descanso acumulado: {X} |

## 🪧 Banners

| Cuándo aparece | Etiqueta | Texto abajo |
|---|---|---|
| Al iniciar viaje, si el cierre anterior fue "jornada" y el descanso fue ≥ 8h | ANTES DE ESTE VIAJE DESCANSASTE | Tu jornada anterior terminó a las {HH:MM}. |
| Igual al anterior, pero descanso < 8h | ANTES DE ESTE VIAJE DESCANSASTE (rojo) | ⚠️ Menos del mínimo de 8h recomendado. Tu jornada anterior terminó a las {HH:MM}. |
| Después de "Terminar viaje", mientras espera el descanso | TE RECOMENDAMOS DESCANSAR HASTA LAS | Faltan {X}. Te avisamos apenas puedas continuar 🙂 |

## 🔘 Botones

| Botón | Texto |
|---|---|
| Iniciar | 🚗 Iniciar viaje |
| Pausar | ☕ Pausa corta |
| Reanudar | ▶️ Seguir viaje |
| Terminar tramo (sigue trabajando hoy) | 🏁 Terminar viaje |
| Terminar el día completo | 🌙 Terminar jornada |
| Cerrar sesión | Cambiar de conductor |

Texto de ayuda bajo esos dos últimos botones:
> **Terminar viaje**: sigues trabajando hoy — te avisamos apenas puedas retomar.
> **Terminar jornada**: por hoy es todo — no te molestamos con avisos mientras descansas.

## 🪟 Modal — resumen al finalizar

- Título: **¡Buen viaje! 🎉**
- Subtítulo: Aquí tienes el resumen.
- Estados posibles: **Superaste el máximo recomendado** / **Todo dentro de lo recomendado**
- Aviso final (según cómo cerró):
  - Si fue "Terminar jornada": *Como terminaste tu jornada, no te enviaremos avisos mientras descansas. ¡Que descanses! 😴*
  - Si fue "Terminar viaje": *Te avisamos apenas puedas retomar tu viaje 🙂*
- Botón: Cerrar

## 🪟 Modal — descanso insuficiente (< 8h entre jornadas)

- Título: **😴 ¿Alcanzaste a descansar bien?**
- Texto: Notamos que tu descanso fue más corto de lo recomendado (menos de 8 horas). Tómalo con calma y maneja con precaución hoy.
- Botón: Listo, gracias

## 👋 Ingreso / saludo

- Saludo según hora: **¡Buenos días! ☀️** / **¡Buenas tardes! 🌤️** / **¡Buenas noches! 🌙**
- Subtítulo login: Ingresa tu RUT y te acompañamos en tu viaje de hoy.
- Botón login: Comenzar
- Saludo dentro de la app: {saludo} Que tengas un viaje seguro.
- Nota si el navegador no soporta push: Tu navegador no soporta notificaciones push. Te recomendamos Chrome (Android) o Safari agregado a la pantalla de inicio (iPhone) para no perderte ningún aviso.
- Nota si rechaza el permiso: Sin permiso de notificaciones no podremos avisarte de tus horas de manejo ni de tu descanso.

## 📋 Otros textos sueltos

- Historial vacío: Aquí verás tus viajes apenas termines el primero 🙂
- Pie de página: Aunque cierres la app, seguimos atentos para avisarte a tiempo. 🙌
- Nombre de la app (ícono / pestaña): Copiloto de Ruta
