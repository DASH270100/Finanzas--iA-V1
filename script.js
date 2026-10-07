// Finanzas IA - Script v3.0
// Backend: Google Apps Script protegido con PIN (el Sheet ya no se lee desde el navegador).
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
    mostrarTodasLasDeudas: false
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

const esGastoReal = (m) => esGasto(m) && !esPrestamo(m);

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

// =========================
// API (Google Apps Script)
// =========================

// Se envía como text/plain para evitar preflight de CORS con Apps Script
async function api(accion, extra = {}, pin = leerPin()) {

    const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ accion, pin, ...extra })
    });

    if (!r.ok) throw new Error("Error de red (" + r.status + ")");

    const data = await r.json();

    if (!data.ok) {

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

    const movimientos = sinEncabezado(data.movimientos || [], "fecha")
        .map((f, idx) => ({
            idx,
            fechaTexto: String(f[0] ?? "").replace(/"/g, "").trim(),
            fecha: parseFecha(f[0]),
            tipo: String(f[1] ?? "").trim(),
            categoria: String(f[2] ?? "").trim(),
            descripcion: String(f[3] ?? "").trim(),
            monto: numero(f[4])
        }))
        .filter((m) => m.fechaTexto !== "" || m.descripcion !== "");

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

    return { movimientos, deudas, dashboard: data.dashboard || [] };

}

function aplicarDatos(data) {

    const n = normalizarDatos(data);

    estado.movimientos = n.movimientos;

    estado.deudas = n.deudas;

    estado.dashboard = n.dashboard;

}

async function cargarDatos() {

    const data = await api("leer");

    aplicarDatos(data);

    guardarCache(data);

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
        ? sumar(estado.movimientos.filter(esIngreso)) - sumar(estado.movimientos.filter(esGasto))
        : valorDashboard("saldo");

    $("saldo").textContent = money(saldo);

}

// =========================
// ACTIVIDAD RECIENTE
// =========================

function iconoDe(m) {

    if (esPrestamo(m) || esReembolso(m)) return "🤝";

    return ICONOS[m.categoria.toLowerCase()] || (esIngreso(m) ? "💵" : "📦");

}

function renderActividad() {

    const recientes = [...estado.movimientos]
        .sort((a, b) =>
            ((b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0)) ||
            (b.idx - a.idx)
        )
        .slice(0, 5);

    if (!recientes.length) {

        $("actividad").innerHTML = '<p class="vacio">Aún no hay movimientos registrados.</p>';

        return;

    }

    $("actividad").innerHTML = recientes.map((m) => `
        <div class="movimiento">

            <div class="movimiento-superior">

                <div class="movimiento-nombre">
                    ${iconoDe(m)} ${esc(m.descripcion || m.categoria)}
                </div>

                <div class="movimiento-monto ${esIngreso(m) ? "ingreso" : "gasto"}">
                    ${esIngreso(m) ? "+" : "-"} ${money(m.monto)}
                </div>

            </div>

            <div class="movimiento-inferior">

                <span>${esc(m.categoria)}</span>

                <span>${esc(formatearFecha(m.fecha, m.fechaTexto))}</span>

            </div>

        </div>
    `).join("");

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

    $("filtroMes").innerHTML =
        lista.map((c) => `<option value="${c}">${esc(nombreMes(c))}</option>`).join("") +
        '<option value="all">Todo el historial</option>';

    $("filtroMes").value = estado.mes;

}

function renderResumenPeriodo() {

    const gastos = gastosDelPeriodo(estado.mes);

    const total = sumar(gastos);

    const grupos = renderGrafico(gastos);

    $("totalGastado").textContent = money(total);

    $("subtituloGrafico").textContent = estado.mes === "all"
        ? "Distribución de todos tus gastos"
        : "Distribución de tus gastos en " + nombreMes(estado.mes);

    if (!grupos.length) {

        $("insightTitulo").textContent = "Sin gastos en este periodo";

        $("insightTexto").textContent = "Registra un movimiento y aquí verás tu análisis.";

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
        : '<p class="vacio">🎉 No tienes deudas pendientes.</p>';

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
// RENDER GENERAL
// =========================

function renderTodo() {

    renderDashboard();

    renderActividad();

    actualizarSelectorMes();

    renderResumenPeriodo();

    renderDeudas();

}

function mostrarErrorCarga(mostrar) {

    $("errorCarga").hidden = !mostrar;

}

function manejarError(e) {

    if (e instanceof ErrorPin) {

        borrarPin();

        pedirPin("PIN incorrecto. Inténtalo de nuevo.");

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

// Espera a que Make escriba la fila en el Sheet (en vez de un tiempo fijo)
async function esperarNuevos(cantidadAntes) {

    for (let i = 0; i < 10; i++) {

        await dormir(1500);

        await cargarDatos();

        if (estado.movimientos.length > cantidadAntes) {

            await dormir(1500); // por si el mensaje generó más de una fila

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
        `${esIngreso(m) ? "📈" : "📉"} ${esc(m.descripcion || m.categoria)} · ${esc(m.categoria)} · ` +
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

    const boton = $("registrar");

    const textoBoton = $("textoBoton");

    boton.disabled = true;

    textoBoton.textContent = "⏳ Registrando...";

    $("respuesta").textContent = "🤖 Analizando movimiento...";

    try {

        // Punto de partida fresco: así sabemos exactamente qué filas son nuevas
        await cargarDatos();

        const cantidadAntes = estado.movimientos.length;

        await api("registrar", { mensaje: texto });

        $("mensaje").value = "";

        $("respuesta").textContent = "📊 Guardando en la hoja...";

        const nuevos = await esperarNuevos(cantidadAntes);

        estado.mes = null; // vuelve al mes más reciente con gastos

        renderTodo();

        animar(".tarjeta");

        mostrarRegistrados(nuevos);

        mostrarToast(nuevos === null ? "⏳ Enviado, aún procesando" : "✅ Movimiento registrado");

    } catch (e) {

        if (e instanceof ErrorPin) {

            manejarError(e);

        } else {

            console.error(e);

            $("respuesta").textContent = "⚠️ No se pudo registrar. Tu texto sigue abajo, inténtalo otra vez.";

            $("mensaje").value = texto;

            mostrarToast("❌ No se pudo registrar el movimiento");

        }

    } finally {

        boton.disabled = false;

        textoBoton.textContent = "➕ Registrar movimiento";

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

window.addEventListener("DOMContentLoaded", () => {

    $("registrar").addEventListener("click", registrarMovimiento);

    $("mensaje").addEventListener("keydown", (e) => {

        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {

            e.preventDefault();

            registrarMovimiento();

        }

    });

    $("filtroMes").addEventListener("change", (e) => {

        estado.mes = e.target.value;

        renderResumenPeriodo();

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

            $("pinError").textContent = err instanceof ErrorPin
                ? "PIN incorrecto."
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
