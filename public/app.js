(function () {
  "use strict";

  var HOUR_MS = 3600 * 1000;
  var ALERT_THRESHOLD_MS = 4.5 * HOUR_MS;
  var MAX_THRESHOLD_MS = 5 * HOUR_MS;
  var REST_RATIO = 0.4;
  var STORE_RUT = 'f25b_rut';

  var el = {};
  ['statusdot','loginView','appView','rutInput','rutError','btnLogin','permnote','loginGreeting','appGreeting',
   'clockcard','clocklabel','clocktime','clocksub','gaugefill',
   'restbanner','restUntil','restSub','prevRestBanner','prevRestTime','prevRestSub',
   'insufficientModal','insufDuration','insufSince','btnCloseInsufficient',
   'mainActions','toggleActions','finalizeActions','finalizeHint',
   'btnStart','btnToggle','btnEndTrip','btnEndDay','btnLogout',
   'histList','histEmpty','histCount','rutLabel',
   'summaryModal','sumDriving','sumRest','sumUntil','sumStatus','sumNotice','btnCloseSummary'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  var rut = null;
  var trip = null;       // active/paused trip object from server
  var lastEnded = null;  // last ended trip (for rest banner)
  var firstSyncDone = false; // true once we've confirmed state with the server at least once
  var tickTimer = null;
  var syncTimer = null;

  // ---------- Utils ----------
  function cleanRut(v) { return String(v || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
  function validRut(v) {
    var clean = cleanRut(v);
    if (clean.length < 2) return false;
    var body = clean.slice(0, -1), dv = clean.slice(-1);
    var sum = 0, mul = 2;
    for (var i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i], 10) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    var res = 11 - (sum % 11);
    var expected = res === 11 ? '0' : res === 10 ? 'K' : String(res);
    return expected === dv;
  }
  function fmtHMS(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return [h, m, sec].map(function (v) { return String(v).padStart(2, '0'); }).join(':');
  }
  function fmtHM(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h + 'h ' + String(m).padStart(2, '0') + 'm';
  }
  function fmtClock(ts) {
    var d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(ts) {
    var d = new Date(ts);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function greeting() {
    var h = new Date().getHours();
    if (h >= 6 && h < 12) return '¡Buenos días! ☀️';
    if (h >= 12 && h < 19) return '¡Buenas tardes! 🌤️';
    return '¡Buenas noches! 🌙';
  }
  function applyGreeting() {
    el.loginGreeting.textContent = greeting();
    el.appGreeting.textContent = greeting() + ' Que tengas un viaje seguro.';
  }
  applyGreeting();
  setInterval(applyGreeting, 15 * 60 * 1000); // se actualiza solo si el turno cruza de tarde a noche, etc.

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    return fetch(path, opts).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Error'); });
      return r.json();
    });
  }

  function getGeo() {
    return new Promise(function (resolve) {
      if (!('geolocation' in navigator)) return resolve({ lat: null, lng: null });
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        function () { resolve({ lat: null, lng: null }); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  // ---------- Push subscription ----------
  function setupPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      el.permnote.textContent = 'Tu navegador no soporta notificaciones push. Te recomendamos Chrome (Android) o Safari agregado a la pantalla de inicio (iPhone) para no perderte ningún aviso.';
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register('/sw.js')
      .then(function (reg) { return reg.pushManager.getSubscription().then(function (sub) { return { reg: reg, sub: sub }; }); })
      .then(function (r) {
        if (r.sub) return r.sub;
        return Notification.requestPermission().then(function (perm) {
          if (perm !== 'granted') {
            el.permnote.textContent = 'Sin permiso de notificaciones no podremos avisarte de tus horas de manejo ni de tu descanso.';
            return null;
          }
          return api('/api/vapid-public-key').then(function (r2) {
            return r.reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(r2.publicKey)
            });
          });
        });
      });
  }

  // ---------- Login ----------
  el.btnLogin.addEventListener('click', doLogin);
  el.rutInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') doLogin(); });

  function doLogin() {
    var v = el.rutInput.value;
    if (!validRut(v)) {
      el.rutError.textContent = 'RUT inválido. Verifica el número y dígito verificador.';
      return;
    }
    el.rutError.textContent = '';
    rut = cleanRut(v);
    el.btnLogin.disabled = true;
    el.btnLogin.textContent = 'Ingresando…';

    setupPush().then(function (sub) {
      return api('/api/driver/register', { method: 'POST', body: { rut: rut, subscription: sub } });
    }).then(function () {
      localStorage.setItem(STORE_RUT, rut);
      enterApp();
    }).catch(function (err) {
      el.rutError.textContent = 'Error al registrar: ' + err.message;
      el.btnLogin.disabled = false;
      el.btnLogin.textContent = 'Ingresar';
    });
  }

  el.btnLogout.addEventListener('click', function () {
    localStorage.removeItem(STORE_RUT);
    stopTimers();
    rut = null; trip = null; lastEnded = null;
    el.appView.style.display = 'none';
    el.loginView.style.display = '';
    el.rutInput.value = '';
  });

  function enterApp() {
    el.rutLabel.textContent = formatRutDisplay(rut);
    applyGreeting();
    el.loginView.style.display = 'none';
    el.appView.style.display = '';

    // Arrancamos el reloj visual y la sincronización periódica de inmediato,
    // sin esperar a que la primera consulta responda. Así, si el servidor
    // está "despertando" (arranque en frío) y la primera consulta falla o
    // se demora, igual vamos a reintentar solos en los próximos segundos
    // en vez de quedarnos pegados mostrando "sin viaje".
    // Ocultamos los botones de acción hasta confirmar el estado real con el
    // servidor, para evitar que alguien presione "Iniciar viaje" por error
    // mientras todavía estamos cargando (ej. servidor recién despertando).
    el.mainActions.style.display = 'none';
    el.toggleActions.style.display = 'none';
    el.finalizeActions.style.display = 'none';
    el.finalizeHint.style.display = 'none';

    startTick();
    startSync();
    refreshActive().catch(function () {
      // Reintento rápido si el primer intento falla (ej. servidor recién despertando).
      setTimeout(function () { refreshActive().catch(function () {}); }, 4000);
    });
    refreshHistory().catch(function () {});
  }

  function formatRutDisplay(r) {
    var body = r.slice(0, -1), dv = r.slice(-1);
    var withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return withDots + '-' + dv;
  }

  // ---------- Trip actions ----------
  el.btnStart.addEventListener('click', function () {
    setBusy(el.btnStart, true);
    getGeo().then(function (loc) {
      return api('/api/trip/start', { method: 'POST', body: { rut: rut, lat: loc.lat, lng: loc.lng } });
    }).then(function (result) {
      return refreshActive().then(function () { return result; });
    }).then(function (result) {
      if (result.restBeforeInsufficient) {
        el.insufDuration.textContent = result.restBeforeLabel;
        el.insufSince.textContent = result.restBeforeSinceLabel;
        el.insufficientModal.classList.add('show');
      }
    }).catch(function (err) { alert('No se pudo iniciar el viaje: ' + err.message); })
      .finally(function () { setBusy(el.btnStart, false); });
  });
  el.btnCloseInsufficient.addEventListener('click', function () { el.insufficientModal.classList.remove('show'); });

  el.btnToggle.addEventListener('click', function () {
    if (!trip) return;
    var call = trip.status === 'driving'
      ? api('/api/trip/pause', { method: 'POST', body: { rut: rut } })
      : api('/api/trip/resume', { method: 'POST', body: { rut: rut } });
    call.then(refreshActive);
  });

  function finalize(endType, btn) {
    setBusy(btn, true);
    getGeo().then(function (loc) {
      return api('/api/trip/end', { method: 'POST', body: { rut: rut, lat: loc.lat, lng: loc.lng, endType: endType } });
    }).then(function (summary) {
      el.sumDriving.textContent = fmtHMS(summary.drivingMs);
      el.sumRest.textContent = summary.restLabel;
      el.sumUntil.textContent = summary.restEndsAtLabel;
      el.sumStatus.textContent = summary.over ? 'Superaste el máximo recomendado' : 'Todo dentro de lo recomendado';
      el.sumStatus.style.color = summary.over ? 'var(--danger)' : 'var(--safe)';
      el.sumNotice.textContent = summary.endType === 'jornada'
        ? 'Como terminaste tu jornada, no te enviaremos avisos mientras descansas. ¡Que descanses! 😴'
        : 'Te avisamos apenas puedas retomar tu viaje 🙂';
      el.summaryModal.classList.add('show');
      return refreshActive();
    }).then(refreshHistory)
      .catch(function (err) { alert('No se pudo finalizar: ' + err.message); })
      .finally(function () { setBusy(btn, false); });
  }
  el.btnEndTrip.addEventListener('click', function () { finalize('viaje', el.btnEndTrip); });
  el.btnEndDay.addEventListener('click', function () { finalize('jornada', el.btnEndDay); });
  el.btnCloseSummary.addEventListener('click', function () { el.summaryModal.classList.remove('show'); });

  function setBusy(btn, busy) { btn.disabled = busy; }

  // ---------- Sync with server ----------
  function refreshActive() {
    return api('/api/trip/active/' + rut).then(function (data) {
      trip = data.trip;
      lastEnded = data.lastEnded;
      firstSyncDone = true;
      updateButtons();
      renderRestBanner();
      renderPrevRestBanner();
    });
  }
  function refreshHistory() {
    return api('/api/trip/history/' + rut).then(function (data) { renderHistory(data.trips); });
  }
  function startSync() {
    stopSync();
    syncTimer = setInterval(function () { refreshActive().catch(function () {}); }, 20000);
  }
  function stopSync() { if (syncTimer) { clearInterval(syncTimer); syncTimer = null; } }

  // ---------- Local ticking (smooth display only; server is source of truth for notifications) ----------
  function startTick() {
    stopTick();
    tickTimer = setInterval(render, 1000);
    render();
  }
  function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
  function stopTimers() { stopTick(); stopSync(); }

  function currentDrivingMs() {
    if (!trip) return 0;
    var extra = (trip.status === 'driving' && trip.segment_start) ? (Date.now() - trip.segment_start) : 0;
    return trip.accumulated_ms + extra;
  }

  function updateButtons() {
    if (!trip) {
      el.mainActions.style.display = '';
      el.toggleActions.style.display = 'none';
      el.finalizeActions.style.display = 'none';
      el.finalizeHint.style.display = 'none';
    } else {
      el.mainActions.style.display = 'none';
      el.toggleActions.style.display = '';
      el.finalizeActions.style.display = '';
      el.finalizeHint.style.display = '';
      el.btnToggle.textContent = trip.status === 'driving' ? '☕ Pausa corta' : '▶️ Seguir viaje';
    }
  }

  function renderRestBanner() {
    if (!lastEnded || !lastEnded.rest_ends_at) { el.restbanner.style.display = 'none'; return; }
    var now = Date.now();
    if (lastEnded.rest_ends_at <= now) { el.restbanner.style.display = 'none'; return; }
    if (trip) { el.restbanner.style.display = 'none'; return; } // hidden once a new trip starts
    el.restbanner.style.display = '';
    el.restUntil.textContent = fmtClock(lastEnded.rest_ends_at);
    el.restSub.textContent = 'Faltan ' + fmtHM(lastEnded.rest_ends_at - now) + '. Te avisamos apenas puedas continuar 🙂';
  }

  function renderPrevRestBanner() {
    if (!trip || trip.rest_before_ms == null) { el.prevRestBanner.style.display = 'none'; return; }
    el.prevRestBanner.style.display = '';
    el.prevRestBanner.classList.toggle('insufficient', !!trip.rest_before_insufficient);
    el.prevRestTime.textContent = fmtHM(trip.rest_before_ms);
    el.prevRestSub.textContent = (trip.rest_before_insufficient ? '⚠️ Menos del mínimo de 8h recomendado. ' : '') +
      'Tu jornada anterior terminó a las ' + fmtClock(trip.rest_before_since) + '.';
  }

  function render() {
    var ms = currentDrivingMs();
    el.clocktime.textContent = fmtHMS(ms);

    var pct = Math.min(100, (ms / MAX_THRESHOLD_MS) * 100);
    el.gaugefill.style.width = pct + '%';

    var mode = 'safe';
    if (ms >= MAX_THRESHOLD_MS) mode = 'danger';
    else if (ms >= ALERT_THRESHOLD_MS) mode = 'warn';
    el.gaugefill.style.background = mode === 'danger' ? 'var(--danger)' : (mode === 'warn' ? 'var(--warn)' : 'var(--safe)');

    el.clockcard.classList.remove('warn', 'danger');
    el.statusdot.classList.remove('on', 'warn', 'danger');

    if (!trip) {
      if (!firstSyncDone) {
        el.clocklabel.textContent = 'CONECTANDO…';
        el.clocksub.textContent = 'Un momento, estamos cargando tu viaje…';
      } else {
        el.clocklabel.textContent = 'LISTO PARA VIAJAR';
        el.clocksub.textContent = 'Cuando quieras, presiona "Iniciar viaje"';
      }
    } else if (trip.status === 'paused') {
      el.clocklabel.textContent = '☕ TOMANDO UNA PAUSA';
      el.clocksub.innerHTML = 'Sin apuro · retoma cuando estés list@';
      el.statusdot.classList.add('warn');
    } else if (mode === 'danger') {
      el.clockcard.classList.add('danger');
      el.clocklabel.textContent = '🛑 ES HORA DE DESCANSAR';
      el.clocksub.innerHTML = 'Por tu seguridad, te recomendamos <b>' + fmtHM(ms * REST_RATIO) + '</b> de descanso.';
      el.statusdot.classList.add('danger');
    } else if (mode === 'warn') {
      el.clockcard.classList.add('warn');
      el.clocklabel.textContent = '☕ SE ACERCA TU DESCANSO';
      el.clocksub.innerHTML = 'En <b>' + fmtHM(MAX_THRESHOLD_MS - ms) + '</b> más, busquemos dónde parar.';
      el.statusdot.classList.add('warn');
    } else {
      el.clocklabel.textContent = '🚗 EN VIAJE';
      el.clocksub.innerHTML = 'Vas muy bien. Descanso acumulado: <b>' + fmtHM(ms * REST_RATIO) + '</b>';
      el.statusdot.classList.add('on');
    }
    renderRestBanner();
  }

  function renderHistory(trips) {
    el.histCount.textContent = trips.length;
    el.histEmpty.style.display = trips.length ? 'none' : '';
    el.histList.innerHTML = trips.map(function (t) {
      var over = t.driving_ms > MAX_THRESHOLD_MS;
      return '<div class="trip-card">' +
        '<div class="head"><span class="date">' + fmtDate(t.start_time) + '</span>' +
        '<span class="badge ' + (over ? 'over' : 'ok') + '">' + (over ? 'Sobre el máximo' : 'Dentro del límite') + '</span></div>' +
        '<div class="metrics">' +
        '<div class="metric"><span class="n">' + fmtHMS(t.driving_ms) + '</span><span class="l">Conducción</span></div>' +
        '<div class="metric rest"><span class="n">' + fmtHM(t.rest_ms) + '</span><span class="l">Descanso req.</span></div>' +
        '<div class="metric"><span class="n">' + fmtClock(t.rest_ends_at) + '</span><span class="l">Hasta las</span></div>' +
        '</div>' +
        (t.rest_before_insufficient ? '<div class="badge over" style="margin-top:8px; display:inline-block;">⚠️ Inició con descanso &lt; 8h entre jornadas</div>' : '') +
        '<div class="addr">Inicio: ' + (t.start_address || '—') + '<br>Fin: ' + (t.end_address || '—') + '</div>' +
        '</div>';
    }).join('');
  }

  // ---------- Init ----------
  var savedRut = localStorage.getItem(STORE_RUT);
  if (savedRut) {
    rut = savedRut;
    enterApp();
  }

})();
