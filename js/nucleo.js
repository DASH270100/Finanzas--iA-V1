// Finanzas IA · nucleo.js — Núcleo: configuración, utilidades, fechas, sesión, API, caché y estilos
// Se cargan en orden: nucleo → cuenta → inicio → secciones → registro → eventos (comparten el mismo ámbito global).
"use strict";

// Finanzas IA - Script v5.4 (multi-usuario + estilos + tarjetas + ingresos fijos)
// Backend: Google Apps Script. Cada persona entra con su código y usa su propia hoja.

// =========================
// CONFIGURACIÓN
// =========================

const API_URL =
    "https://script.google.com/macros/s/AKfycbyfEWrjGVOfzTpDpLri3TFVsgeU9cxBVBmQDE1JJHCIO50gqsjXTy7-4k5G9YYiPawWsA/exec";

const PIN_KEY = "finanzasia_pin";

// Último usuario que entró en este dispositivo (solo el nombre de usuario, nunca la contraseña)
const USUARIO_KEY = "finanzasia_usuario";

const CACHE_KEY = "finanzasia_cache";

const MAX_CARACTERES = 500;

const $ = (id) => document.getElementById(id);

const estado = {
    movimientos: [],
    deudas: [],
    dashboard: [],
    ciclo: null,
    mesInicio: null,
    mes: null,
    mostrarTodasLasDeudas: false,
    editando: null,
    presupuestos: [],
    chat: [],
    pensando: false,
    fijos: [],
    metas: [],
    tarjetas: [],
    porCobrar: [],
    usuario: null,
    personas: [],
    adminEdicion: null
};

const ICONOS = {
    comida: "🍔",
    bebidas: "🥤",
    transporte: "🚕",
    sueldo: "💼",
    salud: "🏥",
    entretenimiento: "🎮",
    gaming: "🎮",
    compras: "🛍️",
    hogar: "🏠",
    ropa: "👕",
    intereses: "😬",
    otros: "📦"
};

// =========================
// UTILIDADES
// =========================

const formatoMonto = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const numero = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const money = (n) => "S/ " + formatoMonto.format(numero(n));

