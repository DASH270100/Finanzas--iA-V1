// Finanzas IA - Script v4.7 (multi-usuario + estilos + tarjetas + ingresos fijos)
// Backend: Google Apps Script. Cada persona entra con su código y usa su propia hoja.
"use strict";

// =========================
// CONFIGURACIÓN
// =========================

const API_URL =
    "https://script.google.com/macros/s/AKfycbyfEWrjGVOfzTpDpLri3TFVsgeU9cxBVBmQDE1JJHCIO50gqsjXTy7-4k5G9YYiPawWsA/exec";

const PIN_KEY = "finanzasia_pin";

const CACHE_KEY = "finanzasia_cache";

const MAX_CARACTERES = 500;

const $ = (id) => document.getElementById(id);

const estado = {
    movimientos: [],
    deudas: [],
    dashboard: [],
    mes: null,
    mostrarTodasLasDeudas: false,
    editando: null,
    presupuestos: [],
    chat: [],
    pensando: false,
    fijos: [],
    metas: [],
    tarjetas: [],
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
    esGasto(m) && /pr[eé]stamo/i.test(m.categoria + " " + m.descripcion);

// Un reembolso se registra como "Ingreso", pero no es un ingreso real: es plata que te devuelven
const esReembolso = (m) =>
    esIngreso(m) && /reembolso|devoluci[oó]n/i.test(m.categoria + " " + m.descripcion);

// Pagar la tarjeta no es un gasto nuevo: las compras ya se contaron cuando las hiciste
const esPagoTarjeta = (m) =>
    esGasto(m) && String(m.categoria).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "pago de tarjeta";

const esGastoReal = (m) => esGasto(m) && !esPrestamo(m) && !esPagoTarjeta(m);

const esIngresoReal = (m) => esIngreso(m) && !esReembolso(m);

let toastTimer = null;

function mostrarToast(mensaje) {

    $("toastTexto").textContent = mensaje;

    $("toast").classList.add("mostrar");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {

        $("toast").classList.remove("mostrar");

    }, 3000);

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

    setTimeout(() => $("pinInput").focus(), 50);

}

class ErrorPin extends Error {}

// El administrador pausó el acceso de esta persona
class ErrorPausa extends ErrorPin {}

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

    const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ accion, pin, ...extra })
    });

    if (!r.ok) throw new Error("Error de red (" + r.status + ")");

    const data = await r.json();

    if (!data.ok) {

        if (data.error === "ACCESO_PAUSADO") throw new ErrorPausa(data.error);

        if (data.error === "PIN incorrecto") throw new ErrorPin(data.error);

        throw new Error(data.error || "Error desconocido");

    }

    return data;

}

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
            medio: String(f[7] ?? "").trim()
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
            tipo: String(f[5] ?? "").trim().toLowerCase() === "ingreso" ? "Ingreso" : "Gasto"
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
        .map((f) => ({ nombre: String(f[0] ?? "").trim(), presupuesto: numero(f[1]), dia: Math.min(31, Math.max(0, Math.round(numero(f[2])))) }))
        .filter((t) => t.nombre !== "" && t.nombre.toLowerCase() !== "tarjeta");

    return { movimientos, deudas, dashboard: data.dashboard || [], presupuestos, fijos, metas, tarjetas };

}

function aplicarDatos(data) {

    estado.usuario = data.usuario || null;

    const n = normalizarDatos(data);

    estado.movimientos = n.movimientos;

    estado.deudas = n.deudas;

    estado.dashboard = n.dashboard;

    estado.presupuestos = n.presupuestos;

    estado.fijos = n.fijos;

    estado.metas = n.metas;

    estado.tarjetas = n.tarjetas;

}

let ultimaCarga = 0;

async function cargarDatos() {

    const data = await api("leer");

    aplicarDatos(data);

    guardarCache(data);

    ultimaCarga = Date.now();

}

// =========================
// ESTILOS (APARIENCIA)
// =========================

const TEMA_KEY = "finanzas_tema";

const TEMAS = {
    noche: "#09111F",
    iridiscente: "#E9ECF3",
    atardecer: "#14103A"
};

function temaGuardado() {
    try {
        const t = localStorage.getItem(TEMA_KEY);
        return TEMAS[t] ? t : "noche";
    } catch (e) { return "noche"; }
}

