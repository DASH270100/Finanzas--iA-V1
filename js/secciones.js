// Finanzas IA · secciones.js — Estadísticas, asistente IA, gastos fijos, cuotas, tarjetas y metas
// Se cargan en orden: nucleo → cuenta → inicio → secciones → registro → eventos (comparten el mismo ámbito global).
"use strict";

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

    $("masDetalles").hidden = !(gastos.length || ingresos.length);

    if (!gastos.length && !ingresos.length) {

        $("statTiles").className = "stat-tiles";

        $("statExtra").innerHTML = "";

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

    const ahorro = totalIngresos - totalGastos;

    const interesMes = sumar(delPeriodo(esInteres));

    // Mes anterior: para comparar y para la línea punteada
    const cAnt = claveMes(new Date(y, mm - 2, 1));

    const gastosAnt = estado.movimientos.filter((m) => esGastoReal(m) && m.fecha && claveMes(m.fecha) === cAnt);

    const totalAnt = sumar(gastosAnt);

    const nombreAnt = nombreMes(cAnt).split(" ")[0].toLowerCase();

    // Gasto acumulado día a día (este mes y el anterior)
    const acumulado = (lista, dias) => {

        const porDia = new Array(dias).fill(0);

        lista.forEach((m) => { const d = m.fecha.getDate(); if (d <= dias) porDia[d - 1] += m.monto; });

        let s = 0;

        return porDia.map((v) => (s += v));

    };

    const acum = acumulado(gastos, diasTranscurridos);

    const diasAnt = new Date(y, mm - 1, 0).getDate();

    const acumAnt = gastosAnt.length ? acumulado(gastosAnt, diasAnt) : [];

    // Mini-gráfico: x = día del mes, y = acumulado
    function sparkline() {

        const tope = Math.max(esActual ? proyeccion : totalGastos, acumAnt.length ? acumAnt[acumAnt.length - 1] : 0, 1);

        const punto = (v, i, total) => `${((i + 1) / total) * 100},${32 - (v / tope) * 30}`;

        const linea = (arr, total) => "0,32 " + arr.map((v, i) => punto(v, i, total)).join(" ");

        const actual = linea(acum, diasMes);

        const ultimoX = (acum.length / diasMes) * 100, ultimoY = 32 - ((acum[acum.length - 1] || 0) / tope) * 30;

        return `<svg class="st-spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
            ${acumAnt.length ? `<polyline class="st-spark-ant" points="${linea(acumAnt, diasAnt)}"/>` : ""}
            ${esActual ? `<line class="st-spark-proy" x1="${ultimoX}" y1="${ultimoY}" x2="100" y2="${32 - (proyeccion / tope) * 30}"/>` : ""}
            <polygon class="st-spark-area" points="${actual} ${ultimoX},32"/>
            <polyline class="st-spark-linea" points="${actual}"/>
        </svg>`;

    }

    // Mini-barras por día de la semana (lunes primero)
    const porDiaSemana = new Array(7).fill(0);

    gastos.forEach((m) => { porDiaSemana[m.fecha.getDay()] += m.monto; });

    const ordenLunes = [1, 2, 3, 4, 5, 6, 0];

    const maxDia = Math.max(...porDiaSemana);

    const diaCaro = maxDia > 0 ? DIAS_SEMANA[porDiaSemana.indexOf(maxDia)] : null;

    const barrasSemana = `<div class="st-semana" aria-hidden="true">${ordenLunes.map((d) => {
        const h = maxDia > 0 ? Math.max(6, Math.round((porDiaSemana[d] / maxDia) * 100)) : 6;
        return `<span class="${porDiaSemana[d] === maxDia && maxDia > 0 ? "top" : ""}"><i style="height:${h}%"></i><b>${"DLMMJVS"[d]}</b></span>`;
    }).join("")}</div>`;

    // Comparación con el mes anterior (en curso: contra el mismo día del mes pasado)
    let chip = "";

    if (totalAnt > 0) {

        const base = esActual ? (acumAnt[Math.min(diasTranscurridos, acumAnt.length) - 1] || 0) : totalAnt;

        if (base > 0) {

            const dif = Math.round(((totalGastos - base) / base) * 100);

            chip = `<span class="st-chip ${dif > 0 ? "sube" : "baja"}">${ico(dif > 0 ? "trending-up" : "trending-down")} ${Math.abs(dif)}% ${dif > 0 ? "más" : "menos"} que ${nombreAnt}</span>`;

        }

    }

    const pctGastado = totalIngresos > 0 ? Math.min(100, Math.round((totalGastos / totalIngresos) * 100)) : 100;

    const hero = `
        <div class="st-hero ${ahorro >= 0 ? "positivo" : "negativo"}">
            <div class="st-hero-top">
                <span class="st-label">${ahorro >= 0 ? "Te sobró" : "Gastaste de más"}${esActual ? " por ahora" : ""}</span>
                ${chip}
            </div>
            <div class="st-hero-num">${money(Math.abs(ahorro))}</div>
            <div class="st-barra" role="img" aria-label="Gastaste ${pctGastado}% de lo que entró"><span style="width:${pctGastado}%"></span></div>
            <div class="st-barra-leyenda">
                <span><i class="g"></i>Salió <b>${money(totalGastos)}</b></span>
                <span><i class="i"></i>Entró <b>${money(totalIngresos)}</b></span>
            </div>
        </div>`;

    const tProyeccion = `
        <div class="st-tile st-ancho">
            <div class="st-tile-cab">${ico("chart-column")}<span>${esActual ? "Proyección a fin de mes" : "Gasto del mes"}</span></div>
            <div class="st-tile-num">${money(esActual ? proyeccion : totalGastos)}</div>
            <div class="st-tile-nota">${esActual ? `Si sigues a este ritmo · llevas ${money(totalGastos)} en ${diasTranscurridos} ${diasTranscurridos === 1 ? "día" : "días"}` : "Gastos reales del mes"}</div>
            ${sparkline()}
            <div class="st-spark-leyenda"><span><i class="act"></i>${nombreMes(periodo).split(" ")[0]}</span>${acumAnt.length ? `<span><i class="ant"></i>${nombreAnt.charAt(0).toUpperCase() + nombreAnt.slice(1)}</span>` : ""}</div>
        </div>`;

    const tPromedio = `
        <div class="st-tile">
            <div class="st-tile-cab">${ico("calendar-days")}<span>Promedio diario</span></div>
            <div class="st-tile-num">${money(promedio)}</div>
            <div class="st-tile-nota">${diaCaro ? `Gastas más los ${diaCaro}` : "Sin gastos"}</div>
            ${barrasSemana}
        </div>`;

    const tMayor = `
        <div class="st-tile">
            <div class="st-tile-cab">${ico("receipt")}<span>Mayor gasto</span></div>
            <div class="st-mayor">
                ${mayor ? burbujaCategoria(mayor.categoria, false) : ""}
                <div>
                    <div class="st-tile-num">${mayor ? money(mayor.monto) : "—"}</div>
                    <div class="st-tile-nota">${mayor ? esc(mayor.descripcion || mayor.categoria) + " · " + esc(formatearFecha(mayor.fecha, mayor.fechaTexto)) : "Sin gastos"}</div>
                </div>
            </div>
        </div>`;

    const tInteres = interesMes > 0.005 ? `
        <div class="st-tile st-alerta">
            <div class="st-tile-cab">${ico("percent")}<span>Intereses de tarjeta</span></div>
            <div class="st-tile-num">${money(interesMes)}</div>
            <div class="st-tile-nota">Plata que se va al banco. Pagando el total a tiempo se evita.</div>
        </div>` : "";

    const caja = $("statTiles");

    caja.className = "stats-nuevo";

    caja.innerHTML = hero + `<div class="st-grid">${tProyeccion}${tPromedio}${tMayor}${tInteres}</div>`;

    $("statExtra").innerHTML = "";

}

