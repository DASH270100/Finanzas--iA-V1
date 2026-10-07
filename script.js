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
    mostrarTodasLasDeudas: false,
    editando: null,
    presupuestos: []
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
            monto: numero(f[4])
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

    return { movimientos, deudas, dashboard: data.dashboard || [], presupuestos };

}

function aplicarDatos(data) {

    const n = normalizarDatos(data);

    estado.movimientos = n.movimientos;

    estado.deudas = n.deudas;

    estado.dashboard = n.dashboard;

    estado.presupuestos = n.presupuestos;

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

                <span>${esc(m.categoria)}</span>

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
// ESTADÍSTICAS
// =========================

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

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

        $("statTiles").innerHTML = '<p class="vacio">Sin movimientos en este periodo.</p>';

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

function mostrarVista(nombre) {

    if (nombre !== "dashboard" && nombre !== "estadisticas") nombre = "dashboard";

    $("vista-dashboard").hidden = nombre !== "dashboard";

    $("vista-estadisticas").hidden = nombre !== "estadisticas";

    document.querySelectorAll("nav a[data-vista]").forEach((a) => {

        const activo = a.dataset.vista === nombre;

        a.classList.toggle("active", activo);

        if (activo) a.setAttribute("aria-current", "page");

        else a.removeAttribute("aria-current");

    });

    // Los gráficos se dibujan con la pestaña visible (si no, salen sin tamaño)
    if (nombre === "estadisticas") renderEstadisticas();

    else renderResumenPeriodo();

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
// RENDER GENERAL
// =========================

function renderTodo() {

    renderDashboard();

    renderActividad();

    actualizarSelectorMes();

    renderResumenPeriodo();

    renderEstadisticas();

    renderPresupuestos();

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
            '<p class="vacio">Aún no tienes presupuestos. Elige una categoría abajo y fija su límite.</p>';

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

    await api("borrar", { fila, orig: origenDe(m) });

    estado.editando = null;

    await cargarDatos();

    renderTodo();

    animar(".tarjeta");

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

            boton.textContent = "¿Seguro? Toca otra vez";

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

            await eliminarMovimiento(fila);

            mostrarToast("🗑️ Movimiento borrado");

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

window.addEventListener("DOMContentLoaded", () => {

    $("registrar").addEventListener("click", registrarMovimiento);

    $("mensaje").addEventListener("keydown", (e) => {

        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {

            e.preventDefault();

            registrarMovimiento();

        }

    });

    $("filtroMes").addEventListener("change", (e) => cambiarMes(e.target.value));

    $("filtroMesStats").addEventListener("change", (e) => cambiarMes(e.target.value));

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
