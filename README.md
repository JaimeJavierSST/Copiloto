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

### Nota sobre persistencia de datos

La base de datos (`data.sqlite`) vive en el disco del servidor gratuito, que
**se reinicia vacío cada vez que rehaces un despliegue** (no en cada
"dormida" normal, solo al publicar cambios de código). Para uso real con
varios conductores y guardar el historial permanentemente, en algún momento
conviene mover la base a un servicio externo gratuito como
[Turso](https://turso.tech) o [Supabase](https://supabase.com) — puedo
adaptar el código a cualquiera de los dos cuando quieras dar ese paso.

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
