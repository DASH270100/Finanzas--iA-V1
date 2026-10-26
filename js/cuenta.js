// Finanzas IA · cuenta.js — Cuenta: usuario, administración, notificaciones, contraseña y configuración
// Se cargan en orden: nucleo → cuenta → inicio → secciones → registro → eventos (comparten el mismo ámbito global).
"use strict";

// =========================
// USUARIO Y ADMINISTRACIÓN
// =========================

const esAdmin = () => !modoDemo && !!estado.usuario && estado.usuario.rol === "admin";

function renderUsuario() {

    const u = estado.usuario;

    const titulo = document.querySelector(".header h1");

    // Cada persona elige cómo la saluda la app (Configuración → Mi cuenta)
    const saludo = u && (u.saludo || u.nombre);

    if (titulo && saludo) titulo.textContent = "Hola " + saludo;

    if (!$("vista-configuracion").hidden) renderConfig();

}

// =========================
// NOTIFICACIONES (todas las personas): recordatorios de pagos; a Diego además el buzón
// =========================
const notificaciones = (() => {

    // Notificaciones de la propia app (Web Push). En el iPhone: con la app agregada a la pantalla de inicio.
    const pushSoportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    const esIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

    const instalada = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

    function nombreDispositivo() {

        const ua = navigator.userAgent;

        return (/iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Android/i.test(ua) ? "Android" : /Mac/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows" : "Otro") +
            (instalada() ? " · app" : " · navegador");

    }

    function urlB64ABytes(b64) {

        const pad = "=".repeat((4 - (b64.length % 4)) % 4);

        const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));

        return Uint8Array.from(raw, (c) => c.charCodeAt(0));

    }

    // Cómo agregar la app al inicio según el navegador del iPhone
    function pasosInstalarIOS() {

        const ua = navigator.userAgent;

        const ultimo = `<li>Abre Finanzas IA desde ese ícono nuevo, entra con tu usuario y vuelve aquí a <b>Activar notificaciones</b>.</li>`;

        if (/CriOS/i.test(ua)) return `
            <li>En Chrome, toca el botón <b>Compartir</b> <span aria-hidden="true">⬆️</span> que está arriba, junto a la dirección. Si no lo ves, toca los <b>tres puntos</b> y luego <b>Compartir</b>.</li>
            <li>Elige <b>Agregar a pantalla de inicio</b>. Si ya tenías el ícono, bórralo y agrégalo otra vez.</li>
            ${ultimo}`;

        if (/FxiOS|EdgiOS|OPiOS/i.test(ua)) return `
            <li>Abre el menú del navegador y toca <b>Compartir</b>.</li>
            <li>Elige <b>Agregar a pantalla de inicio</b>. Si no aparece, abre esta página en <b>Safari</b> y hazlo desde ahí.</li>
            ${ultimo}`;

        return `
            <li>En Safari, toca <b>Compartir</b> <span aria-hidden="true">⬆️</span> (abajo, en el centro).</li>
            <li>Elige <b>Agregar a inicio</b>. Si ya tenías el ícono, bórralo y agrégalo otra vez.</li>
            ${ultimo}`;

    }

    async function suscripcionActual() {

        try {

            const reg = await navigator.serviceWorker.getRegistration();

            return reg ? await reg.pushManager.getSubscription() : null;

        } catch (e) { return null; }

    }

    async function pintarAvisos() {

        const caja = $("notifCaja");

        if (!caja) return;

        if (modoDemo) { caja.innerHTML = '<div class="avisos-off"><span>En el modo demo no hay notificaciones.</span></div>'; return; }

        if (!estado.usuario || !estado.usuario.usuario) { caja.innerHTML = '<div class="avisos-off"><span>Para recibir notificaciones necesitas tu usuario y contraseña.</span></div>'; return; }

        if (!pushSoportado()) {

            caja.innerHTML = esIOS() && !instalada()
                ? `<div class="avisos-off">
                        <span>🔔 <b>Notificaciones en tu iPhone</b>: primero agrega Finanzas IA a tu pantalla de inicio.</span>
                        <ol class="avisos-pasos">${pasosInstalarIOS()}</ol>
                   </div>`
                : `<div class="avisos-off"><span>🔔 Este navegador no permite notificaciones. Prueba desde Chrome, Edge o desde la app en tu iPhone.</span></div>`;

            return;

        }

        if (Notification.permission === "denied") {

            caja.innerHTML = `<div class="avisos-off"><span>🔕 Las notificaciones están bloqueadas. Actívalas en <b>Ajustes → Notificaciones → Finanzas IA</b> y vuelve aquí.</span></div>`;

            return;

        }

        const sub = await suscripcionActual();

        caja.innerHTML = sub
            ? `<div class="avisos-on">
                    <div class="avisos-fila">
                        <span>🔔 <b>Notificaciones activas</b> en este ${esc(nombreDispositivo().split(" ·")[0])}</span>
                        <button class="mov-btn" type="button" data-avisos="probar">Probar</button>
                        <button class="mov-btn" type="button" data-avisos="quitar">Desactivar</button>
                    </div>
                    <small class="avisos-nota">Probar te manda tus pagos de hoy y de los próximos 2 días (si tienes).</small>
               </div>`
            : `<div class="avisos-off">
                    <span>Actívalas en este celular para que te lleguen aunque no tengas la app abierta.</span>
                    <button class="mov-btn" type="button" data-avisos="activar">Activar notificaciones</button>
               </div>`;

    }

    async function accionAvisos(b) {

        const que = b.dataset.avisos;

        b.disabled = true;

        try {

            if (que === "activar") {

                // El permiso se pide primero, directo del toque (el iPhone lo exige así)
                const permiso = await Notification.requestPermission();

                if (permiso !== "granted") { mostrarToast("🔕 Sin permiso no te puedo avisar"); pintarAvisos(); return; }

                const reg = await navigator.serviceWorker.register("sw.js");

                await navigator.serviceWorker.ready;

                const { clave } = await api("push", { op: "clave" });

                let sub = await reg.pushManager.getSubscription();

                if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ABytes(clave) });

                const desde = Date.now() - 120000;

                const r = await api("push", { op: "suscribir", sub: sub.toJSON(), dispositivo: nombreDispositivo() });

                const c = await caches.open("fia-push");

                await c.put("cfg", new Response(JSON.stringify({ api: API_URL, clave: r.clave, desde })));

                mostrarToast(r.enviados ? "🔔 ¡Listo! Te mandé una notificación de prueba" : "🔔 Activadas. Toca Probar para ver una");

            } else if (que === "probar") {

                const r = await api("push", { op: "probar" });

                mostrarToast(!r.enviados ? "No se pudo enviar. Desactiva y vuelve a activar."
                    : r.pagos ? `🔔 Te mandé ${r.pagos === 1 ? "tu pago" : "tus " + r.pagos + " pagos"} de estos días`
                    : "🔔 Enviada. No tienes pagos cerca, pero así te va a llegar");

            } else if (que === "quitar") {

                const sub = await suscripcionActual();

                if (sub) { await api("push", { op: "quitar", endpoint: sub.endpoint }); await sub.unsubscribe(); }

                mostrarToast("🔕 Notificaciones desactivadas en este dispositivo");

            }

            pintarAvisos();

        } catch (e) {

            if (e instanceof ErrorPin) { errorDeAccion(e); return; }

            console.error(e);

            mostrarToast("❌ " + (e && e.message ? e.message : "No se pudieron activar las notificaciones"));

        } finally {

            if (b.isConnected) b.disabled = false;

        }

    }

    function iniciar() {

        const caja = $("notifCaja");

        if (!caja) return;

        caja.addEventListener("click", (e) => {

            const b = e.target.closest("[data-avisos]");

            if (b) accionAvisos(b);

        });

    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

    return { pintar: pintarAvisos };

})();