// =========================
// PESTAÑAS (Dashboard / Estadísticas)
// =========================

const VISTAS = ["dashboard", "estadisticas", "fijos", "asistente", "configuracion", "compartido"];

function mostrarVista(nombre) {

    if (!VISTAS.includes(nombre)) nombre = "dashboard";

    VISTAS.forEach((v) => { $("vista-" + v).hidden = v !== nombre; });

    // Los estilos nuevos cambian la cabecera según la pestaña
    document.body.dataset.vista = nombre;

    const TITULOS = { estadisticas: "Estadísticas", fijos: "Planificar", asistente: "Asistente", configuracion: "Configuración", compartido: "Cuenta compartida" };

    $("tituloVista").textContent = TITULOS[nombre] || "";

    document.querySelectorAll("nav a[data-vista]").forEach((a) => {

        // La cuenta compartida vive en el inicio (se entra por el switch)
        const activo = a.dataset.vista === (nombre === "compartido" ? "dashboard" : nombre);

        a.classList.toggle("active", activo);

        if (activo) a.setAttribute("aria-current", "page");

        else a.removeAttribute("aria-current");

    });

    // Los gráficos se dibujan con la pestaña visible (si no, salen sin tamaño)
    if (nombre === "estadisticas") renderEstadisticas();

    else if (nombre === "dashboard") renderResumenPeriodo();

    else if (nombre === "asistente") renderChat();

    else if (nombre === "configuracion") renderConfig();

    else if (nombre === "compartido" && window.compartido) compartido.render();

    document.querySelectorAll("#switchCuenta [data-cuenta]").forEach((b) => {

        b.setAttribute("aria-selected", String((b.dataset.cuenta === "compartida") === (nombre === "compartido")));

    });

    window.scrollTo({ top: 0 });

}