function aplicarTema(tema, guardar) {

    if (!TEMAS[tema]) tema = "noche";

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

// =========================
// USUARIO Y ADMINISTRACIÓN
// =========================

const esAdmin = () => !modoDemo && !!estado.usuario && estado.usuario.rol === "admin";

function renderUsuario() {

    const u = estado.usuario;

    const titulo = document.querySelector(".header h1");

    // El administrador conserva su saludo de siempre; el resto ve su propio nombre
    if (titulo && u && u.rol !== "admin" && u.nombre) titulo.textContent = "Hola " + u.nombre;

    if (!$("vista-configuracion").hidden) renderConfig();

}

function renderConfig() {

    const visible = esAdmin();

    $("adminCard").hidden = !visible;

    if (visible) cargarPersonas();

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

function mensajeAcceso(nombre, codigo) {

    return `Hola ${nombre} 👋\nAquí está tu acceso a Finanzas IA:\n${urlApp()}\nTu código: ${codigo}\n(Guárdalo, es solo tuyo)`;

}

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

    let editor = "";

    if (ed && ed.campo === "codigo") {

        editor = `
            <div class="persona-edit">
                <input type="text" data-campo="codigo" maxlength="60" value="${esc(p.codigo)}" aria-label="Código nuevo">
                <button type="button" class="mov-btn" data-persona-accion="sugerir">Sugerir</button>
                <button type="button" class="mov-btn mov-btn-primario" data-persona-accion="guardar-codigo">Guardar</button>
                <button type="button" class="mov-btn" data-persona-accion="cancelar">Cancelar</button>
            </div>
            <p class="admin-aviso" data-aviso-persona></p>`;

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

    return `
        <div class="persona ${bloqueada ? "persona-bloqueada" : ""}" data-hoja="${esc(p.hoja)}">

            <div class="persona-cab">
                <strong>${esc(p.nombre)}</strong>
                <span class="persona-estado ${bloqueada ? "bloqueada" : "activa"}">${bloqueada ? "Bloqueada" : "Activa"}</span>
            </div>

            <div class="persona-datos">
                <span>Código: <code>${esc(p.codigo)}</code></span>
                <span class="${v.clase}">${esc(v.texto)}</span>
            </div>

            ${editor}

            <div class="persona-acciones">
                <button type="button" class="mov-btn" data-persona-accion="copiar">📋 Copiar mensaje</button>
                <button type="button" class="mov-btn ${bloqueada ? "" : "mov-btn-borrar"}" data-persona-accion="estado">${bloqueada ? "Activar" : "Bloquear"}</button>
                <button type="button" class="mov-btn" data-persona-accion="codigo">Cambiar código</button>
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

        estado.personas = data.personas || [];

        renderPersonas();

    } catch (e) {

        if (e instanceof ErrorPin) { manejarError(e); return; }

        console.error(e);

        $("adminLista").innerHTML = '<p class="vacio">No se pudo cargar la lista. Inténtalo otra vez.</p>';

    }

}

function actualizarAvisoCodigo() {

    const avisos = avisosCodigo($("adminCodigo").value, $("adminNombre").value);

    $("adminAviso").textContent = avisos.length
        ? "⚠️ Código débil: " + avisos.join(", ") + ". Se puede usar igual, pero es más fácil de adivinar."
        : "";

}

async function crearPersona(e) {

    e.preventDefault();

    const nombre = $("adminNombre").value.trim();

    const codigo = $("adminCodigo").value.trim();

    if (!nombre || !codigo) return;

    const boton = $("adminCrear");

    boton.disabled = true;

    boton.textContent = "Creando…";

    try {

        await api("admin_crear", { nombre, codigo, pagado: $("adminPagado").value });

        $("adminListoTitulo").textContent = "✅ Acceso creado para " + nombre;

        $("adminListoTexto").value = mensajeAcceso(nombre, codigo);

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

            const ok = await copiarTexto(mensajeAcceso(persona.nombre, persona.codigo));

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

        if (accion === "codigo" || accion === "fecha") {

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

            const campo = tarjeta.querySelector("[data-campo=codigo]");

            campo.value = sugerirCodigo();

            campo.dispatchEvent(new Event("input", { bubbles: true }));

            return;

        }

        if (accion === "guardar-codigo") {

            const codigo = tarjeta.querySelector("[data-campo=codigo]").value.trim();

            await api("admin_codigo", { hoja, codigo });

            estado.adminEdicion = null;

            mostrarToast("✅ Código cambiado");

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

// =========================
// DASHBOARD
// =========================

// Busca por etiqueta ("Ingresos", "Gastos", "Saldo"), no por posición de fila
function valorDashboard(etiqueta) {

    const fila = estado.dashboard.find(
        (f) => String(f[0] ?? "").trim().toLowerCase() === etiqueta
    );

    return fila ? numero(fila[1]) : 0;

}

function renderDashboard() {

    // Ingresos y gastos reales: sin préstamos ni reembolsos.
    // El saldo es todo lo que entró menos todo lo que salió (incluye préstamos y reembolsos),
    // calculado aquí desde Movimientos y no desde la hoja Dashboards.
    const hayMovimientos = estado.movimientos.length > 0;

    const ingresos = hayMovimientos
        ? sumar(estado.movimientos.filter(esIngresoReal))
        : valorDashboard("ingresos");

    const gastos = hayMovimientos
        ? sumar(estado.movimientos.filter(esGastoReal))
        : valorDashboard("gastos");

    $("ingresos").textContent = money(ingresos);

    $("gastos").textContent = money(gastos);

    const saldo = hayMovimientos
        ? sumar(estado.movimientos.filter(esIngreso)) - sumar(estado.movimientos.filter((m) => esGasto(m) && !esPagoTarjeta(m)))
        : valorDashboard("saldo");

    $("saldo").textContent = money(saldo);

    // Resumen grande de los estilos Iridiscente y Atardecer
    $("hsSaldo").textContent = money(saldo);
    $("hsIngresos").textContent = money(ingresos);
    $("hsGastos").textContent = money(gastos);

}

// =========================
// ACTIVIDAD RECIENTE
// =========================

function iconoDe(m) {

    if (esPrestamo(m) || esReembolso(m)) return "🤝";

    if (esPagoTarjeta(m)) return "💳";

    return ICONOS[m.categoria.toLowerCase()] || (esIngreso(m) ? "💵" : "📦");

}

// Pantalla vacía con guía: icono, título, explicación y (opcional) un ejemplo que se puede tocar
function vacioGuia(icono, titulo, texto, ejemplo) {

    return `
        <div class="vacio-guia">
            <div class="vacio-icono">${icono}</div>
            <strong>${esc(titulo)}</strong>
            <p>${esc(texto)}</p>
            ${ejemplo ? `<button type="button" class="chip-ejemplo" data-ejemplo="${esc(ejemplo)}">Probar: ${esc(ejemplo)}</button>` : ""}
        </div>
    `;

}

// La tarjeta de bienvenida solo aparece mientras no haya ningún movimiento
function renderBienvenida() {

    $("bienvenida").hidden = estado.movimientos.length > 0;

}

function renderActividad() {

    const recientes = [...estado.movimientos]
        .sort((a, b) =>
            ((b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0)) ||
            (b.idx - a.idx)
        )
        .slice(0, 5);

    if (!recientes.length) {

        $("actividad").innerHTML = vacioGuia(
            "📋", "Aún no hay movimientos",
            "Aquí verás tus últimos movimientos y podrás editarlos o borrarlos.",
            "almuerzo 15"
        );

        return;

    }

    const categorias = [...new Set(
        estado.movimientos.map((m) => m.categoria).filter(Boolean)
    )].sort();

    const opcionesCategorias = categorias
        .map((c) => `<option value="${esc(c)}"></option>`)
        .join("");

    $("actividad").innerHTML = recientes.map((m) =>
        estado.editando === m.fila ? formularioEdicion(m) : `
        <div class="movimiento" data-fila="${m.fila}">

            <div class="movimiento-superior">

                <div class="movimiento-nombre">
                    ${iconoDe(m)} ${esc(m.descripcion || m.categoria)}
                </div>

                <div class="movimiento-monto ${esIngreso(m) ? "ingreso" : "gasto"}">
                    ${esIngreso(m) ? "+" : "-"} ${money(m.monto)}
                </div>

            </div>

            <div class="movimiento-inferior">

                <span>${esc(m.categoria)}${m.medio ? ` · 💳 ${esc(m.medio)}` : ""}</span>

                <span>${esc(formatearFecha(m.fecha, m.fechaTexto))}</span>

            </div>

            <div class="movimiento-acciones">

                <button class="mov-btn" type="button" data-accion="editar"
                    aria-label="Editar movimiento">✏️ Editar</button>

                <button class="mov-btn mov-btn-borrar" type="button" data-accion="borrar"
                    aria-label="Borrar movimiento">🗑️ Borrar</button>

            </div>

        </div>
    `).join("") + `<datalist id="listaCategorias">${opcionesCategorias}</datalist>`;

}

function formularioEdicion(m) {

    return `
        <div class="movimiento mov-form" data-fila="${m.fila}">

            <label>Descripción
                <input data-campo="descripcion" type="text" maxlength="100"
                    value="${esc(m.descripcion)}">
            </label>

            <div class="mov-form-fila">

                <label>Categoría
                    <input data-campo="categoria" type="text" maxlength="40"
                        list="listaCategorias" value="${esc(m.categoria)}">
                </label>

                <label>Monto (S/)
                    <input data-campo="monto" type="number" step="0.01" min="0.01"
                        inputmode="decimal" value="${m.monto}">
                </label>

            </div>

            <label>Tipo
                <select data-campo="tipo">
                    <option value="Gasto" ${esGasto(m) ? "selected" : ""}>Gasto</option>
                    <option value="Ingreso" ${esIngreso(m) ? "selected" : ""}>Ingreso</option>
                </select>
            </label>

            <div class="mov-form-acciones">

                <button class="mov-btn" type="button" data-accion="cancelar">Cancelar</button>

                <button class="mov-btn mov-btn-primario" type="button" data-accion="guardar">Guardar</button>

            </div>

        </div>
    `;

}

// =========================
// GRÁFICO POR MES
// =========================

function gastosDelPeriodo(clave) {

    return estado.movimientos.filter((m) =>
        esGastoReal(m) &&
        (clave === "all" || (m.fecha && claveMes(m.fecha) === clave))
    );

}

const sumar = (lista) => lista.reduce((s, m) => s + m.monto, 0);

function actualizarSelectorMes() {

    const meses = new Set();

    estado.movimientos.forEach((m) => {
        if (m.fecha) meses.add(claveMes(m.fecha));
    });

    const actual = claveMes(new Date());

    meses.add(actual);

    const lista = [...meses].sort().reverse();

    if (!estado.mes || (estado.mes !== "all" && !meses.has(estado.mes))) {

        estado.mes = gastosDelPeriodo(actual).length
            ? actual
            : (lista.find((c) => gastosDelPeriodo(c).length) || actual);

    }

    const opciones =
        lista.map((c) => `<option value="${c}">${esc(nombreMes(c))}</option>`).join("") +
        '<option value="all">Todo el historial</option>';

    ["filtroMes", "filtroMesStats"].forEach((id) => {

        $(id).innerHTML = opciones;

        $(id).value = estado.mes;

    });

}

// Categorías destacadas (burbujas / tarjetas de los estilos nuevos)
function renderCatTiles(grupos) {

    const caja = $("catTiles");

    if (!caja) return;

    const top = grupos.slice(0, 5);

    caja.hidden = top.length === 0;

    caja.innerHTML = top.map((g, i) => `
        <div class="cat-tile c${i % 5}">
            <span class="ct-ico">${ICONOS[g.nombre.toLowerCase()] || "📦"}</span>
            <strong>S/ ${Math.round(g.total)}</strong>
            <small>${esc(g.nombre)}</small>
        </div>
    `).join("");

}

function renderResumenPeriodo() {

    const gastos = gastosDelPeriodo(estado.mes);

    const total = sumar(gastos);

    const grupos = renderGrafico(gastos);

    renderCatTiles(grupos);

    $("totalGastado").textContent = money(total);

    $("subtituloGrafico").textContent = estado.mes === "all"
        ? "Distribución de todos tus gastos"
        : "Distribución de tus gastos en " + nombreMes(estado.mes);

    if (!grupos.length) {

        $("insightTitulo").textContent = estado.movimientos.length
            ? "Sin gastos en este periodo"
            : "Tu análisis aparecerá aquí";

        $("insightTexto").textContent = estado.movimientos.length
            ? "Prueba con otro mes o registra un gasto."
            : "Registra tu primer gasto y te diré en qué se va tu plata.";

        return;

    }

    const top = grupos[0];

    const pct = total > 0 ? Math.round((top.total / total) * 100) : 0;

    let texto = `${money(top.total)} · ${pct}% de tus gastos`;

    if (estado.mes !== "all") {

        const [y, m] = estado.mes.split("-").map(Number);

        const previo = claveMes(new Date(y, m - 2, 1));

        const totalPrevio = sumar(gastosDelPeriodo(previo));

        if (totalPrevio > 0) {

            const dif = Math.round(((total - totalPrevio) / totalPrevio) * 100);

            texto += dif === 0
                ? ` · Igual que en ${nombreMes(previo)}`
                : ` · ${Math.abs(dif)}% ${dif > 0 ? "más" : "menos"} que en ${nombreMes(previo)}`;

        }

    }

    $("insightTitulo").textContent = `${top.nombre} es tu mayor gasto`;

    $("insightTexto").textContent = texto;

}

// =========================
// DEUDAS
// =========================

function renderDeudas() {

    const pendientes = estado.deudas.filter(
        (d) => d.estado.toLowerCase() === "pendiente"
    );

    const visibles = estado.mostrarTodasLasDeudas ? pendientes : pendientes.slice(0, 5);

    if (pendientes.length === 0) {

        $("contadorDeudas").textContent = "No tienes préstamos pendientes";

    } else {

        const etiqueta = pendientes.length === 1
            ? "1 préstamo pendiente"
            : `${pendientes.length} préstamos pendientes`;

        $("contadorDeudas").textContent = `${etiqueta} · ${money(sumar(pendientes))} en total`;

    }

    $("deudas").innerHTML = visibles.length
        ? visibles.map((d) => `
            <div class="deuda-card">

                <div class="deuda-persona">👤 ${esc(d.persona)}</div>

                <div class="deuda-monto">${money(d.monto)}</div>

                <div class="deuda-label">💸 Préstamo pendiente</div>

                <div class="deuda-fecha">📅 ${esc(formatearFecha(d.fecha, d.fechaTexto))}</div>

                <button
                    class="btn-deuda"
                    type="button"
                    data-fila="${d.fila}"
                    data-persona="${esc(d.persona)}"
                    data-monto="${d.monto}">✓ Pagado</button>

            </div>
        `).join("")
        : (estado.movimientos.length
            ? '<p class="vacio">🎉 No tienes deudas pendientes.</p>'
            : vacioGuia(
                "🤝", "Sin préstamos por ahora",
                "Si le prestas plata a alguien, escríbelo y quedará aquí hasta que te la devuelva.",
                "presté 50 a Juan"
            ));

    const toggle = $("toggleDeudas");

    if (pendientes.length > 5) {

        toggle.style.display = "inline-flex";

        toggle.textContent = estado.mostrarTodasLasDeudas
            ? "▲ Mostrar menos"
            : "▼ Ver todas las deudas";

    } else {

        toggle.style.display = "none";

    }

}

// =========================
// ESTADÍSTICAS
// =========================

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Ingresos por fuente: sueldo (fijo) vs freelance, ventas, etc. (variables) y cuánto puedes contar como base segura
const FUENTE_FIJA = /^(sueldo|salario|quincena|pension|pensión)$/i;

function renderIngresosFuente(periodo) {

    const caja = $("ingresosFuente");

    if (!caja) return;

    const [y, mm] = periodo.split("-").map(Number);

    const ingresosDe = (clave) => estado.movimientos.filter((m) =>
        esIngresoReal(m) && m.fecha && claveMes(m.fecha) === clave);

    const delMes = ingresosDe(periodo);

    // Últimos 3 meses (terminando en el periodo) con ingresos
    const totales = [];

    for (let i = 2; i >= 0; i--) {

        const d = new Date(y, mm - 1 - i, 1);

        totales.push({ clave: claveMes(d), total: sumar(ingresosDe(claveMes(d))) });

    }

    const conIngreso = totales.filter((t) => t.total > 0);

    if (!conIngreso.length) {

        caja.innerHTML = "";

        return;

    }

    const mapa = new Map();

    delMes.forEach((m) => {

        const c = nombreCategoria(m.categoria);

        mapa.set(c, (mapa.get(c) || 0) + m.monto);

    });

    const fuentes = [...mapa.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);

    const total = fuentes.reduce((t, f) => t + f.total, 0);

    const filas = fuentes.map((f) => {

        const pct = total > 0 ? Math.round(f.total / total * 100) : 0;

        const fija = FUENTE_FIJA.test(f.nombre);

        return `
            <div class="fuente-item">

                <div class="presupuesto-top">

                    <span class="presupuesto-nombre">${fija ? "🔒" : "🔀"} ${esc(f.nombre)}
                        <small class="fuente-tag">${fija ? "fijo" : "variable"}</small></span>

                    <span class="presupuesto-monto">${money(f.total)} · ${pct}%</span>

                </div>

                <div class="presupuesto-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">

                    <div class="presupuesto-progreso nivel-ok" style="width:${pct}%"></div>

                </div>

            </div>`;

    }).join("");

    const valores = conIngreso.map((t) => t.total);

    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;

    const minimo = Math.min(...valores);

    const maximo = Math.max(...valores);

    const varia = valores.length >= 2 && (maximo - minimo) / Math.max(1, maximo) > 0.15;

    const fijosTotal = estado.fijos.filter((f) => f.tipo === "Ingreso").reduce((t, f) => t + f.monto, 0);

    const notaFijos = fijosTotal > 0 ? `Tus ingresos fijos suman <strong>${money(fijosTotal)}</strong> al mes. ` : "";

    const nota = notaFijos + (varia
        ? `Tus ingresos cambian de mes a mes (de ${money(minimo)} a ${money(maximo)}). Para planificar, cuenta con <strong>${money(minimo)}</strong>: es tu mes más bajo.`
        : valores.length >= 2 ? "Tus ingresos están bastante parejos estos meses." : "Con 2 o 3 meses de datos te digo cuánto puedes contar como ingreso seguro.");

    caja.innerHTML = `
        <h4 class="fuente-titulo">Cómo se reparten tus ingresos</h4>

        <div class="fuentes">${filas}</div>

        <div class="fuente-resumen">

            <div class="stat-tile">
                <div class="stat-etiqueta">Promedio ${valores.length > 1 ? `de ${valores.length} meses` : "del mes"}</div>
                <div class="stat-valor">${money(promedio)}</div>
            </div>

            <div class="stat-tile">
                <div class="stat-etiqueta">Mes más bajo</div>
                <div class="stat-valor">${money(minimo)}</div>
            </div>

        </div>

        <p class="fuente-nota">${nota}</p>`;

}

function renderEstadisticas() {

    const hoy = new Date();

    const actual = claveMes(hoy);

    // Con "Todo el historial" las estadísticas usan el mes actual
    const periodo = (!estado.mes || estado.mes === "all") ? actual : estado.mes;

    const [y, mm] = periodo.split("-").map(Number);

    const esActual = periodo === actual;

    const diasMes = new Date(y, mm, 0).getDate();

    const diasTranscurridos = esActual ? hoy.getDate() : diasMes;

    const delPeriodo = (f) => estado.movimientos.filter((m) =>
        f(m) && m.fecha && claveMes(m.fecha) === periodo);

    const gastos = delPeriodo(esGastoReal);

    const ingresos = delPeriodo(esIngresoReal);

    const totalGastos = sumar(gastos);

    const totalIngresos = sumar(ingresos);

    renderIngresosFuente(periodo);

    $("subtituloEstadisticas").textContent = "Resumen de " + nombreMes(periodo) +
        ((!estado.mes || estado.mes === "all") ? " (mes actual)" : "");

    // Barras: últimos 6 meses terminando en el periodo elegido
    const meses = [];

    for (let i = 5; i >= 0; i--) {

        const d = new Date(y, mm - 1 - i, 1);

        const c = claveMes(d);

        const enMes = (f) => sumar(estado.movimientos.filter((m) =>
            f(m) && m.fecha && claveMes(m.fecha) === c));

        meses.push({
            etiqueta: d.toLocaleDateString("es-PE", { month: "short" }).replace(".", ""),
            ingresos: enMes(esIngresoReal),
            gastos: enMes(esGastoReal)
        });

    }

    if (!$("vista-estadisticas").hidden) renderBarrasMeses(meses);

    if (!gastos.length && !ingresos.length) {

        $("statTiles").innerHTML = estado.movimientos.length
            ? '<p class="vacio">Sin movimientos en este periodo.</p>'
            : vacioGuia(
                "📊", "Todavía no hay datos para mostrar",
                "Con unos cuantos movimientos verás aquí tus promedios, tu mayor gasto y cómo cambian mes a mes.",
                "taxi 10"
            );

        return;

    }

    const promedio = totalGastos / Math.max(1, diasTranscurridos);

    const proyeccion = promedio * diasMes;

    const mayor = gastos.reduce((a, b) => (b.monto > (a ? a.monto : 0) ? b : a), null);

    const porDia = new Array(7).fill(0);

    gastos.forEach((m) => { porDia[m.fecha.getDay()] += m.monto; });

    const maxDia = Math.max(...porDia);

    const diaCaro = maxDia > 0 ? DIAS_SEMANA[porDia.indexOf(maxDia)] : null;

    const ahorro = totalIngresos - totalGastos;

    const tiles = [
        {
            icono: "📅",
            etiqueta: "Promedio diario",
            valor: money(promedio),
            nota: `En ${diasTranscurridos} ${diasTranscurridos === 1 ? "día" : "días"}`
        },
        {
            icono: "🔮",
            etiqueta: esActual ? "Proyección a fin de mes" : "Total del mes",
            valor: money(esActual ? proyeccion : totalGastos),
            nota: esActual ? "Si sigues a este ritmo" : "Gastos reales del mes"
        },
        {
            icono: "💥",
            etiqueta: "Mayor gasto",
            valor: mayor ? money(mayor.monto) : "—",
            nota: mayor ? esc(mayor.descripcion || mayor.categoria) : "Sin gastos"
        },
        {
            icono: "🗓️",
            etiqueta: "Día que más gastas",
            valor: diaCaro ? diaCaro.charAt(0).toUpperCase() + diaCaro.slice(1) : "—",
            nota: diaCaro ? money(maxDia) + " en total" : "Sin gastos"
        },
        {
            icono: ahorro >= 0 ? "🐷" : "⚠️",
            etiqueta: ahorro >= 0 ? "Te sobró" : "Gastaste de más",
            valor: money(Math.abs(ahorro)),
            nota: `${money(totalIngresos)} de ingresos`
        }
    ];

    $("statTiles").innerHTML = tiles.map((t) => `
        <div class="stat-tile">
            <div class="stat-icono">${t.icono}</div>
            <div class="stat-etiqueta">${t.etiqueta}</div>
            <div class="stat-valor">${t.valor}</div>
            <div class="stat-nota">${t.nota}</div>
        </div>
    `).join("");

}

// =========================
// PESTAÑAS (Dashboard / Estadísticas)
// =========================

const VISTAS = ["dashboard", "estadisticas", "fijos", "asistente", "configuracion"];

function mostrarVista(nombre) {

    if (!VISTAS.includes(nombre)) nombre = "dashboard";

    VISTAS.forEach((v) => { $("vista-" + v).hidden = v !== nombre; });

    // Los estilos nuevos cambian la cabecera según la pestaña
    document.body.dataset.vista = nombre;

    const TITULOS = { estadisticas: "Estadísticas", fijos: "Planificar", asistente: "Asistente", configuracion: "Configuración" };

    $("tituloVista").textContent = TITULOS[nombre] || "";

    document.querySelectorAll("nav a[data-vista]").forEach((a) => {

        const activo = a.dataset.vista === nombre;

        a.classList.toggle("active", activo);

        if (activo) a.setAttribute("aria-current", "page");

        else a.removeAttribute("aria-current");

    });

    // Los gráficos se dibujan con la pestaña visible (si no, salen sin tamaño)
    if (nombre === "estadisticas") renderEstadisticas();

    else if (nombre === "dashboard") renderResumenPeriodo();

    else if (nombre === "asistente") renderChat();

    else if (nombre === "configuracion") renderConfig();

    window.scrollTo({ top: 0 });

}

function cambiarMes(valor) {

    estado.mes = valor;

    ["filtroMes", "filtroMesStats"].forEach((id) => { $(id).value = valor; });

    renderResumenPeriodo();

    renderEstadisticas();

    renderPresupuestos();

}

// =========================
// ASISTENTE IA (chat)
// =========================

// Texto seguro: escapa HTML y deja **negrita** y saltos de línea
function textoChat(t) {

    return esc(t)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");

}

function renderChat() {

    const caja = $("chat");

    if (!estado.chat.length && !estado.pensando) {

        caja.innerHTML = '<p class="vacio">Hazme una pregunta sobre tus finanzas 👇</p>';

        $("sugerencias").hidden = false;

        return;

    }

    $("sugerencias").hidden = estado.chat.length > 0;

    caja.innerHTML = estado.chat.map((m) => `
        <div class="burbuja ${m.rol === "usuario" ? "burbuja-yo" : "burbuja-ia"}${m.error ? " burbuja-error" : ""}">
            ${textoChat(m.texto)}
        </div>
    `).join("") + (estado.pensando
        ? '<div class="burbuja burbuja-ia burbuja-pensando">Pensando…</div>'
        : "");

    caja.scrollTop = caja.scrollHeight;

}

async function enviarPregunta(texto) {

    texto = texto.trim();

    if (!texto || estado.pensando) return;

    // Solo mandamos las respuestas buenas como contexto
    const historial = estado.chat
        .filter((m) => !m.error)
        .map((m) => ({ rol: m.rol, texto: m.texto }));

    estado.chat.push({ rol: "usuario", texto });

    estado.pensando = true;

    $("chatInput").value = "";

    $("chatBoton").disabled = true;

    renderChat();

    try {

        const data = await api("preguntar", { pregunta: texto, historial });

        estado.chat.push({ rol: "asistente", texto: data.respuesta });

    } catch (e) {

        if (e instanceof ErrorPin) {

            estado.pensando = false;

            manejarError(e);

            return;

        }

        console.error(e);

        estado.chat.push({
            rol: "asistente",
            texto: "⚠️ " + (e.message || "No pude responder ahora. Inténtalo otra vez."),
            error: true
        });

    } finally {

        estado.pensando = false;

        $("chatBoton").disabled = false;

        renderChat();

        $("chatInput").focus();

    }

}

// =========================
// GASTOS FIJOS
// =========================

const MS_DIA = 86400000;

const fechaCorta = (d) =>
    d.toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(".", "");

// Calcula cuándo se cobra y en qué estado está este mes
function infoFijo(f) {

    const hoy = new Date();

    const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    // Si el mes tiene menos días, se cobra el último día del mes
    const fechaEn = (y, m) => {

        const ultimoDia = new Date(y, m + 1, 0).getDate();

        return new Date(y, m, Math.min(f.dia, ultimoDia));

    };

    if (f.ultimo && claveMes(f.ultimo) === claveMes(hoy)) {

        const prox = fechaEn(h0.getFullYear(), h0.getMonth() + 1);

        return {
            estado: "hecho",
            texto: `Registrado este mes ✓ · próximo cobro: ${fechaCorta(prox)}`
        };

    }

    const cobro = fechaEn(h0.getFullYear(), h0.getMonth());

    const dias = Math.round((cobro - h0) / MS_DIA);

    if (dias < 0) {

        const n = -dias;

        return {
            estado: "vencido",
            dias: dias,
            texto: `Se cobró el ${fechaCorta(cobro)} · hace ${n} ${n === 1 ? "día" : "días"}, sin registrar`
        };

    }

    if (dias === 0) return { estado: "hoy", dias: 0, texto: `Se cobra hoy (${fechaCorta(cobro)})` };

    return {
        estado: dias <= 3 ? "pronto" : "futuro",
        dias: dias,
        texto: `Próximo cobro: ${fechaCorta(cobro)} · ${dias === 1 ? "mañana" : `en ${dias} días`}`
    };

}

function fijoHTML(f) {

    const ing = f.tipo === "Ingreso";

    return `
        <div class="fijo-item estado-${f.info.estado}" data-nombre="${esc(f.nombre)}" data-tipo="${f.tipo}"
            data-categoria="${esc(f.categoria)}" data-monto="${f.monto}" data-dia="${f.dia}">

            <div class="fijo-top">

                <span class="fijo-nombre">${ing ? "💼" : "🔁"} ${esc(f.nombre)}</span>

                <span class="fijo-monto">${ing ? "+ " : ""}${money(f.monto)}</span>

            </div>

            <div class="fijo-detalle">
                ${esc(f.categoria)} · ${ing ? "te pagan" : "se cobra"} el día ${f.dia} de cada mes
            </div>

            <div class="fijo-estado">${esc(f.info.texto)}</div>

            <div class="fijo-acciones">

                <button class="mov-btn mov-btn-primario" type="button" data-fijo="registrar"
                    ${f.info.estado === "hecho" ? "disabled" : ""}>
                    ${f.info.estado === "hecho" ? "✓ Registrado" : (ing ? "Ya me pagaron" : "Registrar ahora")}
                </button>

                <button class="mov-btn" type="button" data-fijo="editar">Cambiar</button>

                <button class="mov-btn mov-btn-borrar" type="button" data-fijo="quitar">Quitar</button>

            </div>

        </div>
    `;

}

function renderFijos() {

    const todos = estado.fijos
        .map((f) => ({ ...f, info: infoFijo(f) }))
        .sort((a, b) => a.dia - b.dia);

    const items = todos.filter((f) => f.tipo !== "Ingreso");

    const ingresos = todos.filter((f) => f.tipo === "Ingreso");

    const total = items.reduce((t, f) => t + f.monto, 0);

    $("subtituloFijos").textContent = items.length
        ? `${items.length} ${items.length === 1 ? "gasto fijo" : "gastos fijos"} · ${money(total)} al mes`
        : "Lo que pagas cada mes, con su fecha de cobro.";

    if (!items.length) {

        $("fijos").innerHTML =
            vacioGuia("📌", "Aún no tienes gastos fijos",
                "Alquiler, internet, suscripciones: agrégalos abajo y la app te avisa cuando toca pagarlos.");

    } else {

        $("fijos").innerHTML = items.map(fijoHTML).join("");

    }

    // Ingresos fijos (se ven en Estadísticas)
    const totalIng = ingresos.reduce((t, f) => t + f.monto, 0);

    $("subtituloIngFijos").textContent = ingresos.length
        ? `${ingresos.length} ${ingresos.length === 1 ? "ingreso fijo" : "ingresos fijos"} · ${money(totalIng)} al mes`
        : "Lo que te pagan cada mes, con su fecha.";

    $("ingresosFijos").innerHTML = ingresos.length
        ? ingresos.map(fijoHTML).join("")
        : vacioGuia("💼", "Aún no tienes ingresos fijos",
            "Agrega tu sueldo u otro ingreso fijo abajo, con su fecha. Los variables (freelance, ventas) solo escríbelos: «me pagaron 800 por un logo».",
            "me pagaron 800 por un logo");

    renderAvisoFijos(items, ingresos);

}

let avisoHoyMostrado = false;

// Aviso en el Dashboard: lo que pagas y lo que te pagan (hoy, vencido o pronto)
function renderAvisoFijos(gastos, ingresos) {

    const activos = (arr) => arr.filter((f) => ["vencido", "hoy", "pronto"].includes(f.info.estado));

    const pg = activos(gastos);

    const pi = activos(ingresos || []);

    const aviso = $("avisoFijos");

    if (!pg.length && !pi.length) {

        aviso.hidden = true;

        return;

    }

    const por = (arr, estado) => arr.filter((f) => f.info.estado === estado).sort((a, b) => a.dia - b.dia);

    const lista = (arr) => arr.slice(0, 3).map((f) => `${esc(f.nombre)} (${money(f.monto)})`).join(", ") +
        (arr.length > 3 ? ` y ${arr.length - 3} más` : "");

    const lineas = [];

    const gHoy = por(pg, "hoy");

    const iHoy = por(pi, "hoy");

    const gVenc = por(pg, "vencido");

    const iVenc = por(pi, "vencido");

    if (gHoy.length) lineas.push(`📅 <strong>Hoy pagas:</strong> ${lista(gHoy)}`);

    if (iHoy.length) lineas.push(`💼 <strong>Hoy te pagan:</strong> ${lista(iHoy)}`);

    if (gVenc.length) lineas.push(`⚠️ <strong>Sin registrar:</strong> ${gVenc.slice(0, 3).map((f) => `${esc(f.nombre)} (hace ${-f.info.dias} ${-f.info.dias === 1 ? "día" : "días"})`).join(", ")}`);

    if (iVenc.length) lineas.push(`💼 <strong>¿Ya te pagaron?</strong> ${iVenc.slice(0, 3).map((f) => `${esc(f.nombre)} (hace ${-f.info.dias} ${-f.info.dias === 1 ? "día" : "días"})`).join(", ")}`);

    const proximos = [...por(pg, "pronto").map((f) => ({ f, ing: false })), ...por(pi, "pronto").map((f) => ({ f, ing: true }))]
        .sort((a, b) => a.f.info.dias - b.f.info.dias)
        .slice(0, 2);

    proximos.forEach(({ f, ing }) => {

        const cuando = f.info.dias === 1 ? "<strong>Mañana</strong>" : `En <strong>${f.info.dias} días</strong>`;

        lineas.push(`${ing ? "💼" : "🔔"} ${cuando} ${ing ? "te pagan" : "pagas"} ${esc(f.nombre)} (${money(f.monto)})`);

    });

    aviso.className = "aviso-fijos" + (gHoy.length || iHoy.length || gVenc.length || iVenc.length ? " urgente" : "");

    aviso.innerHTML = lineas.join("<br>") + ` <span class="aviso-ver">· Ver</span>`;

    // Una vez por visita: avisa también con un mensaje flotante
    if ((gHoy.length || iHoy.length) && !avisoHoyMostrado) {

        avisoHoyMostrado = true;

        const txt = [
            gHoy.length ? `Hoy pagas: ${gHoy.slice(0, 2).map((f) => f.nombre).join(", ")}${gHoy.length > 2 ? "…" : ""}` : "",
            iHoy.length ? `Hoy te pagan: ${iHoy.slice(0, 2).map((f) => f.nombre).join(", ")}${iHoy.length > 2 ? "…" : ""}` : ""
        ].filter(Boolean).join(" · ");

        setTimeout(() => mostrarToast("📅 " + txt), 1200);

    }

    aviso.hidden = false;

}

async function guardarFijo(datos) {

    await api("fijo", datos);

    await cargarDatos();

    renderTodo();

}

// =========================
// TARJETAS DE CRÉDITO
// Cada compra se cuenta cuando la haces; pagar la tarjeta no se vuelve a contar.
// El presupuesto de cada tarjeta es mensual y lo puedes cambiar cuando quieras.
// =========================

const ORDEN_NIVEL_TARJETA = { sin: 0, ok: 1, alerta: 2, limite: 3, exceso: 4 };

const claveTarjeta = (n) => String(n ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function infoTarjetas() {

    const hoy = new Date();

    const actual = claveMes(hoy);

    const previo = claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));

    const mapa = new Map();

    const tomar = (nombre) => {

        const k = claveTarjeta(nombre);

        if (!k) return null;

        if (!mapa.has(k)) mapa.set(k, { nombre: String(nombre).trim(), presupuesto: 0, dia: 0, gastado: 0, previo: 0, pagado: 0 });

        return mapa.get(k);

    };

    estado.tarjetas.forEach((t) => { const x = tomar(t.nombre); x.presupuesto = t.presupuesto; x.dia = t.dia; });

    estado.movimientos.forEach((m) => {

        if (!m.medio || !esGasto(m)) return;

        if (!m.fecha) return;

        const c = claveMes(m.fecha);

        // Una tarjeta solo aparece por sus compras de este mes (o si la guardaste tú)
        const t = c === actual || mapa.has(claveTarjeta(m.medio)) ? tomar(m.medio) : null;

        if (!t) return;

        if (esPagoTarjeta(m)) {

            if (c === actual) t.pagado += m.monto;

            return;

        }

        if (c === actual) t.gastado += m.monto;

        else if (c === previo) t.previo += m.monto;

    });

    return [...mapa.values()].map((t) => {

        const pct = t.presupuesto > 0 ? t.gastado / t.presupuesto : 0;

        const nivel = t.presupuesto <= 0 ? "sin"
            : t.gastado > t.presupuesto + 0.005 ? "exceso"
            : t.gastado >= t.presupuesto - 0.005 ? "limite"
            : pct >= 0.8 ? "alerta"
            : "ok";

        const resto = t.presupuesto - t.gastado;

        const mensaje = nivel === "sin" ? "Fija un presupuesto para recibir avisos"
            : nivel === "exceso" ? `Te pasaste por ${money(-resto)}`
            : nivel === "limite" ? "Llegaste al límite de tu presupuesto"
            : nivel === "alerta" ? `Cuidado: te quedan solo ${money(resto)}`
            : `Te quedan ${money(resto)}`;

        // Próximo día de pago de la tarjeta
        let pagoDias = null;

        let pagoTexto = "";

        if (t.dia > 0) {

            const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

            const en = (y, m) => new Date(y, m, Math.min(t.dia, new Date(y, m + 1, 0).getDate()));

            let prox = en(h0.getFullYear(), h0.getMonth());

            if (prox < h0) prox = en(h0.getFullYear(), h0.getMonth() + 1);

            pagoDias = Math.round((prox - h0) / MS_DIA);

            pagoTexto = pagoDias === 0 ? "Hoy es tu día de pago"
                : pagoDias === 1 ? "Pagas mañana"
                : `Pagas el ${fechaCorta(prox)} · en ${pagoDias} días`;

        }

        return { ...t, pct, nivel, resto, mensaje, pagoDias, pagoTexto };

    }).sort((a, b) => (ORDEN_NIVEL_TARJETA[b.nivel] - ORDEN_NIVEL_TARJETA[a.nivel]) || (b.gastado - a.gastado));

}

// Foto de cómo está cada tarjeta, para avisar solo cuando empeora
function nivelesTarjetas() {

    return new Map(infoTarjetas().map((t) => [claveTarjeta(t.nombre), t.nivel]));

}

// Texto del aviso si alguna tarjeta acaba de subir de nivel (80%, límite o exceso). null si no hay.
function avisoCambioTarjetas(antes) {

    let peor = null;

    infoTarjetas().forEach((t) => {

        const orden = ORDEN_NIVEL_TARJETA[t.nivel];

        const previo = ORDEN_NIVEL_TARJETA[antes.get(claveTarjeta(t.nombre)) || "sin"];

        if (orden >= 2 && orden > previo && (!peor || orden > ORDEN_NIVEL_TARJETA[peor.nivel])) peor = t;

    });

    if (!peor) return null;

    return peor.nivel === "alerta" ? `⚠️ ${peor.nombre}: ya usaste el ${Math.round(peor.pct * 100)}% de tu presupuesto`
        : peor.nivel === "limite" ? `🚨 ${peor.nombre}: llegaste al límite de tu presupuesto`
        : `🚨 ${peor.nombre}: te pasaste por ${money(-peor.resto)}`;

}

// Barra de uso de una tarjeta (la misma en Planificar, en el inicio y al registrar una compra)
function barraUsoHTML(t) {

    const ancho = Math.min(100, Math.round(t.pct * 100));

    const clase = t.nivel === "sin" ? "ok" : t.nivel === "limite" ? "exceso" : t.nivel;

    return `
        <div class="uso-tarjeta">

            <div class="presupuesto-top">

                <span class="presupuesto-nombre">💳 ${esc(t.nombre)}</span>

                <span class="presupuesto-monto">${money(t.gastado)}${t.presupuesto > 0 ? ` de ${money(t.presupuesto)}` : ""}</span>

            </div>

            <div class="presupuesto-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100"
                aria-valuenow="${ancho}" aria-label="Uso de ${esc(t.nombre)}">

                <div class="presupuesto-progreso nivel-${clase}" style="width:${ancho}%"></div>

            </div>

            <div class="presupuesto-pie">

                <span class="presupuesto-mensaje nivel-${clase}">${esc(t.mensaje)}${t.presupuesto > 0 ? ` · ${Math.round(t.pct * 100)}%` : ""}</span>

            </div>

        </div>`;

}

// Después de registrar con tarjeta: muestra cómo va esa tarjeta y avisa si subió de nivel
function avisarCambioTarjetas(antes, medios) {

    const caja = $("respuesta");

    const infos = infoTarjetas();

    const vistos = new Set();

    (medios || []).forEach((n) => {

        const k = claveTarjeta(n);

        if (!k || vistos.has(k)) return;

        vistos.add(k);

        const t = infos.find((x) => claveTarjeta(x.nombre) === k);

        if (t) caja.innerHTML += `<div class="uso-mini">${barraUsoHTML(t)}</div>`;

    });

    const texto = avisoCambioTarjetas(antes);

    if (texto) setTimeout(() => mostrarToast(texto), 1600);

}

function renderTarjetas() {

    const items = infoTarjetas();

    $("subtituloTarjetas").textContent = items.length
        ? `${nombreMes(claveMes(new Date()))} · ${money(items.reduce((t, x) => t + x.gastado, 0))} gastados con tarjeta`
        : "Controla cuánto gastas con cada tarjeta y recibe avisos.";

    if (!items.length) {

        $("tarjetas").innerHTML = vacioGuia("💳", "Aún no tienes tarjetas",
            "Escribe en la barra, por ejemplo: «compré zapatos 200 con la BCP». La tarjeta se crea sola y aquí le pones su presupuesto.",
            "almuerzo 25 con la BCP");

    } else {

        $("tarjetas").innerHTML = items.map((t) => {

            const ancho = Math.min(100, Math.round(t.pct * 100));

            const detalle = [
                t.previo > 0 ? `Mes pasado: ${money(t.previo)}` : "",
                t.pagado > 0 ? `Pagado este mes: ${money(t.pagado)}` : ""
            ].filter(Boolean).join(" · ");

            return `
            <div class="presupuesto-item tarjeta-item" data-nombre="${esc(t.nombre)}"
                data-presupuesto="${t.presupuesto}" data-previo="${Math.round(t.previo)}" data-dia="${t.dia || ""}">

                ${barraUsoHTML(t)}

                ${t.presupuesto > 0 ? `<div class="tarjeta-detalle">Máximo del mes: <strong>${money(t.presupuesto)}</strong></div>` : ""}

                ${t.pagoTexto ? `<div class="tarjeta-pago ${t.pagoDias <= 3 ? "pronto" : ""}">📅 ${esc(t.pagoTexto)}</div>` : ""}

                ${detalle ? `<div class="tarjeta-detalle">${esc(detalle)}</div>` : ""}

                <div class="presupuesto-acciones tarjeta-acciones">

                    ${t.previo > 0 && Math.round(t.previo) !== Math.round(t.presupuesto)
                        ? `<button class="mov-btn mov-btn-primario" type="button" data-tarj="igual">Usar ${money(Math.round(t.previo))} (mes pasado)</button>` : ""}

                    <button class="mov-btn" type="button" data-tarj="editar">Cambiar presupuesto o día</button>

                    ${t.presupuesto > 0
                        ? `<button class="mov-btn mov-btn-borrar" type="button" data-tarj="quitar">Quitar presupuesto</button>`
                        : (t.gastado === 0 && t.pagado === 0
                            ? `<button class="mov-btn mov-btn-borrar" type="button" data-tarj="quitar">Quitar tarjeta</button>` : "")}

                </div>

            </div>`;

        }).join("");

    }

    const resumen = $("tarjetasResumen");

    resumen.hidden = !items.length;

    resumen.innerHTML = items.length
        ? `<div class="card-title"><div><h2>💳 Uso de tus tarjetas</h2><p>${esc(nombreMes(claveMes(new Date())))}</p></div></div>` +
          items.map((t) => barraUsoHTML(t) + (t.pagoTexto ? `<div class="tarjeta-pago ${t.pagoDias <= 3 ? "pronto" : ""}">📅 ${esc(t.pagoTexto)}</div>` : "")).join("")
        : "";

    renderAvisoTarjetas(items);

}

let avisoPagoTarjetaMostrado = false;

// Aviso en el Dashboard: tarjetas cerca del límite, pasadas, o con el día de pago cerca
function renderAvisoTarjetas(items) {

    const aviso = $("avisoTarjetas");

    const malas = items.filter((t) => ORDEN_NIVEL_TARJETA[t.nivel] >= 2);

    const pagos = items
        .filter((t) => t.pagoDias !== null && t.pagoDias <= 3)
        .sort((a, b) => a.pagoDias - b.pagoDias);

    if (!malas.length && !pagos.length) {

        aviso.hidden = true;

        return;

    }

    const lineas = [];

    pagos.forEach((t) => {

        const cuando = t.pagoDias === 0 ? "<strong>Hoy pagas</strong>"
            : t.pagoDias === 1 ? "<strong>Mañana pagas</strong>"
            : `En <strong>${t.pagoDias} días</strong> pagas`;

        lineas.push(`📅 ${cuando} tu tarjeta ${esc(t.nombre)} (llevas ${money(t.gastado)} este mes)`);

    });

    malas.slice(0, 2).forEach((t) => {

        const txt = t.nivel === "alerta" ? `va en ${Math.round(t.pct * 100)}% de su presupuesto`
            : t.nivel === "limite" ? "llegó al límite"
            : `se pasó por ${money(-t.resto)}`;

        lineas.push(`💳 ${esc(t.nombre)} ${txt}`);

    });

    const grave = malas.some((t) => t.nivel === "exceso" || t.nivel === "limite") || pagos.some((t) => t.pagoDias === 0);

    aviso.className = "aviso-fijos aviso-tarjetas " + (grave ? "exceso" : "alerta");

    aviso.innerHTML = lineas.join("<br>") + ` <span class="aviso-ver">· Ver</span>`;

    aviso.hidden = false;

    const hoy = pagos.filter((t) => t.pagoDias === 0);

    if (hoy.length && !avisoPagoTarjetaMostrado) {

        avisoPagoTarjetaMostrado = true;

        setTimeout(() => mostrarToast(`📅 Hoy pagas tu tarjeta ${hoy[0].nombre}`), 2600);

    }

}

async function guardarTarjeta(nombre, presupuesto, dia) {

    await api("tarjeta", { nombre, presupuesto, dia });

    await cargarDatos();

    renderTodo();

}

// =========================
// METAS DE AHORRO
// =========================

// yyyy-mm-dd para el campo de fecha
const aInputFecha = (d) =>
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

function infoMeta(m) {

    const falta = Math.max(0, m.objetivo - m.ahorrado);

    const pct = m.ahorrado / m.objetivo;

    if (falta === 0) return { nivel: "ok", texto: "¡Meta lograda! 🎉", pct };

    let texto = `Te faltan ${money(falta)}`;

    let nivel = "normal";

    if (m.fecha) {

        const hoy = new Date();

        const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

        const dias = Math.round((m.fecha - h0) / MS_DIA);

        if (dias < 0) {

            texto += ` · la fecha (${fechaCorta(m.fecha)} ${m.fecha.getFullYear()}) ya pasó`;

            nivel = "exceso";

        } else {

            const meses = Math.max(1, Math.ceil(dias / 30));

            texto += ` · para el ${fechaCorta(m.fecha)} ${m.fecha.getFullYear()} (en ${dias} ${dias === 1 ? "día" : "días"})` +
                ` necesitas ~${money(falta / meses)} al mes`;

        }

    }

    return { nivel, texto, pct };

}

function renderMetas() {

    const items = estado.metas.map((m) => ({ ...m, info: infoMeta(m) }));

    const totalAhorrado = items.reduce((t, m) => t + m.ahorrado, 0);

    $("subtituloMetas").textContent = items.length
        ? `${items.length} ${items.length === 1 ? "meta" : "metas"} · ${money(totalAhorrado)} apartados`
        : "Aparta plata para lo que quieres lograr.";

    if (!items.length) {

        $("metas").innerHTML =
            vacioGuia("🎯", "Aún no tienes metas",
                "Crea la primera abajo: un viaje, tu mini depa, lo que quieras lograr. Luego vas sumando aportes.");

        return;

    }

    $("metas").innerHTML = items.map((m) => {

        const ancho = Math.min(100, Math.round(m.info.pct * 100));

        return `
            <div class="meta-item" data-nombre="${esc(m.nombre)}" data-objetivo="${m.objetivo}"
                data-fecha="${m.fecha ? aInputFecha(m.fecha) : ""}">

                <div class="presupuesto-top">

                    <span class="presupuesto-nombre">🏁 ${esc(m.nombre)}</span>

                    <span class="presupuesto-monto">${money(m.ahorrado)} de ${money(m.objetivo)}</span>

                </div>

                <div class="presupuesto-barra" role="progressbar"
                    aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ancho}"
                    aria-label="Avance de ${esc(m.nombre)}">

                    <div class="presupuesto-progreso ${m.info.nivel === "ok" ? "nivel-ok" : "meta-progreso"}"
                        style="width:${ancho}%"></div>

                </div>

                <div class="meta-estado nivel-${m.info.nivel}">
                    ${Math.round(m.info.pct * 100)}% · ${esc(m.info.texto)}
                </div>

                <div class="meta-aporte">

                    <input class="meta-monto" type="number" step="0.01" min="0.01"
                        inputmode="decimal" placeholder="Monto (S/)" aria-label="Monto a aportar o retirar">

                    <button class="mov-btn mov-btn-primario" type="button" data-meta="aportar">＋ Aportar</button>

                    <button class="mov-btn" type="button" data-meta="retirar">− Retirar</button>

                </div>

                <div class="fijo-acciones">

                    <button class="mov-btn" type="button" data-meta="editar">Cambiar</button>

                    <button class="mov-btn mov-btn-borrar" type="button" data-meta="quitar">Quitar</button>

                </div>

            </div>
        `;

    }).join("");

}

async function guardarMeta(datos) {

    await api("meta", datos);

    await cargarDatos();

    renderTodo();

}

// =========================
// RENDER GENERAL
// =========================

function renderTodo() {

    renderUsuario();

    renderDashboard();

    renderBienvenida();

    renderActividad();

    actualizarSelectorMes();

    renderResumenPeriodo();

    renderEstadisticas();

    renderPresupuestos();

    renderTarjetas();

    renderFijos();

    renderMetas();

    renderDeudas();

}

function mostrarErrorCarga(mostrar) {

    $("errorCarga").hidden = !mostrar;

}

function manejarError(e) {

    if (e instanceof ErrorPausa) {

        // No se borra el código: cuando te reactiven, basta con recargar
        pedirPin(MENSAJE_PAUSA);

        return;

    }

    if (e instanceof ErrorPin) {

        borrarPin();

        pedirPin("Código incorrecto. Inténtalo de nuevo.");

        return;

    }

    console.error(e);

    mostrarErrorCarga(true);

}

async function actualizarTodo() {

    try {

        await cargarDatos();

        mostrarErrorCarga(false);

        renderTodo();

        animar(".tarjeta");

    } catch (e) {

        manejarError(e);

    }

}

// =========================
// REGISTRAR MOVIMIENTO
// =========================

// ---------- Registro rápido (sin IA) ----------
// Mensajes simples como "almuerzo 15" se entienden aquí mismo y se guardan directo en el Sheet.
// Si hay cualquier duda (varios montos, préstamos, fechas, categoría desconocida) devuelve null
// y el mensaje sigue el camino de siempre (Make + IA).

const sinTildes = (t) =>
    String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REGLAS_RAPIDAS = [
    // Ingresos por fuente primero: "vendí ropa" es una venta, no un gasto en ropa
    { tipo: "Ingreso", claves: ["venta", "ventas", "vendi", "vendimos"], candidatas: ["Ventas"] },
    { tipo: "Ingreso", claves: ["freelance", "freelancer", "proyecto", "logo", "diseno", "cliente", "trabajito", "chamba", "comision"], candidatas: ["Freelance"] },
    { tipo: "Gasto", claves: ["almuerzo", "cena", "desayuno", "menu", "comida", "pollo", "pizza", "cafe", "snack", "galletas", "bebida", "jugo", "helado", "hamburguesa", "chifa", "sushi", "ceviche", "agua", "gaseosa", "pan"], candidatas: ["Comida", "Alimentación", "Alimentacion", "Restaurantes"] },
    { tipo: "Gasto", claves: ["taxi", "uber", "cabify", "bus", "pasaje", "combi", "metro", "gasolina", "combustible", "peaje", "estacionamiento", "scooter"], candidatas: ["Transporte", "Movilidad"] },
    { tipo: "Gasto", claves: ["mercado", "supermercado", "plaza", "tottus", "wong", "metro"], candidatas: ["Supermercado", "Mercado", "Compras"] },
    { tipo: "Gasto", claves: ["cine", "netflix", "spotify", "juego", "salida", "entrada", "concierto", "disco", "bar"], candidatas: ["Entretenimiento", "Ocio", "Salidas"] },
    { tipo: "Gasto", claves: ["farmacia", "medicina", "doctor", "pastillas", "consulta"], candidatas: ["Salud"] },
    { tipo: "Gasto", claves: ["ropa", "zapatillas", "zapatos", "polo", "pantalon", "casaca", "camisa", "vestido", "jean", "short"], candidatas: ["Ropa", "Compras"] },
    { tipo: "Gasto", claves: ["luz", "internet", "celular", "recarga", "alquiler", "cable"], candidatas: ["Servicios", "Recibos", "Hogar"] },
    { tipo: "Ingreso", claves: ["sueldo", "salario", "quincena"], candidatas: ["Sueldo", "Salario", "Ingresos"] },
    { tipo: "Ingreso", claves: ["propina", "bono", "gratificacion", "cts", "utilidades"], candidatas: ["Otros ingresos", "Ingresos"] }
];

// Categorías que ya existen en tus movimientos (así no se inventan categorías nuevas)
function categoriasExistentes() {

    const mapa = new Map();

    // En la demo todavía no hay datos: se usan categorías típicas para que el registro rápido funcione
    if (modoDemo) DemoBackend.categorias.forEach((c) => mapa.set(sinTildes(c), c));

    estado.movimientos.forEach((m) => {

        const k = sinTildes(m.categoria).trim();

        if (k && !mapa.has(k)) mapa.set(k, m.categoria.trim());

    });

    return mapa;

}

const MARCAS_TARJETA = "bcp|bbva|interbank|ibk|scotiabank|scotia|visa|mastercard|amex|diners|falabella|cmr|ripley";

function nombreBonito(n) {

    const t = String(n).replace(/\s+/g, " ").trim();

    const conocida = infoTarjetas().find((x) => claveTarjeta(x.nombre) === claveTarjeta(t));

    if (conocida) return conocida.nombre;

    return t.length <= 4 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

}

// "pagué la tarjeta BCP 450" / "pagué 450 de la tarjeta BCP"
function parsearPagoTarjeta(original) {

    const num = "(?:S\\/\\.?\\s*)?(\\d+(?:[.,]\\d{1,2})?)\\s*(?:soles?)?";

    let m = original.match(new RegExp("^\\s*(?:pagu[eé]|pago|pagar|abon[eé])\\s+(?:la\\s+|mi\\s+)?(tarjeta\\s+(?:de\\s+cr[eé]dito\\s+)?)?([A-Za-zÁÉÍÓÚáéíóúÑñ0-9 ]{2,30}?)\\s+" + num + "\\s*$", "i"));

    let nombre, monto;

    if (m) {

        nombre = m[2];

        monto = m[3];

        const conocida = infoTarjetas().some((x) => claveTarjeta(x.nombre) === claveTarjeta(nombre));

        if (!m[1] && !conocida && !new RegExp("^(" + MARCAS_TARJETA + ")$", "i").test(nombre.trim())) return null;

    } else {

        m = original.match(new RegExp("^\\s*(?:pagu[eé]|pago|pagar|abon[eé])\\s+" + num + "\\s+(?:de|a|en)\\s+(?:la\\s+|mi\\s+)?tarjeta\\s+(?:de\\s+cr[eé]dito\\s+)?([A-Za-zÁÉÍÓÚáéíóúÑñ0-9 ]{2,30}?)\\s*$", "i"));

        if (!m) return null;

        monto = m[1];

        nombre = m[2];

    }

    nombre = nombre.replace(/^(?:la|mi|de|tarjeta)\s+/i, "").trim();

    const valor = parseFloat(monto.replace(",", "."));

    if (!nombre || !(valor > 0) || valor > 1000000) return null;

    const medio = nombreBonito(nombre);

    return { tipo: "Gasto", categoria: "Pago de tarjeta", descripcion: "Pago tarjeta " + medio, monto: valor, medio };

}

// Saca "con la BCP" / "con mi tarjeta Interbank" del texto y devuelve la tarjeta
function extraerTarjeta(original) {

    const escapar = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const conocidas = infoTarjetas().map((t) => t.nombre).sort((a, b) => b.length - a.length);

    const prefijo = "(?:\\s+(?:con|en|usando|de))?\\s+(?:(?:la|mi|el)\\s+)?(?:tarjeta\\s+)?(?:de\\s+cr[eé]dito\\s+)?";

    for (const nombre of conocidas) {

        const re = new RegExp(prefijo + "(" + escapar(nombre) + ")(?![A-Za-z0-9ÁÉÍÓÚáéíóúÑñ])", "i");

        const m = original.match(re);

        if (m && /\b(con|en|usando|tarjeta)\b/i.test(m[0])) return { limpio: original.replace(m[0], " ").trim(), tarjeta: nombre };

    }

    let m = original.match(/\s+con\s+(?:la\s+|mi\s+)?tarjeta\s+(?:de\s+cr[eé]dito\s+)?([A-Za-zÁÉÍÓÚáéíóúÑñ0-9]{2,20})(?![A-Za-z0-9])/i);

    if (!m) m = original.match(new RegExp("\\s+con\\s+(?:la\\s+|mi\\s+)?(?:tarjeta\\s+)?(" + MARCAS_TARJETA + ")(?![A-Za-z0-9])", "i"));

    if (m) return { limpio: original.replace(m[0], " ").trim(), tarjeta: nombreBonito(m[1]) };

    return { limpio: original, tarjeta: "" };

}

function parsearRapido(texto) {

    const original = String(texto || "").trim();

    const pago = parsearPagoTarjeta(original);

    if (pago) return pago;

    const { limpio, tarjeta } = extraerTarjeta(original);

    const r = parsearRapidoBase(limpio);

    if (r && tarjeta) {

        if (r.tipo !== "Gasto") return null;

        r.medio = tarjeta;

    }

    return r;

}

function parsearRapidoBase(texto) {

    const original = String(texto || "").trim();

    const t = sinTildes(original);

    // Varios movimientos, préstamos, deudas, fechas o monedas raras: que lo resuelva la IA
    if (/[\n;+]|,(?!\d)|\d,(?=\D)/.test(original)) return null;

    if (/\s(y|e)\s/.test(" " + t + " ")) return null;

    if (/(prestam|preste|debe|debo|deuda|reembols|devolv|devuelv|ayer|anoche|anteayer|manana|semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|dolar|usd|\$|%)/.test(t)) return null;

    // "1,500" es ambiguo (¿1.5 o mil quinientos?): que lo resuelva la IA
    if (/\d[,.]\d{3}(?!\d)/.test(original)) return null;

    // Exactamente un número
    const numeros = original.match(/\d+(?:[.,]\d+)?/g) || [];

    if (numeros.length !== 1) return null;

    const monto = parseFloat(numeros[0].replace(",", "."));

    if (!(monto > 0) || monto > 1000000) return null;

    // Descripción: el texto sin el número, sin "S/" y sin verbos de relleno
    let desc = original
        .replace(numeros[0], " ")
        .replace(/\bs\/\.?|\bsoles?\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    desc = desc.replace(/^(me\s+(?:pagaron|depositaron|yapearon|dieron|transfirieron)|gan[eé]|gast[eé]|compr[eé]|pagu[eé]|pago|gasto|compra|recib[ií]|cobr[eé])\s+/i, "");

    desc = desc.replace(/^(?:(?:en|de|por|con|un|una|el|la|los|las)\s+)+/i, "");

    desc = desc.replace(/(?:\s+(?:en|de|por|con|a))+$/i, "");

    desc = desc.replace(/^[\s.\-:]+|[\s.\-:]+$/g, "");

    if (desc.length < 2 || desc.length > 60) return null;

    desc = desc.charAt(0).toUpperCase() + desc.slice(1);

    const clave = sinTildes(desc).trim();

    const palabras = new Set(clave.split(/[^a-z0-9ñ]+/).filter(Boolean));

    // 1) ¿Ya registraste algo con esa misma descripción? Se copia su tipo y categoría
    for (let i = estado.movimientos.length - 1; i >= 0; i--) {

        const m = estado.movimientos[i];

        if (sinTildes(m.descripcion).trim() === clave) {

            if (esPrestamo(m) || esReembolso(m)) return null;

            if (m.tipo.toLowerCase() !== "gasto" && m.tipo.toLowerCase() !== "ingreso") return null;

            return {
                tipo: esIngreso(m) ? "Ingreso" : "Gasto",
                categoria: m.categoria.trim() || "Otros",
                descripcion: desc,
                monto
            };

        }

    }

    // 2) Palabras comunes, pero solo si esa categoría ya existe en tu hoja
    const existentes = categoriasExistentes();

    for (const regla of REGLAS_RAPIDAS) {

        if (!regla.claves.some((c) => palabras.has(c))) continue;

        for (const cand of regla.candidatas) {

            const real = existentes.get(sinTildes(cand));

            if (real) return { tipo: regla.tipo, categoria: real, descripcion: desc, monto };

        }

        // Ninguna de esas categorías existe todavía (cuenta nueva): se usa la principal
        return { tipo: regla.tipo, categoria: regla.candidatas[0], descripcion: desc, monto };

    }

    return null;

}

let pendientesGuardar = 0;

// Muestra el movimiento al instante y lo guarda en segundo plano
function registrarRapido(r) {

    const hoy = new Date();

    const texto =
        String(hoy.getDate()).padStart(2, "0") + "/" +
        String(hoy.getMonth() + 1).padStart(2, "0") + "/" + hoy.getFullYear();

    const maxFila = estado.movimientos.reduce((a, m) => Math.max(a, m.fila), 1);

    const temporal = {
        idx: estado.movimientos.length,
        fila: maxFila + 1,
        fechaTexto: texto,
        fecha: parseFecha(texto),
        tipo: r.tipo,
        categoria: r.categoria,
        descripcion: r.descripcion,
        monto: r.monto,
        medio: r.medio || ""
    };

    const nivelesAntes = nivelesTarjetas();

    estado.movimientos.push(temporal);

    estado.mes = null;

    renderTodo();

    animar(".tarjeta");

    mostrarRegistrados([temporal]);

    mostrarToast(esPagoTarjeta(temporal) ? "✅ Pago de tarjeta registrado (no cuenta como gasto)" : "✅ Movimiento registrado");

    avisarCambioTarjetas(nivelesAntes, [temporal.medio]);

    let promesaGuardado = Promise.resolve();

    agregarDeshacer(temporal, () => promesaGuardado);

    pendientesGuardar++;

    promesaGuardado = (async () => {

        let fallo = null;

        try {

            await api("agregar", {
                tipo: r.tipo,
                categoria: r.categoria,
                descripcion: r.descripcion,
                monto: r.monto,
                medio: r.medio || ""
            });

        } catch (e) {

            fallo = e;

        }

        pendientesGuardar--;

        if (fallo) {

            const i = estado.movimientos.indexOf(temporal);

            if (i >= 0) estado.movimientos.splice(i, 1);

            renderTodo();

            if (fallo instanceof ErrorPin) {

                manejarError(fallo);

            } else {

                console.error(fallo);

                $("respuesta").textContent = "⚠️ No se pudo guardar: " + r.descripcion + ". Inténtalo otra vez.";

                mostrarToast("❌ No se pudo guardar el movimiento");

            }

        }

        // Cuando ya no queda nada guardándose, se trae la hoja real (con sus números de fila)
        if (pendientesGuardar === 0) {

            try {

                await cargarDatos();

                if (estado.editando === null) renderTodo();

            } catch (e) {

                console.error(e);

            }

        }

    })();

}

// Espera a que Make escriba la fila en el Sheet (en vez de un tiempo fijo)
async function esperarNuevos(cantidadAntes) {

    for (let i = 0; i < 12; i++) {

        await dormir(1200);

        await cargarDatos();

        if (estado.movimientos.length > cantidadAntes) {

            await dormir(900); // por si el mensaje generó más de una fila

            await cargarDatos();

            return estado.movimientos.slice(cantidadAntes);

        }

    }

    return null;

}

function mostrarRegistrados(nuevos) {

    const caja = $("respuesta");

    if (nuevos === null) {

        caja.textContent = "⏳ Enviado, pero todavía no aparece en la hoja. Recarga en unos segundos.";

        return;

    }

    // Un solo mensaje no genera decenas de filas: si pasa, no listamos todo
    if (nuevos.length > 5) {

        caja.textContent = "✅ Registrado. Revisa tu actividad reciente aquí abajo.";

        return;

    }

    const lineas = nuevos.map((m) =>
        `${esIngreso(m) ? "📈" : "📉"} ${esc(m.descripcion || m.categoria)} · ${esc(m.categoria)}${m.medio ? ` · 💳 ${esc(m.medio)}` : ""} · ` +
        `<strong>${esIngreso(m) ? "+" : "-"} ${money(m.monto)}</strong>`
    );

    caja.innerHTML =
        `✅ Registrado${nuevos.length > 1 ? ` (${nuevos.length} movimientos)` : ""}:<br>` +
        lineas.join("<br>");

}

async function registrarMovimiento() {

    const texto = $("mensaje").value.trim();

    if (!texto) {

        mostrarToast("✍️ Escribe un movimiento primero");

        return;

    }

    if (texto.length > MAX_CARACTERES) {

        mostrarToast(`Máximo ${MAX_CARACTERES} caracteres`);

        return;

    }

    // Camino rápido: mensaje simple y categoría conocida, sin IA ni Make
    const rapido = parsearRapido(texto);

    if (rapido) {

        $("mensaje").value = "";

        registrarRapido(rapido);

        return;

    }

    const boton = $("registrar");

    const textoBoton = $("textoBoton");

    boton.disabled = true;

    textoBoton.textContent = "⏳ Registrando...";

    $("respuesta").textContent = "🤖 Analizando movimiento...";

    try {

        // Si hay algo guardándose en segundo plano, esperar a que termine para contar bien
        for (let i = 0; i < 40 && pendientesGuardar > 0; i++) await dormir(300);

        // Los datos ya están en pantalla; solo se vuelven a pedir si están viejos
        if (Date.now() - ultimaCarga > 60000) await cargarDatos();

        const cantidadAntes = estado.movimientos.length;

        const nivelesAntes = nivelesTarjetas();

        await api("registrar", { mensaje: texto });

        $("mensaje").value = "";

        $("respuesta").textContent = "📊 Guardando en la hoja...";

        const nuevos = await esperarNuevos(cantidadAntes);

        estado.mes = null; // vuelve al mes más reciente con gastos

        renderTodo();

        animar(".tarjeta");

        mostrarRegistrados(nuevos);

        mostrarToast(nuevos === null ? "⏳ Enviado, aún procesando" : "✅ Movimiento registrado");

        if (nuevos) avisarCambioTarjetas(nivelesAntes, nuevos.map((m) => m.medio));

    } catch (e) {

        if (e instanceof ErrorPin) {

            manejarError(e);

        } else {

            console.error(e);

            const claro = e && e.message && !/fetch|network|red \(/i.test(e.message) ? e.message : "";

            $("respuesta").textContent = claro
                ? "⚠️ " + claro
                : "⚠️ No se pudo registrar. Tu texto sigue abajo, inténtalo otra vez.";

            $("mensaje").value = texto;

            mostrarToast("❌ No se pudo registrar el movimiento");

        }

    } finally {

        boton.disabled = false;

        textoBoton.textContent = "➕ Registrar movimiento";

    }

}

// =========================
// PRESUPUESTO POR CATEGORÍA
// =========================

function renderPresupuestos() {

    // Si el gráfico está en "Todo el historial", el presupuesto usa el mes actual
    const periodo = (!estado.mes || estado.mes === "all")
        ? claveMes(new Date())
        : estado.mes;

    const gastadoPor = new Map();

    gastosDelPeriodo(periodo).forEach((m) => {

        const c = nombreCategoria(m.categoria);

        gastadoPor.set(c, (gastadoPor.get(c) || 0) + m.monto);

    });

    // Sugerencias para el formulario: categorías que ya usas y las que ya tienen límite
    const categorias = new Set(estado.movimientos.map((m) => nombreCategoria(m.categoria)));

    estado.presupuestos.forEach((p) => categorias.add(p.categoria));

    $("categoriasPresupuesto").innerHTML = [...categorias]
        .sort()
        .map((c) => `<option value="${esc(c)}"></option>`)
        .join("");

    const items = estado.presupuestos
        .map((p) => ({ ...p, gastado: gastadoPor.get(p.categoria) || 0 }))
        .sort((a, b) => (b.gastado / b.limite) - (a.gastado / a.limite));

    if (!items.length) {

        $("subtituloPresupuesto").textContent =
            "Fija un límite mensual por categoría y sigue cuánto te queda.";

        $("presupuestos").innerHTML =
            vacioGuia("💰", "Aún no tienes presupuestos",
                "Elige una categoría abajo y fija un límite mensual. Te muestro cuánto te queda.");

        return;

    }

    const totalLimite = items.reduce((t, p) => t + p.limite, 0);

    const totalGastado = items.reduce((t, p) => t + p.gastado, 0);

    $("subtituloPresupuesto").textContent =
        `${nombreMes(periodo)} · ${money(totalGastado)} gastados de ${money(totalLimite)}`;

    $("presupuestos").innerHTML = items.map((p) => {

        const pct = p.gastado / p.limite;

        const nivel = pct > 1 ? "exceso" : pct >= 0.8 ? "alerta" : "ok";

        const resto = p.limite - p.gastado;

        const mensaje = resto >= 0
            ? `Te quedan ${money(resto)}`
            : `Te pasaste por ${money(-resto)}`;

        const ancho = Math.min(100, Math.round(pct * 100));

        const icono = ICONOS[p.categoria.toLowerCase()] || "📦";

        return `
            <div class="presupuesto-item" data-categoria="${esc(p.categoria)}" data-limite="${p.limite}">

                <div class="presupuesto-top">

                    <span class="presupuesto-nombre">${icono} ${esc(p.categoria)}</span>

                    <span class="presupuesto-monto">${money(p.gastado)} de ${money(p.limite)}</span>

                </div>

                <div class="presupuesto-barra" role="progressbar"
                    aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ancho}"
                    aria-label="Gastado en ${esc(p.categoria)}">

                    <div class="presupuesto-progreso nivel-${nivel}" style="width:${ancho}%"></div>

                </div>

                <div class="presupuesto-pie">

                    <span class="presupuesto-mensaje nivel-${nivel}">${mensaje} · ${Math.round(pct * 100)}%</span>

                    <span class="presupuesto-acciones">

                        <button class="mov-btn" type="button" data-pres="editar">Cambiar</button>

                        <button class="mov-btn mov-btn-borrar" type="button" data-pres="quitar">Quitar</button>

                    </span>

                </div>

            </div>
        `;

    }).join("");

}

async function guardarPresupuesto(categoria, limite) {

    await api("presupuesto", { categoria, limite });

    await cargarDatos();

    renderTodo();

}

// =========================
// EDITAR Y BORRAR MOVIMIENTOS
// =========================

const origenDe = (m) => ({
    tipo: m.tipo,
    categoria: m.categoria,
    descripcion: m.descripcion,
    monto: m.monto
});

function buscarMovimiento(fila) {

    const m = estado.movimientos.find((x) => x.fila === fila);

    if (!m) throw new Error("No se encontró el movimiento. Recarga la página.");

    return m;

}

async function guardarMovimiento(fila, valores) {

    const m = buscarMovimiento(fila);

    await api("editar", { fila, orig: origenDe(m), nuevo: valores });

    estado.editando = null;

    await cargarDatos();

    renderTodo();

    animar(".tarjeta");

}

async function eliminarMovimiento(fila) {

    const m = buscarMovimiento(fila);

    const data = await api("borrar", { fila, orig: origenDe(m) });

    estado.editando = null;

    await cargarDatos();

    renderTodo();

    animar(".tarjeta");

    return data.deuda || "";

}

function errorDeAccion(e) {

    if (e instanceof ErrorPin) {

        manejarError(e);

        return;

    }

    console.error(e);

    mostrarToast("❌ " + (e.message || "No se pudo completar la acción"));

    actualizarTodo();

}

async function accionActividad(boton) {

    const accion = boton.dataset.accion;

    const tarjeta = boton.closest("[data-fila]");

    if (!tarjeta) return;

    const fila = Number(tarjeta.dataset.fila);

    if (accion === "editar") {

        estado.editando = fila;

        renderActividad();

        const primero = $("actividad").querySelector('[data-campo="descripcion"]');

        if (primero) primero.focus();

        return;

    }

    if (accion === "cancelar") {

        estado.editando = null;

        renderActividad();

        return;

    }

    if (boton.disabled) return;

    if (accion === "guardar") {

        const campo = (n) => tarjeta.querySelector(`[data-campo="${n}"]`).value;

        const valores = {
            tipo: campo("tipo"),
            categoria: campo("categoria").trim() || "Otros",
            descripcion: campo("descripcion").trim(),
            monto: Number(campo("monto"))
        };

        if (!valores.descripcion) {

            mostrarToast("✍️ Escribe una descripción");

            return;

        }

        if (!(valores.monto > 0)) {

            mostrarToast("💲 El monto debe ser mayor que 0");

            return;

        }

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarMovimiento(fila, valores);

            mostrarToast("✅ Movimiento actualizado");

        } catch (e) {

            errorDeAccion(e);

        }

        return;

    }

    if (accion === "borrar") {

        // Primer toque: pide confirmar. Si no confirma en 4 segundos, vuelve a la normalidad.
        if (!boton.dataset.confirmando) {

            boton.dataset.confirmando = "1";

            const mov = estado.movimientos.find((x) => x.fila === fila);

            boton.textContent = mov && esPrestamo(mov) ? "¿Seguro? Quita también la deuda"
                : mov && esReembolso(mov) ? "¿Seguro? La deuda vuelve a pendiente"
                : "¿Seguro? Toca otra vez";

            setTimeout(() => {

                if (boton.isConnected && boton.dataset.confirmando) {

                    delete boton.dataset.confirmando;

                    boton.textContent = "🗑️ Borrar";

                }

            }, 4000);

            return;

        }

        boton.disabled = true;

        boton.textContent = "⏳ Borrando...";

        try {

            const deuda = await eliminarMovimiento(fila);

            mostrarToast(
                deuda === "eliminada" ? "🗑️ Movimiento y deuda borrados"
                : deuda === "reabierta" ? "🗑️ Reembolso borrado · la deuda volvió a pendiente"
                : "🗑️ Movimiento borrado"
            );

        } catch (e) {

            errorDeAccion(e);

        }

    }

}

// =========================
// PAGAR UNA DEUDA
// =========================

async function pagarDeuda(boton) {

    if (boton.disabled) return;

    const persona = boton.dataset.persona;

    const monto = numero(boton.dataset.monto);

    // Primer toque: pide confirmar. Si no confirma en 4 segundos, vuelve a la normalidad.
    if (!boton.dataset.confirmando) {

        boton.dataset.confirmando = "1";

        boton.textContent = "¿Seguro? Toca otra vez";

        setTimeout(() => {

            if (boton.isConnected && boton.dataset.confirmando) {

                delete boton.dataset.confirmando;

                boton.textContent = "✓ Pagado";

            }

        }, 4000);

        return;

    }

    boton.disabled = true;

    boton.textContent = "⏳ Registrando...";

    try {

        await api("pagar", {
            fila: Number(boton.dataset.fila),
            persona,
            monto
        });

        // El Apps Script ya escribió el reembolso: traemos los datos actualizados
        await cargarDatos();

        renderTodo();

        animar(".tarjeta");

        mostrarToast(`✅ ${persona} pagó ${money(monto)} · reembolso registrado`);

    } catch (e) {

        if (e instanceof ErrorPin) {

            manejarError(e);

            return;

        }

        console.error(e);

        mostrarToast("❌ " + (e.message || "No se pudo marcar como pagado"));

        // Si la deuda ya no estaba pendiente, refrescamos para que desaparezca
        actualizarTodo();

    }

}

// =========================
// EVENTOS
// =========================

// =========================
// MODO DEMO
// =========================

async function entrarDemo() {

    if (modoDemo) return;

    DemoBackend.reset();

    modoDemo = true;

    estado.mes = null;

    estado.editando = null;

    estado.chat = [];

    estado.mostrarTodasLasDeudas = false;

    $("bannerDemo").hidden = false;

    estado.usuario = null;

    try {

        await cargarDatos();

    } catch (e) {

        console.error(e);

    }

    renderTodo();

    mostrarVista("dashboard");

    mostrarToast("🎬 Estás en el modo demo");

}

async function salirDemo() {

    if (!modoDemo) return;

    modoDemo = false;

    $("bannerDemo").hidden = true;

    estado.mes = null;

    estado.editando = null;

    estado.chat = [];

    // Vuelven tus datos reales (primero lo último guardado, luego se actualiza)
    const cache = leerCache();

    try { aplicarDatos(cache || {}); } catch (e) { console.error(e); }

    renderTodo();

    mostrarVista("dashboard");

    mostrarToast("Saliste del modo demo");

    actualizarTodo();

}

// Formularios plegados: se ven solo al tocar "+ Agregar"
const PLEGABLES = {
    presForm: "Nuevo presupuesto",
    tarjForm: "Agregar tarjeta",
    fijoForm: "Agregar gasto fijo",
    ingFijoForm: "Agregar ingreso fijo",
    metaForm: "Nueva meta"
};

function ponerPlegable(id, abierto) {

    const form = $(id);

    if (!form) return;

    const nota = form.nextElementSibling && form.nextElementSibling.classList.contains("presupuesto-nota")
        ? form.nextElementSibling : null;

    form.hidden = !abierto;

    if (nota) nota.hidden = !abierto;

    const b = form.previousElementSibling;

    if (b && b.classList.contains("btn-agregar")) {

        b.setAttribute("aria-expanded", abierto ? "true" : "false");

        b.textContent = abierto ? "✕ Cerrar" : "＋ " + PLEGABLES[id];

    }

}

const abrirForm = (id) => ponerPlegable(id, true);

const cerrarForm = (id) => ponerPlegable(id, false);

function iniciarPlegables() {

    Object.keys(PLEGABLES).forEach((id) => {

        const form = $(id);

        if (!form || form.dataset.plegable) return;

        form.dataset.plegable = "1";

        const b = document.createElement("button");

        b.type = "button";

        b.className = "btn-agregar";

        b.addEventListener("click", () => ponerPlegable(id, form.hidden));

        form.parentNode.insertBefore(b, form);

        ponerPlegable(id, false);

    });

}

// Botón "Deshacer" tras un registro rápido
function agregarDeshacer(temporal, esperarGuardado) {

    const caja = $("respuesta");

    const b = document.createElement("button");

    b.type = "button";

    b.className = "btn-deshacer";

    b.textContent = "↩ Deshacer";

    b.addEventListener("click", async () => {

        b.disabled = true;

        b.textContent = "⏳ Deshaciendo…";

        try {

            await esperarGuardado();

            // Espera a que la hoja real reemplace al movimiento provisional
            for (let i = 0; i < 40 && estado.movimientos.includes(temporal); i++) await dormir(300);

            const real = estado.movimientos
                .filter((x) => x !== temporal && x.tipo === temporal.tipo && x.monto === temporal.monto &&
                    x.descripcion === temporal.descripcion && x.categoria === temporal.categoria)
                .sort((a, c) => c.fila - a.fila)[0];

            if (real) await eliminarMovimiento(real.fila);

            caja.textContent = "↩ Deshecho: " + (temporal.descripcion || temporal.categoria) + " se quitó.";

            mostrarToast("↩ Movimiento deshecho");

        } catch (e) {

            b.disabled = false;

            b.textContent = "↩ Deshacer";

            errorDeAccion(e);

        }

    });

    const fila = document.createElement("div");

    fila.className = "deshacer-fila";

    fila.appendChild(b);

    caja.appendChild(fila);

}

window.addEventListener("DOMContentLoaded", () => {

    iniciarPlegables();

    aplicarTema(temaGuardado(), false);

    document.addEventListener("click", (e) => {

        const op = e.target.closest(".tema-opcion");

        if (op) aplicarTema(op.dataset.tema, true);

    });

    $("demoEntrar").addEventListener("click", entrarDemo);

    $("adminForm").addEventListener("submit", crearPersona);

    $("adminCodigo").addEventListener("input", actualizarAvisoCodigo);

    $("adminNombre").addEventListener("input", actualizarAvisoCodigo);

    $("adminSugerir").addEventListener("click", () => {

        $("adminCodigo").value = sugerirCodigo();

        actualizarAvisoCodigo();

    });

    $("adminCopiar").addEventListener("click", async () => {

        const ok = await copiarTexto($("adminListoTexto").value);

        mostrarToast(ok ? "📋 Mensaje copiado" : "No se pudo copiar");

    });

    $("adminLista").addEventListener("click", (e) => {

        const b = e.target.closest("[data-persona-accion]");

        if (b) accionPersona(b);

    });

    $("adminLista").addEventListener("input", (e) => {

        const campo = e.target.closest("[data-campo=codigo]");

        if (!campo) return;

        const tarjeta = campo.closest(".persona");

        const persona = estado.personas.find((p) => p.hoja === tarjeta.dataset.hoja);

        const avisos = avisosCodigo(campo.value, persona ? persona.nombre : "");

        const aviso = tarjeta.querySelector("[data-aviso-persona]");

        if (aviso) aviso.textContent = avisos.length ? "⚠️ Código débil: " + avisos.join(", ") + ". Se puede usar igual." : "";

    });

    $("demoSalir").addEventListener("click", salirDemo);


    $("registrar").addEventListener("click", registrarMovimiento);

    // Ejemplos tocables: llenan el cuadro de registro y llevan al usuario hasta él
    document.addEventListener("click", (e) => {

        const chip = e.target.closest("[data-ejemplo]");

        if (!chip) return;

        mostrarVista("dashboard");

        const caja = $("mensaje");

        caja.value = chip.dataset.ejemplo;

        window.scrollTo({ top: 0, behavior: "smooth" });

        caja.focus();

    });

    $("mensaje").addEventListener("keydown", (e) => {

        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {

            e.preventDefault();

            registrarMovimiento();

        }

    });

    $("filtroMes").addEventListener("change", (e) => cambiarMes(e.target.value));

    $("filtroMesStats").addEventListener("change", (e) => cambiarMes(e.target.value));

    // Gastos fijos: guardar, registrar, cambiar y quitar
    $("fijoForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const datos = {
            nombre: $("fijoNombre").value.trim(),
            categoria: nombreCategoria($("fijoCategoria").value) === "Sin categoría"
                ? "Otros"
                : nombreCategoria($("fijoCategoria").value),
            monto: Number($("fijoMonto").value),
            dia: Number($("fijoDia").value)
        };

        if (!datos.nombre || !(datos.monto > 0) || !Number.isInteger(datos.dia) || datos.dia < 1 || datos.dia > 31) {

            mostrarToast("💲 Revisa el nombre, el monto y el día (1 al 31)");

            return;

        }

        const boton = $("fijoBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarFijo(datos);

            $("fijoForm").reset(); cerrarForm("fijoForm");

            mostrarToast(`✅ Gasto fijo "${datos.nombre}" guardado`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar fijo";

        }

    });

    // Ingresos fijos: guardar
    $("ingFijoForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const fuente = nombreCategoria($("ingFijoCategoria").value);

        const datos = {
            tipo: "Ingreso",
            nombre: $("ingFijoNombre").value.trim(),
            categoria: fuente === "Sin categoría" ? "Sueldo" : fuente,
            monto: Number($("ingFijoMonto").value),
            dia: Number($("ingFijoDia").value)
        };

        if (!datos.nombre || !(datos.monto > 0) || !Number.isInteger(datos.dia) || datos.dia < 1 || datos.dia > 31) {

            mostrarToast("💼 Revisa el nombre, el monto y el día (1 al 31)");

            return;

        }

        const boton = $("ingFijoBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarFijo(datos);

            $("ingFijoForm").reset(); cerrarForm("ingFijoForm");

            mostrarToast(`✅ Ingreso fijo "${datos.nombre}" guardado`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar ingreso fijo";

        }

    });

    const clickFijo = async (e) => {

        const boton = e.target.closest("[data-fijo]");

        if (!boton || boton.disabled) return;

        const item = boton.closest("[data-nombre]");

        const nombre = item.dataset.nombre;

        const accion = boton.dataset.fijo;

        const tipo = item.dataset.tipo === "Ingreso" ? "Ingreso" : "Gasto";

        if (accion === "editar" && tipo === "Ingreso") {

            $("ingFijoNombre").value = nombre;

            $("ingFijoCategoria").value = item.dataset.categoria;

            $("ingFijoMonto").value = item.dataset.monto;

            $("ingFijoDia").value = item.dataset.dia;

            abrirForm("ingFijoForm");

            $("ingFijoMonto").focus();

            return;

        }

        if (accion === "editar") {

            $("fijoNombre").value = nombre;

            $("fijoCategoria").value = item.dataset.categoria;

            $("fijoMonto").value = item.dataset.monto;

            $("fijoDia").value = item.dataset.dia;

            abrirForm("fijoForm");

            $("fijoMonto").focus();

            return;

        }

        // Registrar y quitar piden un segundo toque para evitar errores
        if (!boton.dataset.confirmando) {

            const original = boton.textContent.trim();

            boton.dataset.confirmando = "1";

            boton.textContent = accion === "registrar"
                ? `¿Registrar ${money(item.dataset.monto)}?`
                : "¿Seguro?";

            setTimeout(() => {

                if (boton.isConnected && boton.dataset.confirmando) {

                    delete boton.dataset.confirmando;

                    boton.textContent = original;

                }

            }, 4000);

            return;

        }

        boton.disabled = true;

        boton.textContent = "⏳";

        try {

            if (accion === "registrar") {

                await api("pagarFijo", { nombre, tipo });

                await cargarDatos();

                renderTodo();

                animar(".tarjeta");

                mostrarToast(tipo === "Ingreso" ? `✅ ${nombre} registrado como ingreso` : `✅ ${nombre} registrado como gasto`);

            } else {

                await guardarFijo({ nombre, quitar: true, tipo });

                mostrarToast(`🗑️ "${nombre}" quitado de tus fijos`);

            }

        } catch (err) {

            errorDeAccion(err);

        }

    };

    $("fijos").addEventListener("click", clickFijo);

    $("ingresosFijos").addEventListener("click", clickFijo);

    // Metas de ahorro: guardar, aportar, retirar, cambiar y quitar
    $("metaForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const datos = {
            nombre: $("metaNombre").value.trim(),
            objetivo: Number($("metaObjetivo").value),
            fecha: $("metaFecha").value
        };

        if (!datos.nombre || !(datos.objetivo > 0)) {

            mostrarToast("💲 Revisa el nombre y el objetivo");

            return;

        }

        const boton = $("metaBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarMeta(datos);

            $("metaForm").reset(); cerrarForm("metaForm");

            mostrarToast(`✅ Meta "${datos.nombre}" guardada`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar meta";

        }

    });

    $("metas").addEventListener("click", async (e) => {

        const boton = e.target.closest("[data-meta]");

        if (!boton || boton.disabled) return;

        const item = boton.closest("[data-nombre]");

        const nombre = item.dataset.nombre;

        const accion = boton.dataset.meta;

        if (accion === "editar") {

            $("metaNombre").value = nombre;

            $("metaObjetivo").value = item.dataset.objetivo;

            $("metaFecha").value = item.dataset.fecha;

            abrirForm("metaForm");

            $("metaObjetivo").focus();

            return;

        }

        if (accion === "aportar" || accion === "retirar") {

            const campo = item.querySelector(".meta-monto");

            const monto = Number(campo.value);

            if (!(monto > 0)) {

                mostrarToast("💲 Escribe un monto mayor que 0");

                campo.focus();

                return;

            }

            boton.disabled = true;

            try {

                await api("aporte", { nombre, monto: accion === "aportar" ? monto : -monto });

                await cargarDatos();

                renderTodo();

                mostrarToast(accion === "aportar"
                    ? `✅ Aportaste ${money(monto)} a ${nombre}`
                    : `↩️ Retiraste ${money(monto)} de ${nombre}`);

            } catch (err) {

                boton.disabled = false;

                errorDeAccion(err);

            }

            return;

        }

        // Quitar: segundo toque para confirmar
        if (!boton.dataset.confirmando) {

            boton.dataset.confirmando = "1";

            boton.textContent = "¿Seguro?";

            setTimeout(() => {

                if (boton.isConnected && boton.dataset.confirmando) {

                    delete boton.dataset.confirmando;

                    boton.textContent = "Quitar";

                }

            }, 4000);

            return;

        }

        boton.disabled = true;

        boton.textContent = "⏳";

        try {

            await guardarMeta({ nombre, quitar: true });

            mostrarToast(`🗑️ Meta "${nombre}" quitada`);

        } catch (err) {

            errorDeAccion(err);

        }

    });

    $("avisoFijos").addEventListener("click", () => mostrarVista("fijos"));

    $("avisoTarjetas").addEventListener("click", () => mostrarVista("fijos"));

    // Tarjetas: guardar presupuesto, usar el del mes pasado, cambiar y quitar
    $("tarjForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const nombre = $("tarjNombre").value.trim();

        const presupuesto = Number($("tarjPresupuesto").value);

        const dia = $("tarjDia").value === "" ? 0 : Number($("tarjDia").value);

        if (!nombre || !(presupuesto >= 0) || !Number.isInteger(dia) || dia < 0 || dia > 31) {

            mostrarToast("💳 Revisa el nombre, el presupuesto y el día de pago (1 al 31)");

            return;

        }

        const boton = $("tarjBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        const antes = nivelesTarjetas();

        try {

            await guardarTarjeta(nombre, presupuesto, dia);

            $("tarjForm").reset(); cerrarForm("tarjForm");

            mostrarToast(`✅ Tarjeta "${nombre}" guardada`);

            const aviso = avisoCambioTarjetas(antes);

            if (aviso) setTimeout(() => mostrarToast(aviso), 1600);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar tarjeta";

        }

    });

    $("tarjetas").addEventListener("click", async (e) => {

        const ejemplo = e.target.closest("[data-ejemplo]");

        if (ejemplo) {

            $("mensaje").value = ejemplo.dataset.ejemplo;

            mostrarVista("dashboard");

            $("mensaje").focus();

            return;

        }

        const boton = e.target.closest("[data-tarj]");

        if (!boton || boton.disabled) return;

        const item = boton.closest("[data-nombre]");

        const nombre = item.dataset.nombre;

        const accion = boton.dataset.tarj;

        if (accion === "editar") {

            $("tarjNombre").value = nombre;

            $("tarjPresupuesto").value = Number(item.dataset.presupuesto) || "";

            $("tarjDia").value = item.dataset.dia || "";

            abrirForm("tarjForm");

            $("tarjPresupuesto").focus();

            return;

        }

        try {

            if (accion === "igual") {

                const antes = nivelesTarjetas();

                await guardarTarjeta(nombre, Number(item.dataset.previo));

                mostrarToast(`✅ Presupuesto de ${nombre}: ${money(item.dataset.previo)}`);

                const aviso = avisoCambioTarjetas(antes);

                if (aviso) setTimeout(() => mostrarToast(aviso), 1600);

                return;

            }

            // Quitar pide un segundo toque
            if (!boton.dataset.confirmando) {

                const original = boton.textContent.trim();

                boton.dataset.confirmando = "1";

                boton.textContent = "¿Seguro?";

                setTimeout(() => {

                    if (boton.isConnected && boton.dataset.confirmando) {

                        delete boton.dataset.confirmando;

                        boton.textContent = original;

                    }

                }, 4000);

                return;

            }

            // Con presupuesto: solo se quita el límite (la tarjeta sigue mientras tenga compras este mes)
            if (Number(item.dataset.presupuesto) > 0) await api("tarjeta", { nombre, presupuesto: 0 });

            else await api("tarjeta", { nombre, quitar: true });

            await cargarDatos();

            renderTodo();

            mostrarToast(`🗑️ Listo, quité "${nombre}" (tus compras se conservan)`);

        } catch (err) {

            errorDeAccion(err);

        }

    });

    $("chatForm").addEventListener("submit", (e) => {

        e.preventDefault();

        enviarPregunta($("chatInput").value);

    });

    $("sugerencias").addEventListener("click", (e) => {

        const chip = e.target.closest("[data-pregunta]");

        if (chip) enviarPregunta(chip.dataset.pregunta);

    });

    $("chatLimpiar").addEventListener("click", () => {

        estado.chat = [];

        renderChat();

    });

    document.querySelectorAll("nav a[data-vista]").forEach((a) => {

        a.addEventListener("click", (e) => {

            e.preventDefault();

            mostrarVista(a.dataset.vista);

        });

    });

    $("toggleDeudas").addEventListener("click", () => {

        estado.mostrarTodasLasDeudas = !estado.mostrarTodasLasDeudas;

        renderDeudas();

    });

    // Marcar una deuda como pagada (dos toques, para evitar clics por error)
    $("deudas").addEventListener("click", (e) => {

        const boton = e.target.closest(".btn-deuda");

        if (boton) pagarDeuda(boton);

    });

    // Presupuestos: guardar, cambiar y quitar
    $("presForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const categoria = nombreCategoria($("presCategoria").value);

        const limite = Number($("presLimite").value);

        if (!$("presCategoria").value.trim() || !(limite > 0)) {

            mostrarToast("💲 Elige una categoría y un límite mayor que 0");

            return;

        }

        const boton = $("presBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarPresupuesto(categoria, limite);

            $("presCategoria").value = "";

            $("presLimite").value = "";

            cerrarForm("presForm");

            mostrarToast(`✅ Presupuesto de ${categoria} guardado`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar presupuesto";

        }

    });

    $("presupuestos").addEventListener("click", async (e) => {

        const boton = e.target.closest("[data-pres]");

        if (!boton) return;

        const item = boton.closest("[data-categoria]");

        const categoria = item.dataset.categoria;

        if (boton.dataset.pres === "editar") {

            $("presCategoria").value = categoria;

            $("presLimite").value = item.dataset.limite;

            abrirForm("presForm");

            $("presLimite").focus();

            return;

        }

        if (boton.disabled) return;

        // Quitar: pide confirmar con un segundo toque
        if (!boton.dataset.confirmando) {

            boton.dataset.confirmando = "1";

            boton.textContent = "¿Seguro?";

            setTimeout(() => {

                if (boton.isConnected && boton.dataset.confirmando) {

                    delete boton.dataset.confirmando;

                    boton.textContent = "Quitar";

                }

            }, 4000);

            return;

        }

        boton.disabled = true;

        boton.textContent = "⏳";

        try {

            await guardarPresupuesto(categoria, 0);

            mostrarToast(`🗑️ Presupuesto de ${categoria} quitado`);

        } catch (err) {

            errorDeAccion(err);

        }

    });

    // Editar y borrar movimientos de la actividad reciente
    $("actividad").addEventListener("click", (e) => {

        const boton = e.target.closest("[data-accion]");

        if (boton) accionActividad(boton);

    });

    document.querySelectorAll("[data-proximamente]").forEach((a) => {

        a.addEventListener("click", (e) => {

            e.preventDefault();

            mostrarToast("🚧 Próximamente");

        });

    });

    $("bloquear").addEventListener("click", () => {

        borrarPin();

        location.reload();

    });

    $("reintentar").addEventListener("click", actualizarTodo);

    $("pinForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const pin = $("pinInput").value.trim();

        if (!pin) return;

        const boton = $("pinBoton");

        boton.disabled = true;

        boton.textContent = "Verificando...";

        try {

            const data = await api("leer", {}, pin);

            guardarPin(pin);

            aplicarDatos(data);

            guardarCache(data);

            $("pinOverlay").hidden = true;

            mostrarErrorCarga(false);

            renderTodo();

        } catch (err) {

            $("pinError").textContent = err instanceof ErrorPausa
                ? MENSAJE_PAUSA
                : err instanceof ErrorPin
                ? "Código incorrecto."
                : "No se pudo conectar. Revisa tu internet.";

        } finally {

            boton.disabled = false;

            boton.textContent = "Entrar";

        }

    });

    if (leerPin()) {

        // Muestra al instante lo último que se vio y actualiza por detrás
        const cache = leerCache();

        if (cache) {

            try {

                aplicarDatos(cache);

                renderTodo();

            } catch (e) {

                console.error(e);

            }

        }

        actualizarTodo();

    } else {

        pedirPin();

    }

});