function renderConfig() {

    const visible = esAdmin();

    $("adminCard").hidden = !visible;

    if (visible) { cargarPersonas(); buzon.cargarAdmin(); }

    // "Mi cuenta": nombre para todos; la contraseña solo para quienes no son admin (el admin la cambia en el Apps Script)
    const u = estado.usuario;

    const conCuenta = !modoDemo && !!u && !!u.usuario;

    $("cuentaBloque").hidden = !conCuenta;

    if (conCuenta) {

        $("cuentaUsuario").textContent = "@" + u.usuario;

        $("cuentaNombre").textContent = u.saludo || u.nombre || "—";

        $("cuentaClave").hidden = u.rol === "admin";

        $("cuentaNotaClave").hidden = u.rol === "admin";

    }

    $("notifTexto").textContent = u && u.rol === "admin"
        ? "Te aviso 2 días antes y el mismo día de tus pagos, y cuando llega una falla, idea o duda al buzón."
        : "Te aviso 2 días antes y el mismo día de tus pagos fijos, cuotas y tarjetas, y el día que te pagan.";

    notificaciones.pintar();

}

// =========================
// CAMBIAR CONTRASEÑA
// =========================

// forzado = entró con una contraseña temporal y no puede seguir sin cambiarla
function abrirCambioClave(forzado) {

    estado.claveForzada = !!forzado;

    $("claveTitulo").textContent = forzado ? "Crea tu contraseña" : "Cambiar contraseña";

    $("claveTexto").textContent = forzado
        ? "Diego te dio una contraseña temporal. Elige una nueva que solo tú sepas."
        : "Escribe tu contraseña actual y la nueva.";

    $("claveActual").hidden = forzado;

    $("claveActual").required = !forzado;

    $("claveCancelar").hidden = forzado;

    $("claveUsuario").value = (estado.usuario && estado.usuario.usuario) || "";

    ["claveActual", "claveNueva", "claveRepetir"].forEach((id) => { $(id).value = ""; });

    $("claveError").textContent = "";

    $("claveOverlay").hidden = false;

    setTimeout(() => (forzado ? $("claveNueva") : $("claveActual")).focus(), 50);

}

