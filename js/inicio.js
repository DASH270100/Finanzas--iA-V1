// Finanzas IA · inicio.js — Inicio: dashboard, actividad, buscador, errores, sin conexión, Planificar en secciones, gráfico y deudas
// Se cargan en orden: nucleo → cuenta → inicio → secciones → registro → eventos (comparten el mismo ámbito global).
"use strict";

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

// Movimientos que cuentan para el saldo: desde el inicio del ciclo de sueldo (o todos)
function enCiclo(m) {

    if (!estado.ciclo) return true;

    if (estado.ciclo.fila) return m.fila >= estado.ciclo.fila;

    return !!m.fecha && m.fecha >= estado.ciclo.inicio;

}

// Saldo en efectivo de una lista: las compras con tarjeta se descuentan al pagar la tarjeta, no al comprar
function saldoDe(lista) {

    const esCompraTarjeta = (m) => !!m.medio && esGasto(m) && !esPagoTarjeta(m);

    return sumar(lista.filter(esIngreso)) - sumar(lista.filter((m) => esGasto(m) && !esCompraTarjeta(m)));

}

function renderDashboard() {

    // Ingresos y gastos reales: sin préstamos ni reembolsos.
    // El saldo es todo lo que entró menos todo lo que salió (incluye préstamos y reembolsos),
    // calculado aquí desde Movimientos y no desde la hoja Dashboards.
    // Con ciclo de sueldo activo, todo cuenta solo desde ese día; lo de antes queda «aparte».
    const hayMovimientos = estado.movimientos.length > 0;

    const lista = estado.movimientos.filter(enCiclo);

    const ingresos = hayMovimientos
        ? sumar(lista.filter(esIngresoReal))
        : valorDashboard("ingresos");

    const gastos = hayMovimientos
        ? sumar(lista.filter(esGastoReal))
        : valorDashboard("gastos");

    $("ingresos").textContent = money(ingresos);

    $("gastos").textContent = money(gastos);

    const saldo = hayMovimientos ? saldoDe(lista) : valorDashboard("saldo");

    const aparte = estado.ciclo ? saldoDe(estado.movimientos.filter((m) => !enCiclo(m))) : 0;

    const deudaTarjetas = hayMovimientos ? infoTarjetas().reduce((t, x) => t + x.deuda, 0) : 0;

    const nota = $("saldoNota");

    if (nota) {

        const partes = [];

        if (deudaTarjetas > 0.005) partes.push(`Debes ${money(deudaTarjetas)} en tarjetas`);

        if (estado.ciclo && Math.abs(aparte) > 0.005) partes.push(`Aparte: ${money(aparte)}`);

        nota.hidden = !partes.length;

        nota.textContent = partes.join(" · ");

    }

    $("hsDeudaChip").hidden = !(deudaTarjetas > 0.005);

    $("hsDeuda").textContent = money(deudaTarjetas);

    $("hsAparteChip").hidden = !(estado.ciclo && Math.abs(aparte) > 0.005);

    $("hsAparte").textContent = money(aparte);

    $("saldo").textContent = money(saldo);

    // Etiqueta y botón del ciclo
    const desde = estado.ciclo ? estado.ciclo.inicio.toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(".", "") : "";

    const etiqueta = estado.ciclo ? `Saldo desde tu sueldo del ${desde}` : "Saldo actual";

    $("saldoLabel").textContent = etiqueta;

    $("hsLabel").textContent = etiqueta;

    const mesEstado = $("mesEstado");

    if (mesEstado) {
        mesEstado.textContent = estado.ciclo
            ? `Tu mes empezó con tu sueldo del ${desde}. Antes de eso te quedaba ${money(aparte)}, que está aparte. Cuando te vuelvan a pagar, registra el nuevo mes.`
            : "¿Te pagaron? Empieza el mes con tu sueldo: tu saldo contará desde ahí y lo de antes queda aparte.";
    }

    // Resumen grande de los estilos con tarjeta de saldo
    $("hsSaldo").textContent = money(saldo);
    $("hsIngresos").textContent = money(ingresos);
    $("hsGastos").textContent = money(gastos);

}

