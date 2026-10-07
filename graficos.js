// Finanzas IA - Gráficos v3.0
// Depende de script.js: usa money() y recibe los gastos ya filtrados por periodo.

let grafico = null;
let graficoMeses = null;

const COLORES_GRAFICO = [
    "#8B5CF6", "#3B82F6", "#F59E0B", "#10B981", "#EF4444",
    "#06B6D4", "#EC4899", "#84CC16", "#F97316", "#6366F1"
];

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

function renderGrafico(gastos) {

    const grupos = agruparGastos(gastos);

    const contenedor = document.querySelector("#graficoCategorias");

    if (grafico) {

        grafico.destroy();

        grafico = null;

    }

    contenedor.innerHTML = "";

    if (typeof ApexCharts === "undefined") {

        contenedor.innerHTML = '<p class="vacio">No se pudo cargar el gráfico.</p>';

        return grupos;

    }

    const opciones = {

        chart: {

            type: "donut",

            height: "100%",

            fontFamily: "Montserrat, sans-serif",

            toolbar: { show: false },

            animations: {
                enabled: true,
                easing: "easeinout",
                speed: 700
            }

        },

        series: grupos.map((g) => g.total),

        labels: grupos.map((g) => g.nombre),

        colors: COLORES_GRAFICO,

        legend: {

            show: true,

            position: "bottom",

            fontSize: "13px",

            labels: { colors: "#CBD5E1" },

            markers: { width: 10, height: 10, radius: 10 },

            itemMargin: { horizontal: 10, vertical: 4 }

        },

        stroke: {

            width: 6,

            colors: ["#121B2C"]

        },

        plotOptions: {

            pie: {

                expandOnClick: false,

                donut: {

                    size: "68%",

                    labels: {

                        show: true,

                        name: { color: "#94A3B8", fontSize: "14px" },

                        value: {
                            color: "#F8FAFC",
                            fontSize: "24px",
                            fontWeight: 800,
                            formatter: (val) => money(val)
                        },

                        total: {
                            show: true,
                            label: "Total",
                            color: "#94A3B8",
                            formatter: (w) =>
                                money(w.globals.seriesTotals.reduce((a, b) => a + b, 0))
                        }

                    }

                }

            }

        },

        dataLabels: { enabled: false },

        tooltip: {

            theme: "dark",

            y: { formatter: (val) => money(val) }

        },

        noData: {

            text: "Sin gastos en este periodo",

            style: { color: "#94A3B8", fontSize: "15px" }

        }

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
            labels: { style: { colors: "#94A3B8" } },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },

        yaxis: {
            labels: {
                style: { colors: "#94A3B8" },
                formatter: (v) => "S/ " + Math.round(v)
            }
        },

        colors: ["#22C55E", "#EF4444"],

        plotOptions: { bar: { borderRadius: 6, columnWidth: "55%" } },

        dataLabels: { enabled: false },

        grid: { borderColor: "#26354B", strokeDashArray: 4 },

        legend: {
            position: "top",
            horizontalAlign: "right",
            labels: { colors: "#CBD5E1" },
            markers: { radius: 10 }
        },

        tooltip: {
            theme: "dark",
            y: { formatter: (val) => money(val) }
        }

    });

    graficoMeses.render();

}