// Evita que texto de la hoja se ejecute como HTML
function esc(valor) {

    const mapa = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

    return String(valor ?? "").replace(/[&<>"']/g, (c) => mapa[c]);

}

const dormir = (ms) => new Promise((res) => setTimeout(res, ms));

const esIngreso = (m) => m.tipo.toLowerCase() === "ingreso";

const esGasto = (m) => m.tipo.toLowerCase() === "gasto";

// Un préstamo se registra como "Gasto", pero no es un gasto real: es plata que te deben
const esPrestamo = (m) =>
    esGasto(m) && !esCuota(m) && /pr[eé]stamo/i.test(m.categoria + " " + m.descripcion);

// Pagar la cuota de un préstamo que tú debes: es un gasto real (sale plata de tu bolsillo)
const esCuota = (m) =>
    esGasto(m) && String(m.categoria).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "cuotas";

// Un reembolso se registra como "Ingreso", pero no es un ingreso real: es plata que te devuelven
const esReembolso = (m) =>
    esIngreso(m) && /reembolso|devoluci[oó]n/i.test(m.categoria + " " + m.descripcion);

// Pagar la tarjeta no es un gasto nuevo: las compras ya se contaron cuando las hiciste
const esPagoTarjeta = (m) =>
    esGasto(m) && String(m.categoria).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "pago de tarjeta";

// Interés que te cobra el banco: es un gasto real y se suma a lo que debes en esa tarjeta
const esInteres = (m) =>
    esGasto(m) && String(m.categoria).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "intereses";

const esGastoReal = (m) => esGasto(m) && !esPrestamo(m) && !esPagoTarjeta(m);

const esIngresoReal = (m) => esIngreso(m) && !esReembolso(m);

let toastTimer = null;

function mostrarToast(mensaje) {

    $("toastTexto").textContent = mensaje;

    $("toast").classList.add("mostrar");

    clearTimeout(toastTimer);

    // Más tiempo si el texto es largo; los errores se quedan hasta tocarlos (o 15 s)
    const esError = /^(❌|⚠️)/.test(String(mensaje));

    $("toast").classList.toggle("toast-error", esError);

    const ms = esError ? 15000 : Math.min(9000, Math.max(3000, String(mensaje).length * 55));

    toastTimer = setTimeout(() => {

        $("toast").classList.remove("mostrar");

    }, ms);

}

function animar(selector) {

    document.querySelectorAll(selector).forEach((el) => {

        el.classList.remove("actualizando");

        void el.offsetWidth;

        el.classList.add("actualizando");

        setTimeout(() => el.classList.remove("actualizando"), 500);

    });

}

// =========================
// FECHAS
// =========================

// Acepta "02/07/2026", "\"02/07/2026\"", "29-08-2026" y "2026-07-01T05:00:00.000Z"
function parseFecha(valor) {

    if (valor === null || valor === undefined || valor === "") return null;

    const t = String(valor).replace(/"/g, "").trim();

    const m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);

    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

    if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {

        const d = new Date(t);

        return isNaN(d.getTime()) ? null : d;

    }

    return null;

}

function formatearFecha(fecha, original) {

    if (!fecha) return original ? String(original).replace(/"/g, "") : "";

    const hoy = new Date();

    const ayer = new Date();

    ayer.setDate(hoy.getDate() - 1);

    const igual = (a, b) =>
        a.getDate() === b.getDate() &&
        a.getMonth() === b.getMonth() &&
        a.getFullYear() === b.getFullYear();

    if (igual(fecha, hoy)) return "Hoy";

    if (igual(fecha, ayer)) return "Ayer";

    return fecha.toLocaleDateString("es-PE", { day: "numeric", month: "short" });

}

const claveMes = (d) =>
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");

function nombreMes(clave) {

    const [y, m] = clave.split("-").map(Number);

    const t = new Date(y, m - 1, 1).toLocaleDateString("es-PE", {
        month: "long",
        year: "numeric"
    });

    return t.charAt(0).toUpperCase() + t.slice(1);

}

// =========================
// PIN
// =========================

function leerPin() {
    try { return localStorage.getItem(PIN_KEY) || ""; } catch (e) { return ""; }
}

function guardarPin(pin) {
    try { localStorage.setItem(PIN_KEY, pin); } catch (e) { /* sin almacenamiento */ }
}

function borrarPin() {
    try {
        localStorage.removeItem(PIN_KEY);
        localStorage.removeItem(CACHE_KEY); // al bloquear no queda ningún dato guardado

        // Los estilos especiales son de la cuenta, no del dispositivo
        Object.keys(TEMAS).filter(esEspecial).forEach((t) => localStorage.removeItem(cssKey(t)));

        if (esEspecial(localStorage.getItem(TEMA_KEY))) localStorage.setItem(TEMA_KEY, "noche");
    } catch (e) { /* sin almacenamiento */ }
}

// Última copia de los datos, para mostrarla al instante mientras Google responde
function guardarCache(data) {
    if (modoDemo) return; // los datos de la demo nunca se guardan
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* sin almacenamiento */ }
}

function leerCache() {
    try {
        const t = localStorage.getItem(CACHE_KEY);
        return t ? JSON.parse(t) : null;
    } catch (e) { return null; }
}

function pedirPin(mensaje = "") {

    $("pinOverlay").hidden = false;

    $("pinError").textContent = mensaje;

    $("pinInput").value = "";

    let ultimo = "";

    try { ultimo = localStorage.getItem(USUARIO_KEY) || ""; } catch (e) { /* sin almacenamiento */ }

    if (ultimo && !$("pinUsuario").value) $("pinUsuario").value = ultimo;

    setTimeout(() => ($("pinUsuario").value ? $("pinInput") : $("pinUsuario")).focus(), 50);

}

class ErrorPin extends Error {}

// El administrador pausó el acceso de esta persona
class ErrorPausa extends ErrorPin {}

// La persona entró con una contraseña temporal y tiene que crear la suya
class ErrorCambiarClave extends Error {}

const MENSAJE_PAUSA = "Tu acceso está pausado. Escríbele a Diego para reactivarlo.";

// Modo demo: la app funciona con un "Sheet" de mentira en memoria (demo.js). No toca tu hoja.
let modoDemo = false;

// =========================
// API (Google Apps Script)
// =========================

// Se envía como text/plain para evitar preflight de CORS con Apps Script
async function api(accion, extra = {}, pin = leerPin()) {

    if (modoDemo) {

        const falsa = await DemoBackend.llamar(accion, extra);

        if (!falsa.ok) throw new Error(falsa.error || "Error desconocido");

        return falsa;

    }

    // Las acciones que cambian algo piden los datos actualizados en la misma respuesta (una llamada en vez de dos)
    const conDatos = !SIN_DATOS.has(accion) && !accion.startsWith("admin_");

    const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ accion, pin, ...extra, ...(conDatos ? { conDatos: true } : {}) })
    });

    if (!r.ok) throw new Error("Error de red (" + r.status + ")");

    const data = await r.json();

    if (!data.ok) {

        if (data.error === "ACCESO_PAUSADO") throw new ErrorPausa(data.error);

        if (data.error === "PIN incorrecto") throw new ErrorPin(data.error);

        if (data.error === "CAMBIAR_CLAVE") throw new ErrorCambiarClave(data.error);

        throw new Error(data.error || "Error desconocido");

    }

    if (conDatos && data.datos && data.datos.ok) {

        aplicarDatos(data.datos);

        guardarCache(data.datos);

        ultimaCarga = Date.now();

        datosFrescos = Date.now();

    }

    return data;

}