// =========================
// ACTIVIDAD RECIENTE
// =========================

function iconoDe(m) {

    if (esPrestamo(m) || esReembolso(m)) return burbujaCategoria("préstamo", false);

    if (esPagoTarjeta(m)) return burbujaCategoria("pago de tarjeta", false);

    return burbujaCategoria(m.categoria, esIngreso(m));

}

// "Hoy", "Ayer" o "Lunes 13 oct"
function etiquetaDia(fecha) {

    const corto = formatearFecha(fecha);

    if (corto === "Hoy" || corto === "Ayer") return corto;

    const t = fecha.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "short" }).replace(".", "").replace(",", "");

    return t.charAt(0).toUpperCase() + t.slice(1);

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

// =========================
// ERRORES: si algo se rompe en el navegador, le llega a Diego (sin datos de la persona, solo el error)
// =========================

(() => {

    const vistos = new Set();

    let enviados = 0;

    function reportar(mensaje, donde) {

        if (modoDemo || !leerPin() || enviados >= 5) return;

        const clave = String(mensaje).slice(0, 120);

        if (vistos.has(clave) || /ResizeObserver|Script error\.?$/i.test(clave)) return;

        vistos.add(clave);

        enviados++;

        let tema = "";

        try { tema = localStorage.getItem(TEMA_KEY) || ""; } catch (e) {}

        api("error", {
            mensaje: String(mensaje).slice(0, 300),
            donde: String(donde || "").slice(0, 150),
            vista: document.body.dataset.vista || "",
            estilo: tema,
            dispositivo: navigator.userAgent.slice(0, 120)
        }).catch(() => {});

    }

    window.addEventListener("error", (e) => reportar(e.message || "Error", (e.filename || "").split("/").pop() + ":" + (e.lineno || "")));

    window.addEventListener("unhandledrejection", (e) => {

        const r = e.reason;

        if (r instanceof ErrorPin || (r && /fetch|network|load failed/i.test(String(r.message)))) return;

        reportar("Promesa: " + (r && r.message ? r.message : String(r)), r && r.stack ? String(r.stack).split("\n")[1] : "");

    });

})();

// =========================
// SIN CONEXIÓN: lo que se escribe sin internet se guarda y se envía al volver la señal
// =========================

const colaOffline = (() => {

    const CLAVE = "finanzas_cola";

    const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || "[]"); } catch (e) { return []; } };

    const guardar = (l) => { try { localStorage.setItem(CLAVE, JSON.stringify(l.slice(-30))); } catch (e) {} };

    let enviando = false;

    const esDeRed = (e) => !navigator.onLine || e instanceof TypeError || /failed to fetch|network|load failed|red \(/i.test(String(e && e.message));

    function pintar() {

        const n = leer().length;

        const caja = $("respuesta");

        if (!caja || !n) return;

        caja.textContent = `📴 ${n === 1 ? "1 movimiento guardado" : n + " movimientos guardados"} sin conexión. Se envían solos cuando vuelva la señal.`;

    }

    function agregar(texto, accion, datos) {

        const l = leer();

        l.push(accion ? { accion, datos, t: Date.now() } : { mensaje: texto, t: Date.now() });

        guardar(l);

        pintar();

        mostrarToast("📴 Sin conexión: lo guardé y lo envío apenas vuelva la señal");

    }

    async function enviar() {

        if (enviando || modoDemo || !navigator.onLine || !leerPin()) return;

        let l = leer();

        if (!l.length) return;

        enviando = true;

        let enviados = 0;

        try {

            while (l.length) {

                const x = l[0];

                try { await api(x.accion || "registrar", x.datos || { mensaje: x.mensaje }); }
                catch (e) { if (esDeRed(e)) break; }          // otro error (p. ej. sin monto): se descarta para no trabar la fila

                l.shift();

                guardar(l);

                enviados++;

            }

            if (enviados) {

                await cargarDatos();

                renderTodo();

                $("respuesta").textContent = l.length ? "" : `✅ Envié ${enviados === 1 ? "el movimiento" : "los " + enviados + " movimientos"} que anotaste sin conexión.`;

                mostrarToast(`✅ Se registraron ${enviados} ${enviados === 1 ? "movimiento pendiente" : "movimientos pendientes"}`);

            }

        } finally {

            enviando = false;

            pintar();

        }

    }

    window.addEventListener("online", () => setTimeout(enviar, 1500));

    return { agregar, enviar, esDeRed, pintar, pendientes: () => leer().length };

})();