async function guardarCambioClave(e) {

    e.preventDefault();

    const actual = $("claveActual").value;

    const nueva = $("claveNueva").value;

    if (nueva.trim().length < 6) { $("claveError").textContent = "La contraseña nueva debe tener al menos 6 caracteres."; return; }

    if (nueva !== $("claveRepetir").value) { $("claveError").textContent = "Las dos contraseñas nuevas no coinciden."; return; }

    const avisos = avisosCodigo(nueva, estado.usuario ? estado.usuario.nombre : "");

    const boton = $("claveBoton");

    boton.disabled = true;

    boton.textContent = "Guardando…";

    try {

        await api("cambiarClave", { actual, nueva });

        if (estado.usuario) estado.usuario.cambiarClave = false;

        $("claveOverlay").hidden = true;

        mostrarToast(avisos.length ? "✅ Contraseña guardada (es algo débil: " + avisos[0] + ")" : "✅ Contraseña guardada");

        if (estado.claveForzada) actualizarTodo();

    } catch (err) {

        if (err instanceof ErrorPin) { $("claveOverlay").hidden = true; manejarError(err); return; }

        $("claveError").textContent = err.message || "No se pudo guardar. Inténtalo otra vez.";

    } finally {

        boton.disabled = false;

        boton.textContent = "Guardar contraseña";

    }

}

const PALABRAS_CODIGO = [
    "gato", "luna", "mar", "rio", "cielo", "nube", "fuego", "tigre", "lima", "cafe",
    "pizza", "azul", "verde", "rojo", "roble", "jazmin", "trueno", "coral", "pluma", "tango",
    "cobre", "mango", "limon", "piedra", "viento", "nieve", "perla", "ambar", "roca", "sol"
];

const CODIGOS_COMUNES = ["12345678", "123456789", "1234567890", "password", "contrasena", "qwerty123", "abc12345", "11111111", "00000000"];