const SIN_DATOS = new Set(["leer", "login", "preguntar", "estilo", "transcribir", "tipoCambio", "analizar",
    "misSugerencias", "sugerenciasVistas", "push", "avisoPush", "cambiarClave", "salir", "error",
    "agregar", "miNombre"]);   // "agregar" ya se muestra al instante y recarga al final (si no, se pisarían dos registros seguidos)

let datosFrescos = 0;

function sinEncabezado(filas, primeraCelda) {

    if (filas.length && String(filas[0][0] ?? "").trim().toLowerCase() === primeraCelda) {

        return filas.slice(1);

    }

    return filas;

}

function normalizarDatos(data) {

    // "fila" es el número de fila en la hoja Movimientos (la 1 es el encabezado)
    const movimientos = (data.movimientos || [])
        .map((f, idx) => ({
            idx,
            fila: idx + 1,
            fechaTexto: String(f[0] ?? "").replace(/"/g, "").trim(),
            fecha: parseFecha(f[0]),
            tipo: String(f[1] ?? "").trim(),
            categoria: String(f[2] ?? "").trim(),
            descripcion: String(f[3] ?? "").trim(),
            monto: numero(f[4]),
            medio: String(f[7] ?? "").trim(),
            inicioCiclo: String(f[8] ?? "").trim().toLowerCase() === "inicio"
        }))
        .filter((m) =>
            (m.fechaTexto !== "" || m.descripcion !== "") &&
            m.fechaTexto.toLowerCase() !== "fecha"
        );

    // "fila" es el número de fila en la hoja Deudas (la 1 es el encabezado)
    const deudas = (data.deudas || [])
        .map((f, i) => ({
            fila: i + 1,
            persona: String(f[0] ?? "").trim(),
            fechaTexto: String(f[1] ?? "").replace(/"/g, "").trim(),
            fecha: parseFecha(f[1]),
            monto: numero(f[2]),
            estado: String(f[3] ?? "").trim()
        }))
        .filter((d) => d.persona !== "" && d.persona.toLowerCase() !== "persona");

    // Presupuestos: [Categoría, Límite]
    const presupuestos = (data.presupuestos || [])
        .map((f) => ({
            categoria: nombreCategoria(f[0]),
            limite: numero(f[1])
        }))
        .filter((p) => String(p.categoria).toLowerCase() !== "categoría" && p.limite > 0);

    // Gastos fijos: [Nombre, Categoría, Monto, Día, Último registro]
    const fijos = (data.fijos || [])
        .map((f) => ({
            nombre: String(f[0] ?? "").trim(),
            categoria: String(f[1] ?? "").trim() || "Otros",
            monto: numero(f[2]),
            dia: Math.min(31, Math.max(1, Math.round(numero(f[3])) || 1)),
            ultimo: parseFecha(f[4]),
            tipo: String(f[5] ?? "").trim().toLowerCase() === "ingreso" ? "Ingreso"
                : String(f[5] ?? "").trim().toLowerCase() === "cuota" ? "Cuota" : "Gasto",
            cuotas: Math.round(numero(f[6])) || 0,
            pagadas: Math.round(numero(f[7])) || 0,
            tea: numero(f[8]) || 0,
            saldo: (f[9] === "" || f[9] == null) ? null : numero(f[9]),
            capital: numero(f[10]) || 0
        }))
        .filter((f) => f.nombre !== "" && f.nombre.toLowerCase() !== "nombre" && f.monto > 0);

    // Metas de ahorro: [Nombre, Objetivo, Ahorrado, Fecha límite]
    const metas = (data.metas || [])
        .map((f) => ({
            nombre: String(f[0] ?? "").trim(),
            objetivo: numero(f[1]),
            ahorrado: numero(f[2]),
            fecha: parseFecha(f[3])
        }))
        .filter((f) => f.nombre !== "" && f.nombre.toLowerCase() !== "nombre" && f.objetivo > 0);

    // Tarjetas de crédito: [Tarjeta, Presupuesto mensual]
    const tarjetas = (data.tarjetas || [])
        .map((f) => ({ nombre: String(f[0] ?? "").trim(), presupuesto: numero(f[1]), dia: Math.min(31, Math.max(0, Math.round(numero(f[2])))), proximo: parseFecha(f[3]) }))
        .filter((t) => t.nombre !== "" && t.nombre.toLowerCase() !== "tarjeta");

    // Por cobrar (freelance): [ID, Cliente, Trabajo, Monto, Fecha de cobro, Estado, Cobrado el, Creado]
    const porCobrar = (data.porCobrar || [])
        .map((f) => ({
            id: String(f[0] ?? "").trim(),
            cliente: String(f[1] ?? "").trim(),
            trabajo: String(f[2] ?? "").trim(),
            monto: numero(f[3]),
            fecha: parseFecha(f[4]),
            cobrado: String(f[5] ?? "").trim().toLowerCase() === "cobrado",
            cobradoEl: parseFecha(f[6]),
            creado: parseFecha(f[7])
        }))
        .filter((x) => x.id && x.id !== "ID" && x.cliente);

    return { movimientos, deudas, dashboard: data.dashboard || [], presupuestos, fijos, metas, tarjetas, porCobrar };

}

function aplicarDatos(data) {

    document.documentElement.classList.remove("cargando");

    estado.usuario = data.usuario || null;

    revisarTemas(data.catalogo);

    buzon.avisar(data.sugerencias);

    // Entró con una contraseña temporal: tiene que crear la suya antes de seguir
    if (estado.usuario && estado.usuario.cambiarClave && !modoDemo && $("claveOverlay") && $("claveOverlay").hidden) abrirCambioClave(true);

    const n = normalizarDatos(data);

    estado.movimientos = n.movimientos;

    estado.deudas = n.deudas;

    estado.dashboard = n.dashboard;

    estado.presupuestos = n.presupuestos;

    estado.fijos = n.fijos;

    estado.metas = n.metas;

    estado.tarjetas = n.tarjetas;

    estado.porCobrar = n.porCobrar;

    estado.compartido = data.compartido || { activo: null, recibidas: [], enviada: null };

    // Ciclo de sueldo: desde qué día cuenta el saldo (null = desde siempre)
    // Cuenta desde el sueldo marcado (por orden de registro); si lo borraron, desde su fecha
    const inicioCiclo = data.ciclo && parseFecha(data.ciclo.inicio);

    const ancla = n.movimientos.find((m) => m.inicioCiclo);

    estado.ciclo = inicioCiclo ? { inicio: ancla && ancla.fecha ? ancla.fecha : inicioCiclo, fila: ancla ? ancla.fila : null, sueldo: ancla || null } : null;

    if (window.__irAlBuzon && estado.usuario && estado.usuario.rol === "admin" && !modoDemo) {

        try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}

        setTimeout(() => mostrarVista("configuracion"), 0);

    }

}

// Enlace de las notificaciones: …/#buzon
window.__irAlBuzon = location.hash === "#buzon";

// Service worker: solo para las notificaciones
if ("serviceWorker" in navigator) {

    navigator.serviceWorker.register("sw.js").catch(() => {});

    // Tocaste una notificación con la app ya abierta: ve al buzón
    navigator.serviceWorker.addEventListener("message", (e) => {

        if (!e.data || e.data.tipo !== "abrirBuzon" || !estado.usuario || estado.usuario.rol !== "admin") return;

        window.__irAlBuzon = true;

        mostrarVista("configuracion");

    });

}

let ultimaCarga = 0;

async function cargarDatos() {

    // La acción de recién ya trajo todo actualizado: no hace falta pedirlo otra vez
    if (Date.now() - datosFrescos < 2500) { datosFrescos = 0; return; }

    const data = await api("leer");

    aplicarDatos(data);

    guardarCache(data);

    ultimaCarga = Date.now();

    if (colaOffline.pendientes()) setTimeout(() => colaOffline.enviar(), 500);

}

// =========================
// ESTILOS (APARIENCIA)
// =========================

const TEMA_KEY = "finanzas_tema";

const TEMAS = {
    noche: "#09111F",
    iridiscente: "#E9ECF3",
    atardecer: "#14103A",
    vidrio: "#0A0A14",
    // Especiales: su CSS lo entrega el Apps Script solo a quien los tiene
    neon: "#04050D",
    orbita: "#04050D",
    blackcard: "#0A0A0A",
    matcha: "#F3F0E6",
    cherry: "#FFE9EE",
    beige: "#F5F1EA",
    aurora: "#050507",
    chrome: "#04050C",
    rojo: "#ECE9E3"
};

// Los que tiene todo el mundo (su CSS está en la web)
const TEMAS_BASE = ["noche", "iridiscente", "atardecer", "vidrio"];

const WHATSAPP_DIEGO = "51987887558";

const cssKey = (t) => "finanzas_css_" + t;

const esEspecial = (t) => !!TEMAS[t] && !TEMAS_BASE.includes(t);

function puedeUsarTema(t) {

    if (TEMAS_BASE.includes(t)) return true;

    // Aún no se sabe quién es: vale si este dispositivo ya lo tenía descargado
    if (!estado.usuario) {
        try { return !!localStorage.getItem(cssKey(t)); } catch (e) { return false; }
    }

    return (estado.usuario.templates || []).includes(t);

}

function ponerCssEspecial(css) {

    let st = document.getElementById("estiloEspecial");

    if (!css) { if (st) st.remove(); return; }

    if (!st) {
        st = document.createElement("style");
        st.id = "estiloEspecial";
        document.head.appendChild(st);
    }

    if (st.textContent !== css) st.textContent = css;

}

// Descarga (o refresca) el CSS de un estilo especial desde el Apps Script
const estilosRefrescados = new Set();

async function descargarEstilo(tema) {

    if (modoDemo || !leerPin() || estilosRefrescados.has(tema)) return;

    estilosRefrescados.add(tema);

    try {

        const data = await api("estilo", { tema });

        try { localStorage.setItem(cssKey(tema), data.css); } catch (e) { /* sin almacenamiento */ }

        if (temaGuardado() === tema) ponerCssEspecial(data.css);

    } catch (e) {

        estilosRefrescados.delete(tema);

        if (e && e.message === "BLOQUEADO") {

            try { localStorage.removeItem(cssKey(tema)); } catch (e2) { /* sin almacenamiento */ }

            if (temaGuardado() === tema) aplicarTema("noche", true);

            return;

        }

        // Sin copia guardada no hay cómo mostrarlo: se avisa el motivo
        let guardado = "";

        try { guardado = localStorage.getItem(cssKey(tema)) || ""; } catch (e2) { /* sin almacenamiento */ }

        if (!guardado) mostrarToast("⚠️ No se pudo cargar el estilo: " + ((e && e.message) || "sin conexión"));

    }

}

// Con los datos de la persona ya cargados: revisa su estilo y arma la lista de especiales
function revisarTemas(catalogo) {

    if (modoDemo) { $("temasEspecialesBloque").hidden = true; return; }

    const actual = temaGuardado();

    if (esEspecial(actual)) {

        if (puedeUsarTema(actual)) descargarEstilo(actual);

        else {
            try { localStorage.removeItem(cssKey(actual)); } catch (e) { /* sin almacenamiento */ }
            aplicarTema("noche", true);
        }

    }

    renderTemasEspeciales(catalogo || []);

}

function renderTemasEspeciales(catalogo) {

    const caja = $("temasEspeciales");

    const lista = catalogo.filter((t) => TEMAS[t.id] || !t.tiene);

    vitrina.catalogo = lista;

    $("temasEspecialesBloque").hidden = lista.length === 0;

    caja.innerHTML = lista.map((t) => {

        const muestra = `<span class="tema-muestra ${TEMAS[t.id] ? "m-" + t.id : "m-especial"}"></span>`;

        if (t.tiene) {

            return `<button type="button" class="tema-opcion" role="radio" aria-checked="${temaGuardado() === t.id}" data-tema="${esc(t.id)}">
                ${muestra}
                <span>${esc(t.nombre)}<small>${esc(t.descripcion || "Tuyo ✨")}</small></span>
            </button>`;

        }

        // Bloqueado: se toca y se abre la vista previa con el precio y el botón de WhatsApp
        return `<button type="button" class="tema-candado" data-estilo="${esc(t.id)}">
            ${muestra}
            <span class="candado-badge"><svg class="ico" aria-hidden="true"><use href="#i-lock"></use></svg>${esc(t.precio || "De pago")}</span>
            <span>${esc(t.nombre)}<small>${esc(t.descripcion || "Estilo especial")}</small></span>
        </button>`;

    }).join("");

}

// Vista previa de un estilo de pago: captura, precio y pedido por WhatsApp
const vitrina = (() => {

    let catalogo = [];

    function abrir(id) {
        const t = catalogo.find((x) => x.id === id);
        if (!t) return;
        const usuario = (estado.usuario && estado.usuario.usuario) || "";
        const mensaje = `Hola Diego 👋 Quiero el estilo ${t.nombre} (${t.precio || "de pago"}) en Finanzas IA.${usuario ? " Mi usuario es @" + usuario + "." : ""}`;
        $("estiloImg").src = `previews/estilo-${t.id}.webp`;
        $("estiloImg").alt = `Así se ve Finanzas IA con el estilo ${t.nombre}`;
        $("estiloNombre").textContent = t.nombre;
        $("estiloDesc").textContent = t.descripcion || "";
        $("estiloPrecio").textContent = t.precio || "De pago";
        $("estiloComprar").href = `https://wa.me/${WHATSAPP_DIEGO}?text=${encodeURIComponent(mensaje)}`;
        $("estiloComprar").querySelector("span").textContent = `Lo quiero · ${t.precio || "por WhatsApp"}`;
        $("estiloOverlay").hidden = false;
        $("estiloCerrar").focus();
    }

    function cerrar() { $("estiloOverlay").hidden = true; }

    function iniciar() {
        $("temasEspeciales").addEventListener("click", (e) => {
            const b = e.target.closest(".tema-candado");
            if (b) abrir(b.dataset.estilo);
        });
        $("estiloCerrar").addEventListener("click", cerrar);
        $("estiloOverlay").addEventListener("click", (e) => { if (e.target === $("estiloOverlay")) cerrar(); });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("estiloOverlay").hidden) cerrar(); });
        // Si la imagen no está (estilo nuevo sin captura), se esconde el marco
        $("estiloImg").addEventListener("error", () => { $("estiloImg").closest(".estilo-telefono").hidden = true; });
        $("estiloImg").addEventListener("load", () => { $("estiloImg").closest(".estilo-telefono").hidden = false; });
    }

    return { iniciar, abrir, cerrar, set catalogo(c) { catalogo = c || []; } };

})();