// =========================
// PLANIFICAR EN SECCIONES (Pagos · Tarjetas · Ingresos · Metas)
// =========================

const plan = (() => {

    const CLAVE = "finanzas_plan";

    let actual = "pagos";

    try { const g = localStorage.getItem(CLAVE); if (["pagos", "tarjetas", "ingresos", "metas"].includes(g)) actual = g; } catch (e) {}

    function ir(nombre, guardar = true) {

        actual = nombre;

        document.querySelectorAll("#vista-fijos [data-plan]").forEach((el) => el.classList.toggle("plan-fuera", el.dataset.plan !== nombre));

        document.querySelectorAll("#planTabs [data-plan-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.planTab === nombre)));

        if (guardar) { try { localStorage.setItem(CLAVE, nombre); } catch (e) {} }

    }

    // Números en las pestañas: lo que pide atención
    function contar() {

        const poner = (tab, n) => {

            const b = document.querySelector(`#planTabs [data-plan-tab="${tab}"] .plan-num`);

            if (!b) return;

            b.hidden = !(n > 0);

            b.textContent = n > 9 ? "9+" : String(n);

        };

        try {

            const pendientes = estado.fijos.filter((f) => f.tipo !== "Ingreso" && ["vencido", "hoy", "pronto"].includes(infoFijo(f).estado)).length;

            poner("pagos", pendientes);

            poner("tarjetas", infoTarjetas().filter((t) => t.deuda > 0.005 && t.pagoDias !== null && t.pagoDias <= 3).length);

            poner("ingresos", (estado.porCobrar || []).filter((x) => !x.cobrado && x.fecha && x.fecha <= new Date()).length);

        } catch (e) {}

    }

    function iniciar() {

        if (!$("planTabs")) return;

        $("planTabs").addEventListener("click", (e) => {

            const b = e.target.closest("[data-plan-tab]");

            if (!b) return;

            ir(b.dataset.planTab);

            $("planTabs").scrollIntoView({ block: "nearest" });

        });

        ir(actual, false);

    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

    return { ir, contar };

})();

// =========================
// BUSCADOR DE MOVIMIENTOS
// =========================

const busqueda = { abierto: false, texto: "", tipo: "todo", periodo: "todo", limite: 40 };

const sinTildesB = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const busquedaActiva = () => busqueda.abierto && (!!busqueda.texto || busqueda.tipo !== "todo" || busqueda.periodo !== "todo");

function coincideBusqueda(m) {

    if (busqueda.tipo === "gasto" && !esGasto(m)) return false;

    if (busqueda.tipo === "ingreso" && !esIngreso(m)) return false;

    if (busqueda.periodo !== "todo") {

        if (!m.fecha) return false;

        const hoy = new Date();

        const k = claveMes(m.fecha);

        if (busqueda.periodo === "mes" && k !== claveMes(hoy)) return false;

        if (busqueda.periodo === "pasado" && k !== claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1))) return false;

        if (busqueda.periodo === "3m" && m.fecha < new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)) return false;

    }

    const q = sinTildesB(busqueda.texto);

    if (!q) return true;

    // Cada palabra tiene que aparecer en algún lado (descripción, categoría, tarjeta o monto)
    const donde = sinTildesB([m.descripcion, m.categoria, m.medio, m.monto, numero(m.monto).toFixed(2)].join(" "));

    return q.split(/\s+/).every((w) => donde.includes(w.replace(/^s\/\.?/, "")));

}

