// Finanzas IA - Gráficos v3.1 (colores según el estilo)
// Depende de script.js: usa money() y recibe los gastos ya filtrados por periodo.

let grafico = null;
let graficoMeses = null;

const COLORES_GRAFICO = [
    "#8B5CF6", "#3B82F6", "#F59E0B", "#10B981", "#EF4444",
    "#06B6D4", "#EC4899", "#84CC16", "#F97316", "#6366F1"
];


// Colores del estilo activo (así los gráficos se ven bien en oscuro y en claro)
function colorEstilo(nombre, defecto) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
    return v || defecto;
}

function esEstiloOscuro() {
    // Noche, Vidrio y los estilos especiales oscuros usan gráficos oscuros
    const t = document.documentElement.getAttribute("data-tema");
    return t === null || (t !== "iridiscente" && t !== "atardecer");
}

// "comida", "Comida " y "COMIDA" cuentan como la misma categoría
function nombreCategoria(categoria) {

    const t = String(categoria || "").trim();

    if (!t) return "Sin categoría";

    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

}

// Devuelve [{ nombre, total }] ordenado de mayor a menor
function agruparGastos(gastos) {

    const mapa = new Map();

    gastos.forEach((m) => {

        const nombre = nombreCategoria(m.categoria);

        mapa.set(nombre, (mapa.get(nombre) || 0) + m.monto);

    });

    return [...mapa.entries()]
        .map(([nombre, total]) => ({ nombre, total }))
        .sort((a, b) => b.total - a.total);

}

// Paleta del estilo activo (--graf-1 … --graf-6); si el estilo no la define, la de siempre
function paletaEstilo() {

    const p = [];

    for (let i = 1; i <= 6; i++) {

        const c = colorEstilo("--graf-" + i, "");

        if (c) p.push(c);

    }

    return p.length >= 3 ? p : COLORES_GRAFICO;

}

// Máximo 5 categorías + "Resto", para que la dona se lea de un vistazo
function gruposParaDona(grupos) {

    if (grupos.length <= 6) return grupos;

    const top = grupos.slice(0, 5);

    const resto = grupos.slice(5).reduce((t, g) => t + g.total, 0);

    return [...top, { nombre: "Resto", total: resto }];

}