function sugerirCodigo() {

    const n = new Uint32Array(3);

    crypto.getRandomValues(n);

    return [...n].map((x) => PALABRAS_CODIGO[x % PALABRAS_CODIGO.length]).join("-");

}

// Solo avisa; nunca impide guardar
function avisosCodigo(codigo, nombre) {

    const c = String(codigo || "").trim();

    if (!c) return [];

    const avisos = [];

    if (c.length < 8) avisos.push("tiene menos de 8 caracteres");

    if (/^\d+$/.test(c)) avisos.push("son solo números");

    if (/^(.)\1+$/.test(c)) avisos.push("repite el mismo carácter");

    if (CODIGOS_COMUNES.includes(c.toLowerCase())) avisos.push("es muy común");

    const nom = sinTildes(nombre).replace(/[^a-z0-9]/g, "");

    if (nom.length >= 3 && sinTildes(c).replace(/[^a-z0-9]/g, "") === nom) avisos.push("es igual al nombre");

    return avisos;

}

function diasPara(textoFecha) {

    const f = parseFecha(textoFecha);

    if (!f) return null;

    const hoy = new Date();

    const a = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    return Math.round((f - a) / 86400000);

}

function textoVence(p) {

    if (!p.pagado) return { texto: "Sin fecha de pago", clase: "" };

    const n = diasPara(p.pagado);

    if (n === null) return { texto: "Pagado hasta " + p.pagado, clase: "" };

    if (n > 1) return { texto: `Pagado hasta ${p.pagado} · vence en ${n} días`, clase: n <= 5 ? "pronto" : "" };

    if (n === 1) return { texto: `Pagado hasta ${p.pagado} · vence mañana`, clase: "pronto" };

    if (n === 0) return { texto: `Pagado hasta ${p.pagado} · vence hoy`, clase: "pronto" };

    return { texto: `Pagado hasta ${p.pagado} · venció hace ${-n} ${-n === 1 ? "día" : "días"}`, clase: "vencido" };

}

function urlApp() {

    return location.origin + location.pathname;

}

function mensajeAcceso(nombre, usuario, clave) {

    return clave
        ? `Hola ${nombre} 👋\nAquí está tu acceso a Finanzas IA:\n${urlApp()}\nUsuario: ${usuario}\nContraseña temporal: ${clave}\nAl entrar te pedirá crear tu propia contraseña 🔑`
        : `Hola ${nombre} 👋\nAquí está tu acceso a Finanzas IA:\n${urlApp()}\nTu usuario: ${usuario}\nTu contraseña es la que tú creaste.`;

}

const NOMBRES_TEMPLATES = { noche: "Noche", iridiscente: "Iridiscente", atardecer: "Atardecer", vidrio: "Vidrio", neon: "Neón" };

async function copiarTexto(texto) {

    try {

        await navigator.clipboard.writeText(texto);

        return true;

    } catch (e) {

        try {

            const t = document.createElement("textarea");

            t.value = texto;

            t.style.position = "fixed";

            t.style.opacity = "0";

            document.body.appendChild(t);

            t.select();

            const ok = document.execCommand("copy");

            t.remove();

            return ok;

        } catch (e2) { return false; }

    }

}