function renderActividad() {

    const buscando = busquedaActiva();

    const todos = [...estado.movimientos]
        .filter((m) => !buscando || coincideBusqueda(m))
        .sort((a, b) =>
            ((b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0)) ||
            (b.idx - a.idx)
        );

    const recientes = todos.slice(0, buscando ? busqueda.limite : 8);

    // Resumen de lo encontrado
    if (buscando) {

        const g = sumar(todos.filter(esGastoReal)), i = sumar(todos.filter(esIngresoReal));

        $("buscarResumen").textContent = todos.length
            ? `${todos.length} ${todos.length === 1 ? "movimiento" : "movimientos"}` + (g > 0 ? ` · gastos ${money(g)}` : "") + (i > 0 ? ` · ingresos ${money(i)}` : "")
            : "";

    } else if ($("buscarResumen")) $("buscarResumen").textContent = "";

    if (buscando && !todos.length) {

        $("actividad").innerHTML = `<div class="vacio-guia"><div class="vacio-icono">🔍</div><strong>No encontré nada</strong><p>Prueba con otra palabra o cambia el periodo.</p></div>`;

        return;

    }

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

    // Agrupado por día, con lo gastado ese día
    const grupos = [];

    recientes.forEach((m) => {

        const k = m.fecha ? m.fecha.toDateString() : "sin-fecha";

        let g = grupos.find((x) => x.k === k);

        if (!g) { g = { k, fecha: m.fecha, lista: [] }; grupos.push(g); }

        g.lista.push(m);

    });

    const gastadoElDia = (fecha) => fecha
        ? sumar(estado.movimientos.filter((x) => x.fecha && x.fecha.toDateString() === fecha.toDateString() && esGastoReal(x)))
        : 0;

    const fila = (m) => estado.editando === m.fila ? formularioEdicion(m) : `
        <div class="movimiento mov-fila" data-fila="${m.fila}">

            <div class="mov-toque" role="button" tabindex="0" aria-expanded="false"
                aria-label="${esc(m.descripcion || m.categoria)}, ${esIngreso(m) ? "ingreso" : "gasto"} de ${money(m.monto)}. Toca para editar o borrar">

                ${iconoDe(m)}

                <span class="mov-txt">
                    <strong>${esc(m.descripcion || m.categoria)}</strong>
                    <small>${esc(m.categoria)}${m.medio ? ` · ${esc(m.medio)}` : ""}</small>
                </span>

                <span class="mov-monto ${esIngreso(m) ? "ingreso" : "gasto"}">${esIngreso(m) ? "+" : "−"} ${money(m.monto)}</span>

            </div>

            <div class="movimiento-acciones">

                <button class="mov-btn" type="button" data-accion="editar"
                    aria-label="Editar movimiento">${ico("pencil")} Editar</button>

                <button class="mov-btn mov-btn-borrar" type="button" data-accion="borrar"
                    aria-label="Borrar movimiento">${ico("trash")} Borrar</button>

            </div>

        </div>`;

    $("actividad").innerHTML = grupos.map((g) => {

        const gastado = gastadoElDia(g.fecha);

        return `
        <div class="act-dia">
            <span>${g.fecha ? esc(etiquetaDia(g.fecha)) : esc(g.lista[0].fechaTexto || "Sin fecha")}</span>
            ${gastado > 0 ? `<span>Gastaste ${money(gastado)}</span>` : ""}
        </div>
        ${g.lista.map(fila).join("")}`;

    }).join("") + `<datalist id="listaCategorias">${opcionesCategorias}</datalist>` +
        (buscando && todos.length > recientes.length
            ? `<button type="button" class="mov-btn buscar-mas" data-buscar-mas>Mostrar ${Math.min(40, todos.length - recientes.length)} más</button>` : "");

}