// «desde»: qué selector lo cambió ("inicio" = el del gráfico del inicio, que además tiene «Desde mi sueldo»)
function cambiarMes(valor, desde) {

    if (desde === "inicio") {

        estado.mesInicio = valor;

        if (valor !== "ciclo") estado.mes = valor;

    } else {

        estado.mes = valor;

        // Sin «nuevo mes», los dos selectores van juntos
        if (!estado.ciclo) estado.mesInicio = null;

    }

    $("filtroMes").value = periodoInicio();

    $("filtroMesStats").value = estado.mes;

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

    if (f.tipo === "Cuota" && f.cuotas > 0 && f.pagadas >= f.cuotas) {

        return { estado: "terminado", texto: "¡Terminaste de pagar este préstamo! 🎉" };

    }

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

                <span class="fijo-nombre">${burbujaCategoria(f.nombre + " " + (f.categoria || ""), ing, "chica")}${esc(f.nombre)}</span>

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

// ---- Matemática de préstamos (cuota fija; TEA = tasa efectiva anual en %) ----
const tasaMensual = (tea) => tea > 0 ? Math.pow(1 + tea / 100, 1 / 12) - 1 : 0;

const principalCuotas = (c, n, i) => i > 0 ? c * (1 - Math.pow(1 + i, -n)) / i : c * n;

function cuotasQueFaltan(B, c, i) {

    if (B <= 0.005) return 0;

    if (i <= 0) return Math.ceil(B / c - 1e-9);

    if (B * i >= c) return 600;

    return Math.min(600, Math.ceil(-Math.log(1 - B * i / c) / Math.log(1 + i) - 1e-9));

}

// Cuántas cuotas faltan, de cuánto es la última y cuánto del total son intereses
function planPrestamo(B, c, i) {

    const n = cuotasQueFaltan(B, c, i);

    if (n === 0) return { n: 0, ultima: 0, total: 0, intereses: 0 };

    let b = B;

    for (let k = 0; k < n - 1; k++) b = b * (1 + i) - c;

    const ultima = Math.max(0, i > 0 ? b * (1 + i) : b);

    const total = c * (n - 1) + ultima;

    return { n, ultima, total, intereses: Math.max(0, total - B) };

}

// Estado de un préstamo: capital que falta (saldo) y capital total, aunque venga de la versión sin intereses
function datosPrestamo(f) {

    const i = tasaMensual(f.tea);

    const saldo = f.saldo != null ? f.saldo : Math.max(0, f.cuotas - f.pagadas) * f.monto;

    const capital = f.capital > 0 ? f.capital : f.cuotas * f.monto;

    return { i, saldo, capital };

}

// Préstamo en cuotas: cuánto llevas pagado, cuánto falta y botones para pagar la cuota o adelantar
function cuotaHTML(f) {

    const { i, saldo, capital } = datosPrestamo(f);

    const plan = planPrestamo(saldo, f.monto, i);

    const pct = capital > 0 ? Math.max(0, Math.min(100, Math.round(((capital - saldo) / capital) * 100))) : 0;

    const termino = f.info.estado === "terminado";

    const hecho = f.info.estado === "hecho";

    const total = f.cuotas || 0;

    const ultimaTxt = plan.n > 1 && Math.abs(plan.ultima - f.monto) > 0.5 ? ` (la última de ${money(plan.ultima)})` : "";

    return `
        <div class="fijo-item cuota-item estado-${f.info.estado}" data-nombre="${esc(f.nombre)}" data-tipo="Cuota"
            data-monto="${f.monto}" data-dia="${f.dia}" data-cuotas="${total}" data-pagadas="${f.pagadas}"
            data-tea="${f.tea}" data-saldo="${saldo}">

            <div class="fijo-top">

                <span class="fijo-nombre">${burbujaCategoria("banco", false, "chica")}${esc(f.nombre)}${f.tea > 0 ? ` <small class="cuota-tea">TEA ${f.tea}%</small>` : ""}</span>

                <span class="fijo-monto">${money(f.monto)} <small>al mes</small></span>

            </div>

            <div class="fijo-detalle">
                ${termino ? `Pagaste todo el préstamo` : `Llevas <strong>${f.pagadas} de ${total}</strong> cuotas · te faltan ${plan.n}${ultimaTxt}`}
            </div>

            ${termino ? "" : `<div class="fijo-detalle cuota-resta">Por pagar: <strong>${money(plan.total)}</strong>${i > 0 ? ` · de eso, unos ${money(plan.intereses)} son intereses` : ""}</div>`}

            <div class="presupuesto-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Avance de ${esc(f.nombre)}">

                <div class="presupuesto-progreso nivel-ok cuota-progreso" style="width:${pct}%"></div>

            </div>

            <div class="fijo-estado">${esc(f.info.texto)}</div>

            <div class="fijo-acciones">

                <button class="mov-btn mov-btn-primario" type="button" data-fijo="registrar"
                    ${hecho || termino ? "disabled" : ""}>
                    ${termino ? "✓ Terminado" : hecho ? "✓ Cuota pagada" : `Pagar cuota (${money(f.monto)})`}
                </button>

                ${termino ? "" : `<button class="mov-btn" type="button" data-fijo="adelantar">Adelantar pago</button>`}

                <button class="mov-btn" type="button" data-fijo="editar">Cambiar</button>

                <button class="mov-btn mov-btn-borrar" type="button" data-fijo="quitar">Quitar</button>

            </div>

            ${termino ? "" : `
            <form class="tarj-pago-form cuota-adelanto" data-adelanto hidden>
                <input type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="¿Cuánto adelantas? Ej: 1000" aria-label="Monto a adelantar" required>
                <button type="submit" class="mov-btn mov-btn-primario">Adelantar</button>
                <small class="adelanto-vista" aria-live="polite"></small>
            </form>`}

        </div>
    `;

}

// Vista previa del adelanto: cuántas cuotas quedarían y cuánto ahorras en intereses
function vistaAdelanto(item, monto) {

    const c = Number(item.dataset.monto);

    const i = tasaMensual(Number(item.dataset.tea) || 0);

    const B = Number(item.dataset.saldo);

    if (!(monto > 0)) return "";

    if (monto > B + 0.005) return `Solo te faltan ${money(B)} de capital`;

    const antes = planPrestamo(B, c, i);

    const despues = planPrestamo(Math.max(0, B - monto), c, i);

    const txt = despues.n === 0 ? "¡Con eso terminarías de pagar el préstamo! 🎉"
        : `Te quedarían ${despues.n} ${despues.n === 1 ? "cuota" : "cuotas"} (antes ${antes.n})`;

    const ahorro = antes.intereses - despues.intereses;

    return txt + (i > 0 && ahorro > 0.5 ? ` · ahorras unos ${money(ahorro)} en intereses` : "");

}

function renderFijos() {

    const todos = estado.fijos
        .map((f) => ({ ...f, info: infoFijo(f) }))
        .sort((a, b) => a.dia - b.dia);

    const cuotas = todos.filter((f) => f.tipo === "Cuota");

    const items = todos.filter((f) => f.tipo === "Gasto");

    // Préstamos en cuotas ("Lo que debo")
    const pendiente = cuotas.reduce((t, f) => { const d = datosPrestamo(f); return t + planPrestamo(d.saldo, f.monto, d.i).total; }, 0);

    const activos = cuotas.filter((f) => f.info.estado !== "terminado").length;

    $("subtituloCuotas").textContent = cuotas.length
        ? `${activos} ${activos === 1 ? "préstamo activo" : "préstamos activos"} · te faltan ${money(pendiente)} en total`
        : "Préstamos con cuotas fijas: ve cuánto te falta y paga con un toque.";

    $("cuotas").innerHTML = cuotas.length
        ? cuotas.map(cuotaHTML).join("")
        : vacioGuia("🏦", "Aún no tienes préstamos",
            "Si pagas un préstamo en cuotas (moto, celular, banco), agrégalo abajo. Te aviso cada mes y ves cuánto te falta.");

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

    renderAvisoFijos([...items, ...cuotas], ingresos);

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
// Cada compra se cuenta cuando la haces y sube lo que debes; pagar la tarjeta baja la deuda
// (no cuenta como gasto nuevo). La deuda no se reinicia sola cada mes. El límite lo cambias cuando quieras.
// =========================

const ORDEN_NIVEL_TARJETA = { sin: 0, ok: 1, alerta: 2, limite: 3, exceso: 4 };

const claveTarjeta = (n) => String(n ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function infoTarjetas() {

    const hoy = new Date();

    const actual = claveMes(hoy);

    const mapa = new Map();

    const tomar = (nombre) => {

        const k = claveTarjeta(nombre);

        if (!k) return null;

        if (!mapa.has(k)) mapa.set(k, { nombre: String(nombre).trim(), presupuesto: 0, dia: 0, enHoja: false, compras: 0, pagos: 0, mes: 0, pagadoMes: 0, lista: [], interesMes: 0 });

        return mapa.get(k);

    };

    estado.tarjetas.forEach((t) => { const x = tomar(t.nombre); x.presupuesto = t.presupuesto; x.dia = t.dia; x.proximo = t.proximo || null; x.enHoja = true; });

    estado.movimientos.forEach((m) => {

        if (!m.medio || !esGasto(m)) return;

        const t = tomar(m.medio);

        if (!t) return;

        const esteMes = !!m.fecha && claveMes(m.fecha) === actual;

        if (esPagoTarjeta(m)) {

            t.pagos += m.monto;

            if (esteMes) t.pagadoMes += m.monto;

            return;

        }

        t.compras += m.monto;

        if (m.fecha) t.lista.push({ f: m.fecha, m: m.monto });

        if (esteMes) t.mes += m.monto;

        if (esteMes && esInteres(m)) t.interesMes += m.monto;

    });

    return [...mapa.values()].map((t) => {

        // Lo que debes ahora: todas las compras menos todos los pagos. No se reinicia con el mes.
        const deuda = Math.max(0, Math.round((t.compras - t.pagos) * 100) / 100);

        return { ...t, deuda };

    // Se muestra si está en la hoja o si todavía le debes algo. Si la quitaste y está pagada, no vuelve.
    }).filter((t) => t.enHoja || t.deuda > 0.005).map((t) => {

        const deuda = t.deuda;

        const pct = t.presupuesto > 0 ? deuda / t.presupuesto : 0;

        const nivel = t.presupuesto <= 0 ? "sin"
            : deuda > t.presupuesto + 0.005 ? "exceso"
            : deuda >= t.presupuesto - 0.005 ? "limite"
            : pct >= 0.8 ? "alerta"
            : "ok";

        const resto = t.presupuesto - deuda;

        const mensaje = nivel === "sin" ? "Fija un límite para recibir avisos"
            : nivel === "exceso" ? `Te pasaste del límite por ${money(-resto)}`
            : nivel === "limite" ? "Llegaste al límite de tu tarjeta"
            : nivel === "alerta" ? `Cuidado: te quedan solo ${money(resto)} disponibles`
            : deuda <= 0.005 ? "Al día: no debes nada"
            : `Te quedan ${money(resto)} disponibles`;

        // Próximo día de pago de la tarjeta
        let pagoDias = null;

        let pagoTexto = "";

        let pagoFecha = null;

        // Deuda que ya debió pagarse: compras de antes del último día de pago (hace más de ~30 días) que siguen sin pagar
        let vencido = 0;

        let vencidoDias = 0;

        if (t.dia > 0) {

            const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

            const en = (y, m) => new Date(y, m, Math.min(t.dia, new Date(y, m + 1, 0).getDate()));

            let prox = en(h0.getFullYear(), h0.getMonth());

            if (prox < h0) prox = en(h0.getFullYear(), h0.getMonth() + 1);

            // La fecha exacta del calendario manda mientras no haya pasado (el banco a veces la mueve)
            if (t.proximo && t.proximo >= h0) prox = t.proximo;

            pagoFecha = prox;

            pagoDias = Math.round((prox - h0) / MS_DIA);

            pagoTexto = pagoDias === 0 ? "Hoy es tu día de pago"
                : pagoDias === 1 ? "Pagas mañana"
                : `Pagas el ${fechaCorta(prox)} · en ${pagoDias} días`;

            let ult = en(h0.getFullYear(), h0.getMonth());

            if (ult >= h0) ult = en(h0.getFullYear(), h0.getMonth() - 1);

            const corte = new Date(ult.getTime() - 30 * MS_DIA);

            const antiguas = t.lista.filter((x) => x.f <= corte).reduce((a, x) => a + x.m, 0);

            vencido = Math.min(deuda, Math.max(0, Math.round((antiguas - t.pagos) * 100) / 100));

            vencidoDias = Math.round((h0 - ult) / MS_DIA);

        }

        return { ...t, pct, nivel, resto, mensaje, pagoDias, pagoTexto, pagoFecha, vencido, vencidoDias };

    }).sort((a, b) => (ORDEN_NIVEL_TARJETA[b.nivel] - ORDEN_NIVEL_TARJETA[a.nivel]) || (b.deuda - a.deuda));

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

    return peor.nivel === "alerta" ? `⚠️ ${peor.nombre}: ya usaste el ${Math.round(peor.pct * 100)}% de tu límite`
        : peor.nivel === "limite" ? `🚨 ${peor.nombre}: llegaste al límite de tu tarjeta`
        : `🚨 ${peor.nombre}: te pasaste del límite por ${money(-peor.resto)}`;

}

// Barra de uso de una tarjeta (la misma en Planificar, en el inicio y al registrar una compra)
// Colores de la tarjeta según el banco (si no se reconoce, el color del estilo)
function coloresBanco(nombre) {

    const t = String(nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const BANCOS = [
        [/bcp|credito/, "#0A2F8F", "#1F5BD8", "#FF7A1A"],
        [/interbank|\bibk\b/, "#0B8F4D", "#05B05E", "#0A4FA3"],
        [/bbva/, "#072146", "#1464A5", "#5BBEFF"],
        [/scotia/, "#A30F14", "#EC111A", "#FFFFFF"],
        [/falabella|cmr/, "#2E6B1F", "#5BA531", "#C8E6A0"],
        [/ripley/, "#3E1450", "#6E2A8C", "#F5C2FF"],
        [/\boh\b|oechsle/, "#C1121F", "#F0353F", "#FFD166"],
        [/diners/, "#1C2B39", "#3B5470", "#B7C7D6"],
        [/banbif/, "#00566B", "#0090A8", "#9EE7F2"],
        [/pichincha/, "#1E2B6F", "#FFD100", "#FFD100"],
        [/amex|american/, "#0B5FA5", "#2E8BD6", "#BFE3FF"]
    ];

    for (const [re, a, b, acento] of BANCOS) if (re.test(t)) return { a, b, acento };

    return null;

}

// Una tarjeta "de plástico" con lo que debes, el uso del límite y la fecha de pago
function plasticoHTML(t) {

    const c = coloresBanco(t.nombre);

    const pct = t.presupuesto > 0 ? Math.round(t.pct * 100) : 0;

    const ancho = Math.min(100, pct);

    const alerta = t.presupuesto > 0 && t.pct >= 0.8;

    const estilo = c ? `--pl-a:${c.a};--pl-b:${c.b};--pl-acento:${c.acento}` : "";

    return `
        <div class="plastico${c ? "" : " pl-estilo"}${alerta ? " pl-alerta" : ""}" style="${estilo}">

            <div class="pl-top">
                <span class="pl-banco">${esc(t.nombre)}</span>
                <span class="pl-chip" aria-hidden="true"></span>
            </div>

            <div class="pl-centro">
                <span class="pl-label">${t.deuda > 0.005 ? "Debes" : "Al día"}</span>
                <span class="pl-monto">${money(t.deuda)}</span>
            </div>

            ${t.presupuesto > 0 ? `
            <div class="pl-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ancho}" aria-label="Uso del límite de ${esc(t.nombre)}">
                <span style="width:${ancho}%"></span>
            </div>` : ""}

            <div class="pl-pie">
                <span>${t.presupuesto > 0 ? `${pct}% de ${money(t.presupuesto)}` : "Sin límite puesto"}</span>
                ${t.pagoTexto ? `<span class="${t.pagoDias <= 3 && t.deuda > 0.005 ? "pl-pronto" : ""}">${ico("calendar-days")} ${esc(t.pagoTexto)}</span>` : ""}
            </div>

        </div>`;

}

function barraUsoHTML(t) {

    const ancho = Math.min(100, Math.round(t.pct * 100));

    const clase = t.nivel === "sin" ? "ok" : t.nivel === "limite" ? "exceso" : t.nivel;

    return `
        <div class="uso-tarjeta">

            <div class="presupuesto-top">

                <span class="presupuesto-nombre">${ico("credit-card")} ${esc(t.nombre)}</span>

                <span class="presupuesto-monto">${t.deuda > 0.005 ? `Debes ${money(t.deuda)}${t.presupuesto > 0 ? ` de ${money(t.presupuesto)}` : ""}` : `Sin deuda${t.presupuesto > 0 ? ` · límite ${money(t.presupuesto)}` : ""}`}</span>

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
        ? (items.reduce((t, x) => t + x.deuda, 0) > 0.005 ? `Debes ${money(items.reduce((t, x) => t + x.deuda, 0))} en tus tarjetas` : "Estás al día con tus tarjetas")
        : "Mira cuánto debes en cada tarjeta y recibe avisos.";

    if (!items.length) {

        $("tarjetas").innerHTML = vacioGuia("💳", "Aún no tienes tarjetas",
            "Escribe en la barra, por ejemplo: «compré zapatos 200 con la BCP». La tarjeta se crea sola y aquí le pones su límite.",
            "almuerzo 25 con la BCP");

    } else {

        $("tarjetas").innerHTML = items.map((t) => {

            const detalle = [
                t.mes > 0 ? `Compras de este mes: ${money(t.mes)}` : "",
                t.pagadoMes > 0 ? `Pagado este mes: ${money(t.pagadoMes)}` : ""
            ].filter(Boolean).join(" · ");

            return `
            <div class="presupuesto-item tarjeta-item" data-nombre="${esc(t.nombre)}"
                data-presupuesto="${t.presupuesto}" data-deuda="${t.deuda}" data-dia="${t.dia || ""}" data-fecha="${t.pagoFecha ? aInputFecha(t.pagoFecha) : ""}">

                ${plasticoHTML(t)}

                ${t.mensaje && t.presupuesto > 0 ? `<div class="pl-mensaje nivel-${t.nivel === "sin" ? "ok" : t.nivel === "limite" ? "exceso" : t.nivel}">${esc(t.mensaje)}</div>` : ""}

                ${t.vencido > 0.005 ? `<div class="tarjeta-vencida">⚠️ Pasó tu día de pago: ya debías ${money(t.vencido)}. Paga hoy y evitas que crezca 💪</div>` : ""}

                ${detalle ? `<div class="tarjeta-detalle">${esc(detalle)}</div>` : ""}

                ${t.deuda > 0.005 ? `
                <div class="presupuesto-acciones tarjeta-acciones tarjeta-pagar">

                    <button class="mov-btn mov-btn-primario" type="button" data-tarj="pagartodo" aria-label="Pagué todo: ${money(t.deuda)}">✓ Pagué todo</button>

                    <button class="mov-btn" type="button" data-tarj="pagarparte">Pagué una parte</button>

                </div>

                <form class="tarj-pago-form" data-tarjpago hidden>

                    <input type="number" step="0.01" min="0.01" max="${t.deuda}" inputmode="decimal"
                        placeholder="¿Cuánto pagaste?" aria-label="Monto pagado" required>

                    <button type="submit">Registrar pago</button>

                </form>` : ""}

                <div class="presupuesto-acciones tarjeta-acciones">

                    <button class="mov-btn" type="button" data-tarj="editar">${ico("pencil")} Editar</button>

                    ${t.deuda <= 0.005
                        ? `<button class="mov-btn mov-btn-borrar" type="button" data-tarj="quitar">Quitar tarjeta</button>`
                        : (t.presupuesto > 0
                            ? `<button class="mov-btn mov-btn-borrar" type="button" data-tarj="quitarlimite">Quitar límite</button>` : "")}

                </div>

            </div>`;

        }).join("");

    }

    const resumen = $("tarjetasResumen");

    resumen.hidden = !items.length;

    resumen.innerHTML = items.length
        ? `<div class="card-title"><div><h2>💳 Uso de tus tarjetas</h2><p>Lo que debes en cada tarjeta</p></div></div>` +
          items.map((t) => barraUsoHTML(t) + (t.pagoTexto && t.deuda > 0.005 ? `<div class="tarjeta-pago ${t.pagoDias <= 3 ? "pronto" : ""}">📅 ${esc(t.pagoTexto)}</div>` : "")).join("")
        : "";

    renderAvisoTarjetas(items);

}

let avisoPagoTarjetaMostrado = false;

// Aviso en el Dashboard: tarjetas cerca del límite, pasadas, o con el día de pago cerca
function renderAvisoTarjetas(items) {

    const aviso = $("avisoTarjetas");

    const malas = items.filter((t) => ORDEN_NIVEL_TARJETA[t.nivel] >= 2);

    const pagos = items
        .filter((t) => t.pagoDias !== null && t.pagoDias <= 3 && t.deuda > 0.005)
        .sort((a, b) => a.pagoDias - b.pagoDias);

    const vencidas = items.filter((t) => t.vencido > 0.005).sort((a, b) => b.vencido - a.vencido);

    if (!malas.length && !pagos.length && !vencidas.length) {

        aviso.hidden = true;

        return;

    }

    const lineas = [];

    vencidas.slice(0, 2).forEach((t) => {

        lineas.push(`⚠️ Pasó tu día de pago de ${esc(t.nombre)} y aún debes ${money(t.vencido)}. Paga hoy y evitas que crezca 💪`);

    });

    pagos.filter((t) => !(t.vencido > 0.005)).forEach((t) => {

        const cuando = t.pagoDias === 0 ? "<strong>Hoy pagas</strong>"
            : t.pagoDias === 1 ? "<strong>Mañana pagas</strong>"
            : `En <strong>${t.pagoDias} días</strong> pagas`;

        lineas.push(`📅 ${cuando} tu tarjeta ${esc(t.nombre)} (debes ${money(t.deuda)})`);

    });

    malas.slice(0, 2).forEach((t) => {

        const txt = t.nivel === "alerta" ? `va en ${Math.round(t.pct * 100)}% de su límite`
            : t.nivel === "limite" ? "llegó al límite"
            : `se pasó del límite por ${money(-t.resto)}`;

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

async function guardarTarjeta(nombre, presupuesto, dia, proximo) {

    await api("tarjeta", { nombre, presupuesto, dia, proximo });

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

// Anillo de progreso (como los de actividad del reloj)
function anilloHTML(pct, nivel, nombre) {

    const R = 30, C = 2 * Math.PI * R;

    const off = C * (1 - Math.min(100, pct) / 100);

    return `
        <div class="anillo nivel-${nivel}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Avance de ${esc(nombre)}">
            <svg viewBox="0 0 72 72" aria-hidden="true">
                <circle class="anillo-fondo" cx="36" cy="36" r="${R}"/>
                <circle class="anillo-valor" cx="36" cy="36" r="${R}" stroke-dasharray="${C.toFixed(2)}" style="--total:${C.toFixed(2)};--off:${off.toFixed(2)}"/>
            </svg>
            <span>${nivel === "ok" ? ico("flag") : pct + "%"}</span>
        </div>`;

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

                <div class="meta-cab">

                    ${anilloHTML(ancho, m.info.nivel, m.nombre)}

                    <div class="meta-info">
                        <strong>${esc(m.nombre)}</strong>
                        <span class="meta-cifras"><b>${money(m.ahorrado)}</b> de ${money(m.objetivo)}</span>
                        <small class="meta-estado nivel-${m.info.nivel}">${esc(m.info.texto)}</small>
                    </div>

                </div>

                <div class="meta-aporte">

                    <input class="meta-monto" type="number" step="0.01" min="0.01"
                        inputmode="decimal" placeholder="S/ 0.00" aria-label="Monto a aportar o retirar">

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