function htmlPersona(p) {

    const bloqueada = p.estado.toLowerCase() === "bloqueada";

    const v = textoVence(p);

    const ed = estado.adminEdicion && estado.adminEdicion.hoja === p.hoja ? estado.adminEdicion : null;

    const base = estado.templatesBase || [];

    let editor = "";

    if (ed && ed.campo === "nombre") {

        editor = `
            <div class="persona-edit">
                <input type="text" data-campo="nombre" maxlength="40" value="${esc(p.nombre)}" placeholder="Ej: Patricia" aria-label="Nombre">
                <button type="button" class="mov-btn mov-btn-primario" data-persona-accion="guardar-nombre">Guardar</button>
                <button type="button" class="mov-btn" data-persona-accion="cancelar">Cancelar</button>
            </div>
            <p class="admin-aviso">Hoy la app le dice «Hola ${esc(p.nombre)}». Escribe cómo quieres que la salude.</p>`;

    } else if (ed && ed.campo === "usuario") {

        editor = `
            <div class="persona-edit">
                <input type="text" data-campo="usuario" maxlength="30" value="${esc(p.usuario)}" placeholder="Ej: maria.lopez" autocapitalize="none" aria-label="Usuario">
                <button type="button" class="mov-btn mov-btn-primario" data-persona-accion="guardar-usuario">Guardar</button>
                <button type="button" class="mov-btn" data-persona-accion="cancelar">Cancelar</button>
            </div>`;

    } else if (ed && ed.campo === "clave") {

        editor = `
            <div class="persona-edit">
                <input type="text" data-campo="clave" maxlength="60" placeholder="Contraseña temporal (mín. 6)" aria-label="Contraseña temporal">
                <button type="button" class="mov-btn" data-persona-accion="sugerir">Sugerir</button>
                <button type="button" class="mov-btn mov-btn-primario" data-persona-accion="guardar-clave">Guardar</button>
                <button type="button" class="mov-btn" data-persona-accion="cancelar">Cancelar</button>
            </div>
            <p class="admin-aviso" data-aviso-persona>Al guardarla se cierra su sesión y al entrar tendrá que crear su propia contraseña.</p>`;

    } else if (ed && ed.campo === "templates") {

        const extra = (estado.templatesTodos || []).filter((t) => !base.includes(t));

        editor = `
            <div class="persona-edit">
                <div class="tpl-chips">
                    ${extra.map((t) => `<label class="tpl-chip"><input type="checkbox" data-tpl="${esc(t)}" ${p.templates.includes(t) ? "checked" : ""}> ${esc(NOMBRES_TEMPLATES[t] || t)}</label>`).join("") || "<span>No hay estilos de pago todavía.</span>"}
                </div>
                <button type="button" class="mov-btn mov-btn-primario" data-persona-accion="guardar-templates">Guardar</button>
                <button type="button" class="mov-btn" data-persona-accion="cancelar">Cancelar</button>
            </div>`;

    } else if (ed && ed.campo === "fecha") {

        const f = parseFecha(p.pagado);

        const iso = f ? f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0") : "";

        editor = `
            <div class="persona-edit">
                <input type="date" data-campo="fecha" value="${iso}" aria-label="Pagado hasta">
                <button type="button" class="mov-btn mov-btn-primario" data-persona-accion="guardar-fecha">Guardar</button>
                <button type="button" class="mov-btn" data-persona-accion="cancelar">Cancelar</button>
            </div>`;

    }

    const acceso = p.usuario
        ? `<span>Usuario: <span class="persona-usuario">@${esc(p.usuario)}</span>${p.cambiarClave ? ' · <span class="persona-aviso">aún no crea su contraseña</span>' : (p.tieneClave ? "" : ' · <span class="persona-aviso">entra con su código hasta su primer ingreso</span>')}</span>`
        : `<span class="persona-aviso">Sin usuario · entra con el código <code>${esc(p.codigo)}</code></span>`;

    const premium = p.templates.filter((t) => !base.includes(t));

    return `
        <div class="persona ${bloqueada ? "persona-bloqueada" : ""}" data-hoja="${esc(p.hoja)}">

            <div class="persona-cab">
                <strong>${esc(p.nombre)}</strong>
                <span class="persona-estado ${bloqueada ? "bloqueada" : "activa"}">${bloqueada ? "Bloqueada" : "Activa"}</span>
            </div>

            <div class="persona-datos">
                ${acceso}
                <span class="${v.clase}">${esc(v.texto)}</span>
                <span>Estilos de pago: ${premium.length ? `<span class="tpl-lista">${premium.map((t) => `<span class="tpl-tag premium">${esc(NOMBRES_TEMPLATES[t] || t)}</span>`).join("")}</span>` : "ninguno"}</span>
            </div>

            ${editor}

            <div class="persona-acciones">
                ${p.usuario ? '<button type="button" class="mov-btn" data-persona-accion="copiar">📋 Copiar mensaje</button>' : ""}
                <button type="button" class="mov-btn ${bloqueada ? "" : "mov-btn-borrar"}" data-persona-accion="estado">${bloqueada ? "Activar" : "Bloquear"}</button>
                <button type="button" class="mov-btn" data-persona-accion="nombre">Cambiar nombre</button>
                <button type="button" class="mov-btn" data-persona-accion="usuario">${p.usuario ? "Cambiar usuario" : "Ponerle usuario"}</button>
                ${p.usuario ? '<button type="button" class="mov-btn" data-persona-accion="clave">Nueva contraseña</button>' : ""}
                <button type="button" class="mov-btn" data-persona-accion="templates">Estilos</button>
                <button type="button" class="mov-btn" data-persona-accion="fecha">Pagado hasta</button>
                <a class="mov-btn" href="${esc(p.enlace)}" target="_blank" rel="noopener">Abrir hoja</a>
            </div>

        </div>
    `;

}