// Tocar una fila abre sus acciones (y cierra las demás)
function alternarFila(toque) {

    const fila = toque.closest(".mov-fila");

    const abrir = !fila.classList.contains("abierto");

    $("actividad").querySelectorAll(".mov-fila.abierto").forEach((f) => {

        f.classList.remove("abierto");

        f.querySelector(".mov-toque").setAttribute("aria-expanded", "false");

    });

    if (abrir) {

        fila.classList.add("abierto");

        toque.setAttribute("aria-expanded", "true");

    }

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

    if (clave === "ciclo") return estado.movimientos.filter((m) => esGastoReal(m) && enCiclo(m));

    return estado.movimientos.filter((m) =>
        esGastoReal(m) &&
        (clave === "all" || (m.fecha && claveMes(m.fecha) === clave))
    );

}

// Periodo del inicio (gráfico y categorías destacadas): con «nuevo mes» activo, por defecto desde el sueldo.
// Estadísticas sigue por mes de calendario (estado.mes).
function periodoInicio() {

    const v = estado.mesInicio;

    if (v === "ciclo") return estado.ciclo ? "ciclo" : estado.mes;

    if (v) return v;

    return estado.ciclo ? "ciclo" : estado.mes;

}

const fechaSueldo = (d) => d.toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(".", "");

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

    const deSueldo = estado.ciclo ? `<option value="ciclo">Desde mi sueldo (${fechaSueldo(estado.ciclo.inicio)})</option>` : "";

    $("filtroMes").innerHTML = deSueldo + opciones;

    $("filtroMes").value = periodoInicio();

    $("filtroMesStats").innerHTML = opciones;

    $("filtroMesStats").value = estado.mes;

}

// Categorías destacadas (burbujas / tarjetas de los estilos nuevos)
function renderCatTiles(grupos) {

    const caja = $("catTiles");

    if (!caja) return;

    const top = grupos.slice(0, 5);

    caja.hidden = top.length === 0;

    caja.innerHTML = top.map((g, i) => `
        <div class="cat-tile c${i % 5}">
            <span class="ct-ico">${ico(icoCategoria(g.nombre).nombre)}</span>
            <strong>S/ ${Math.round(g.total)}</strong>
            <small>${esc(g.nombre)}</small>
        </div>
    `).join("");

}

function renderResumenPeriodo() {

    const periodo = periodoInicio();

    const gastos = gastosDelPeriodo(periodo);

    const total = sumar(gastos);

    const grupos = renderGrafico(gastos);

    renderCatTiles(grupos);

    $("totalGastado").textContent = money(total);

    $("subtituloGrafico").textContent = periodo === "all"
        ? "Distribución de todos tus gastos"
        : periodo === "ciclo"
            ? `Lo que gastaste desde tu sueldo del ${fechaSueldo(estado.ciclo.inicio)}`
            : "Distribución de tus gastos en " + nombreMes(periodo);

    if (!grupos.length) {

        $("insightTitulo").textContent = estado.movimientos.length
            ? "Sin gastos en este periodo"
            : "Tu análisis aparecerá aquí";

        $("insightTexto").textContent = estado.movimientos.length
            ? (periodo === "ciclo" ? "Aún no gastas nada de tu sueldo. Lo que registres aparecerá aquí." : "Prueba con otro mes o registra un gasto.")
            : "Registra tu primer gasto y te diré en qué se va tu plata.";

        return;

    }

    const top = grupos[0];

    const pct = total > 0 ? Math.round((top.total / total) * 100) : 0;

    let texto = `${money(top.total)} · ${pct}% de tus gastos`;

    if (periodo !== "all" && periodo !== "ciclo") {

        const [y, m] = periodo.split("-").map(Number);

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
