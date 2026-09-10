# Fiscalizador Art. 25 bis — versión conductor (con notificaciones push reales)

App instalable (PWA) para que cada conductor registre su viaje desde su propio
teléfono, con avisos que llegan aunque tenga la app cerrada:

- Cada hora de conducción continua.
- 30 minutos antes de cumplir el máximo de 5 horas.
- Al llegar al máximo de 5 horas.
- Cuando se cumple el descanso proporcional (40% del tiempo conducido) tras
  finalizar el viaje.

Marca checkpoint de ubicación (coordenadas + dirección aproximada) al iniciar
y al finalizar el viaje. Identificación de conductor solo por RUT (sin
contraseña).

## Por qué necesita un servidor

Un archivo HTML suelto no puede avisar nada con la app cerrada y la pantalla
apagada — eso requiere **Web Push real**: el navegador entrega la notificación
del sistema operativo aunque la pestaña no esté abierta, pero necesita un
servidor que calcule cuándo corresponde cada aviso y lo dispare. Este proyecto
incluye ese servidor.

## Cómo funciona el "reloj" de avisos (importante para hosting gratuito)

Los proveedores gratuitos (Render free tier, por ejemplo) **duermen el
servidor tras ~15 minutos sin tráfico**. Para no depender de que el servidor
esté siempre despierto, este proyecto NO usa temporizadores internos: en vez
de eso, expone un endpoint `/api/tick` que, cada vez que alguien lo llama,
revisa todos los viajes activos y envía cualquier aviso que ya corresponda.

Tú debes contratar (gratis) un servicio externo que llame a esa URL cada 1-2
minutos — eso además "despierta" el servidor si estaba dormido. Con esto la
precisión de los avisos es de +/- 1-2 minutos, que es más que suficiente para
avisos por hora.

## Despliegue paso a paso (gratis, con Render)

1. **Sube este proyecto a un repositorio de GitHub** (puede ser privado).
2. Entra a [render.com](https://render.com) y crea una cuenta gratis.
3. **New +** → **Web Service** → conecta tu repositorio.
4. Configuración:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. En la pestaña **Environment**, agrega las variables del archivo
   `.env.example` (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, TICK_SECRET si
   quieres, y no hace falta PORT — Render lo asigna solo).
6. Al desplegar, Render te da una URL tipo
   `https://fiscalizador-art25bis.onrender.com`. Esa es la URL que compartes
   con tus conductores.

### Activar el "tick" (los avisos de fondo)

1. Entra a [cron-job.org](https://cron-job.org) y crea una cuenta gratis.
2. Crea un nuevo cronjob:
   - **URL:** `https://TU-URL-DE-RENDER.onrender.com/api/tick` (agrega
     `?secret=TU_TICK_SECRET` al final si configuraste `TICK_SECRET`)
   - **Intervalo:** cada 1 o 2 minutos
3. Guarda. Desde ese momento el sistema revisa y envía avisos de forma
   automática, sin que nadie tenga que abrir la app.

### Base de datos persistente (Turso) — soluciona el problema del arranque en frío

Render free "duerme" el servicio tras ~15 min sin tráfico, y al despertar el
disco local **no se conserva** — por eso se perdían los contadores. La
solución es sacar la base de datos del disco de Render y ponerla en
[Turso](https://turso.tech), gratis y siempre disponible:

1. Entra a [turso.tech](https://turso.tech) y crea una cuenta gratis (puedes
   entrar con tu cuenta de GitHub).
2. Instala su CLI o usa el panel web para crear una base de datos nueva —
   desde el dashboard: **Create Database**, ponle un nombre
   (ej. `copiloto-de-ruta`), elige la región más cercana a Chile (por
   ejemplo `gru` — São Paulo) y confirma.
3. Dentro de esa base de datos, busca el botón para generar credenciales:
   - **Database URL**: se ve así `libsql://copiloto-de-ruta-tuusuario.turso.io`
   - **Auth Token**: un texto largo (créalo con el botón "Create Token" o
     "Generate Token").
4. En Render, ve a tu servicio → **Environment** → agrega:
   - `TURSO_DATABASE_URL` = la URL del paso anterior
   - `TURSO_AUTH_TOKEN` = el token del paso anterior
5. Guarda — Render va a reiniciar el servicio solo. Desde ese momento, todos
   los viajes y conductores se guardan en Turso, no en el disco de Render.
   Puedes apagar y prender el servicio, o dejar que se duerma por
   inactividad: los datos siempre van a estar ahí.

Si no defines estas dos variables, la app sigue funcionando pero vuelve a
usar un archivo local — bien para probar en tu computador, no para
producción con varios conductores.

## Instalar la app en el teléfono de cada conductor

- **Android (Chrome):** abrir la URL → menú (⋮) → "Agregar a pantalla de
  inicio". Queda como un ícono normal.
- **iPhone (Safari):** abrir la URL → botón compartir → "Agregar a pantalla
  de inicio". **Es obligatorio hacer esto en iPhone**, si no, Safari no
  entrega notificaciones aunque el conductor las acepte. Requiere iOS 16.4 o
  superior.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm start
```

Abre `http://localhost:3000`. La geolocalización y las notificaciones piden
permiso la primera vez que un conductor inicia sesión con su RUT.