function temaGuardado() {
    try {
        const t = localStorage.getItem(TEMA_KEY);
        return TEMAS[t] ? t : "noche";
    } catch (e) { return "noche"; }
}

function aplicarTema(tema, guardar) {

    if (!TEMAS[tema]) tema = "noche";

    // Un estilo especial solo se usa si la persona lo tiene
    if (esEspecial(tema) && !puedeUsarTema(tema)) {

        if (guardar) mostrarToast("🔒 Ese estilo no está desbloqueado en tu cuenta");

        tema = "noche";

    }

    if (esEspecial(tema)) {

        let css = "";

        try { css = localStorage.getItem(cssKey(tema)) || ""; } catch (e) { /* sin almacenamiento */ }

        ponerCssEspecial(css);

        if (!css || guardar) descargarEstilo(tema);

    } else {

        ponerCssEspecial("");

    }

    if (tema === "noche") document.documentElement.removeAttribute("data-tema");
    else document.documentElement.setAttribute("data-tema", tema);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", TEMAS[tema]);

    document.querySelectorAll(".tema-opcion").forEach((b) => {
        b.setAttribute("aria-checked", b.dataset.tema === tema ? "true" : "false");
    });

    // En los estilos nuevos la barra de escribir es de una línea: el ejemplo tiene que ser corto
    const caja = document.getElementById("mensaje");
    if (caja) {
        if (caja.dataset.phOriginal === undefined) caja.dataset.phOriginal = caja.placeholder;
        caja.placeholder = tema === "noche" ? caja.dataset.phOriginal : "almorcé 18 y un Monster 8";
    }

    if (guardar) {
        try { localStorage.setItem(TEMA_KEY, tema); } catch (e) { /* sin almacenamiento */ }
    }

    // Los gráficos toman sus colores del estilo: se dibujan otra vez
    if (guardar && typeof renderTodo === "function" && estado && estado.movimientos) {
        try { renderTodo(); } catch (e) { console.error(e); }
    }

}