function renderPersonas() {

    const lista = estado.personas;

    $("adminResumen").textContent = lista.length
        ? `${lista.length} ${lista.length === 1 ? "persona" : "personas"} con acceso · ${lista.filter((p) => p.estado.toLowerCase() !== "bloqueada").length} activas`
        : "Las personas que tienen acceso a la app.";

    $("adminLista").innerHTML = lista.length
        ? lista.map(htmlPersona).join("")
        : vacioGuia("👥", "Aún no le diste acceso a nadie",
            "Crea el primer acceso abajo: escribe su nombre y un código, y mándaselo por WhatsApp.");

}

async function cargarPersonas() {

    try {

        const data = await api("admin_listar");

        estado.personas = (data.personas || []).map((p) => ({ ...p, templates: p.templates || [] }));

        estado.templatesTodos = data.templates || [];

        estado.templatesBase = data.base || [];

        renderPersonas();

    } catch (e) {

        if (e instanceof ErrorPin) { manejarError(e); return; }

        console.error(e);

        $("adminLista").innerHTML = '<p class="vacio">No se pudo cargar la lista. Inténtalo otra vez.</p>';

    }

}

function actualizarAvisoCodigo() {

    const avisos = avisosCodigo($("adminClave").value, $("adminNombre").value);

    $("adminAviso").textContent = avisos.length
        ? "⚠️ Contraseña débil: " + avisos.join(", ") + ". Igual es temporal: al entrar creará la suya."
        : "";

}

async function crearPersona(e) {

    e.preventDefault();

    const nombre = $("adminNombre").value.trim();

    const usuario = $("adminUsuario").value.trim().toLowerCase();

    const clave = $("adminClave").value.trim();

    if (!nombre || !usuario || !clave) return;

    const boton = $("adminCrear");

    boton.disabled = true;

    boton.textContent = "Creando…";

    try {

        await api("admin_crear", { nombre, usuario, clave, pagado: $("adminPagado").value });

        $("adminListoTitulo").textContent = "✅ Acceso creado para " + nombre;

        $("adminListoTexto").value = mensajeAcceso(nombre, usuario, clave);

        $("adminListo").hidden = false;

        $("adminForm").reset();

        $("adminAviso").textContent = "";

        await cargarPersonas();

    } catch (err) {

        if (err instanceof ErrorPin) { manejarError(err); return; }

        mostrarToast("❌ " + (err.message || "No se pudo crear el acceso"));

    } finally {

        boton.disabled = false;

        boton.textContent = "Crear acceso";

    }

}