function renderGrafico(gastos) {

    const grupos = agruparGastos(gastos);

    const contenedor = document.querySelector("#graficoCategorias");

    const centro = document.querySelector("#graficoCentro");

    const leyenda = document.querySelector("#leyendaGrafico");

    if (grafico) {

        grafico.destroy();

        grafico = null;

    }

    contenedor.innerHTML = "";

    if (leyenda) leyenda.innerHTML = "";

    if (centro) centro.innerHTML = "";

    const dona = gruposParaDona(grupos);

    const total = dona.reduce((t, g) => t + g.total, 0);

    if (!dona.length || total <= 0) {

        contenedor.innerHTML = '<p class="vacio grafico-vacio">Sin gastos en este periodo</p>';

        return grupos;

    }

    if (typeof ApexCharts === "undefined") {

        contenedor.innerHTML = '<p class="vacio grafico-vacio">No se pudo cargar el gráfico.</p>';

        return grupos;

    }

    const colores = paletaEstilo();

    const pct = (v) => {
        const n = (v / total) * 100;
        return (n > 0 && n < 1 ? "<1" : Math.round(n)) + "%";
    };

    // Centro de la dona: total, o la categoría que se está mirando
    const pintarCentro = (i) => {

        if (!centro) return;

        const g = i == null ? null : dona[i];

        centro.innerHTML = g
            ? `<span class="gc-label">${esc(g.nombre)}</span>
               <strong class="gc-monto">${money(g.total)}</strong>
               <span class="gc-sub">${pct(g.total)} de tus gastos</span>`
            : `<span class="gc-label">Gastado</span>
               <strong class="gc-monto">${money(total)}</strong>
               <span class="gc-sub">${dona.length} ${dona.length === 1 ? "categoría" : "categorías"}</span>`;

        centro.classList.toggle("mirando", !!g);

        if (leyenda) leyenda.querySelectorAll("li").forEach((li, k) => li.classList.toggle("apagado", g !== null && k !== i));

    };

    // Leyenda: ranking con monto, barra y porcentaje
    if (leyenda) {

        const max = dona[0].total;

        leyenda.innerHTML = dona.map((g, i) => `
            <li style="--c:${colores[i % colores.length]}" data-i="${i}" tabindex="0">
                <span class="lg-punto"></span>
                <span class="lg-nombre">${esc(g.nombre)}</span>
                <span class="lg-monto">${money(g.total)}</span>
                <span class="lg-barra"><i style="width:${Math.max(4, (g.total / max) * 100).toFixed(1)}%"></i></span>
                <span class="lg-pct">${pct(g.total)}</span>
            </li>`).join("");

        leyenda.querySelectorAll("li").forEach((li) => {
            const i = Number(li.dataset.i);
            li.addEventListener("mouseenter", () => pintarCentro(i));
            li.addEventListener("focus", () => pintarCentro(i));
            li.addEventListener("mouseleave", () => pintarCentro(null));
            li.addEventListener("blur", () => pintarCentro(null));
        });

    }

    pintarCentro(null);

    const fuente = getComputedStyle(document.body).fontFamily || "Montserrat, sans-serif";

    const opciones = {

        chart: {

            type: "donut",

            height: "100%",

            fontFamily: fuente,

            toolbar: { show: false },

            animations: { enabled: true, easing: "easeinout", speed: 800, animateGradually: { enabled: true, delay: 90 } },

            events: {
                dataPointMouseEnter: (e, ctx, cfg) => pintarCentro(cfg.dataPointIndex),
                dataPointMouseLeave: () => pintarCentro(null)
            }

        },

        series: dona.map((g) => g.total),

        labels: dona.map((g) => g.nombre),

        colors: colores,

        legend: { show: false },

        // La "separación" entre porciones es un borde del color de la tarjeta
        stroke: { width: 3, colors: [colorEstilo("--graf-hueco", colorEstilo("--surface", "#121B2C"))] },

        states: {
            hover: { filter: { type: "lighten", value: 0.08 } },
            active: { filter: { type: "none" } }
        },

        plotOptions: {

            pie: {

                expandOnClick: false,

                donut: { size: "78%", labels: { show: false } }

            }

        },

        dataLabels: { enabled: false },

        tooltip: { enabled: false }

    };

    grafico = new ApexCharts(contenedor, opciones);

    grafico.render();

    return grupos;

}

// Barras de ingresos vs gastos por mes. meses = [{ etiqueta, ingresos, gastos }]
function renderBarrasMeses(meses) {

    const contenedor = document.querySelector("#graficoMeses");

    if (graficoMeses) {

        graficoMeses.destroy();

        graficoMeses = null;

    }

    contenedor.innerHTML = "";

    if (typeof ApexCharts === "undefined") {

        contenedor.innerHTML = '<p class="vacio">No se pudo cargar el gráfico.</p>';

        return;

    }

    graficoMeses = new ApexCharts(contenedor, {

        chart: {
            type: "bar",
            height: 280,
            fontFamily: "Montserrat, sans-serif",
            toolbar: { show: false },
            animations: { enabled: true, speed: 600 }
        },

        series: [
            { name: "Ingresos", data: meses.map((m) => m.ingresos) },
            { name: "Gastos", data: meses.map((m) => m.gastos) }
        ],

        xaxis: {
            categories: meses.map((m) => m.etiqueta),
            labels: { style: { colors: colorEstilo("--text-muted", "#94A3B8") } },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },

        yaxis: {
            labels: {
                style: { colors: colorEstilo("--text-muted", "#94A3B8") },
                formatter: (v) => "S/ " + Math.round(v)
            }
        },

        colors: ["#22C55E", "#EF4444"],

        plotOptions: { bar: { borderRadius: 6, columnWidth: "55%" } },

        dataLabels: { enabled: false },

        grid: { borderColor: colorEstilo("--border", "#26354B"), strokeDashArray: 4 },

        legend: {
            position: "top",
            horizontalAlign: "right",
            labels: { colors: colorEstilo("--text-soft", "#CBD5E1") },
            markers: { radius: 10 }
        },

        tooltip: {
            theme: esEstiloOscuro() ? "dark" : "light",
            y: { formatter: (val) => money(val) }
        }

    });

    graficoMeses.render();

}