async function accionPersona(boton) {

    const tarjeta = boton.closest(".persona");

    if (!tarjeta) return;

    const hoja = tarjeta.dataset.hoja;

    const persona = estado.personas.find((p) => p.hoja === hoja);

    if (!persona) return;

    const accion = boton.dataset.personaAccion;

    try {

        if (accion === "copiar") {

            const ok = await copiarTexto(mensajeAcceso(persona.nombre, persona.usuario, ""));

            mostrarToast(ok ? "📋 Mensaje copiado" : "No se pudo copiar");

            return;

        }

        if (accion === "estado") {

            const bloquear = persona.estado.toLowerCase() !== "bloqueada";

            // Bloquear pide un segundo toque para evitar errores
            if (bloquear && boton.dataset.confirmar !== "1") {

                boton.dataset.confirmar = "1";

                boton.textContent = "¿Seguro? Toca otra vez";

                setTimeout(() => { if (boton.isConnected) { boton.dataset.confirmar = ""; boton.textContent = "Bloquear"; } }, 3000);

                return;

            }

            await api("admin_estado", { hoja, estado: bloquear ? "Bloqueada" : "Activa" });

            mostrarToast(bloquear ? "🔒 " + persona.nombre + " bloqueada" : "✅ " + persona.nombre + " activada");

            await cargarPersonas();

            return;

        }

        if (accion === "guardar-nombre") {

            const nombre = tarjeta.querySelector("[data-campo=nombre]").value.trim();

            if (!nombre) { mostrarToast("✍️ Escribe el nombre"); return; }

            await api("admin_nombre", { hoja, nombre });

            estado.adminEdicion = null;

            mostrarToast(`✅ Listo: ahora le dice «Hola ${nombre}»`);

            await cargarPersonas();

            return;

        }

        if (accion === "nombre" || accion === "usuario" || accion === "clave" || accion === "templates" || accion === "fecha") {

            estado.adminEdicion = { hoja, campo: accion };

            renderPersonas();

            return;

        }

        if (accion === "cancelar") {

            estado.adminEdicion = null;

            renderPersonas();

            return;

        }

        if (accion === "sugerir") {

            const campo = tarjeta.querySelector("[data-campo=clave]");

            campo.value = sugerirCodigo();

            campo.dispatchEvent(new Event("input", { bubbles: true }));

            return;

        }

        if (accion === "guardar-usuario") {

            const usuario = tarjeta.querySelector("[data-campo=usuario]").value.trim().toLowerCase();

            await api("admin_usuario", { hoja, usuario });

            estado.adminEdicion = null;

            mostrarToast(persona.tieneClave || persona.usuario
                ? "✅ Usuario cambiado"
                : "✅ Listo: " + persona.nombre + " entra con @" + usuario + " y su código de siempre");

            await cargarPersonas();

            return;

        }

        if (accion === "guardar-clave") {

            const clave = tarjeta.querySelector("[data-campo=clave]").value.trim();

            await api("admin_clave", { hoja, clave });

            estado.adminEdicion = null;

            $("adminListoTitulo").textContent = "🔑 Contraseña temporal para " + persona.nombre;

            $("adminListoTexto").value = mensajeAcceso(persona.nombre, persona.usuario, clave);

            $("adminListo").hidden = false;

            mostrarToast("✅ Contraseña temporal guardada");

            await cargarPersonas();

            return;

        }

        if (accion === "guardar-templates") {

            const templates = [...tarjeta.querySelectorAll("[data-tpl]")].filter((c) => c.checked).map((c) => c.dataset.tpl);

            await api("admin_templates", { hoja, templates });

            estado.adminEdicion = null;

            mostrarToast("✅ Estilos de " + persona.nombre + " actualizados");

            await cargarPersonas();

            return;

        }

        if (accion === "guardar-fecha") {

            await api("admin_fecha", { hoja, pagado: tarjeta.querySelector("[data-campo=fecha]").value });

            estado.adminEdicion = null;

            mostrarToast("✅ Fecha guardada");

            await cargarPersonas();

        }

    } catch (e) {

        if (e instanceof ErrorPin) { manejarError(e); return; }

        mostrarToast("❌ " + (e.message || "No se pudo completar"));

    }

}
