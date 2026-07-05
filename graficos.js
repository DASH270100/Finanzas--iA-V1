let grafico = null;

async function cargarGrafico() {

    const movimientos = await obtenerMovimientos();

    const gastos = movimientos.filter(m => m.tipo === "Gasto");

    const categorias = {};

    gastos.forEach(m => {

        categorias[m.categoria] =
            (categorias[m.categoria] || 0) + Number(m.monto);

    });

    const labels = Object.keys(categorias);

    const series = Object.values(categorias);

    if (grafico) {

        grafico.destroy();

    }

    const opciones = {

        chart: {

            type: "donut",

            height: 440,

            toolbar: {
                show: false
            },

            animations: {
                enabled: true,
                easing: "easeinout",
                speed: 900
            }

        },

        series: series,

        labels: labels,

        colors: [

            "#8B5CF6",
            "#3B82F6",
            "#F59E0B",
            "#10B981",
            "#EF4444",
            "#06B6D4",
            "#EC4899"

        ],

        legend: {
            show: false
        },

        stroke: {

            width: 6,

            colors: ["#1B2333"]

        },

        plotOptions: {

            pie: {

                expandOnClick: false,

                donut: {

                    size: "68%"

                }

            }

        },

        dataLabels: {
            enabled: false
        },

        tooltip: {

            theme: "dark",

            y: {

                formatter: function (val) {

                    return "S/ " + val.toFixed(2);

                }

            }

        },

        noData: {

            text: "Sin datos"

        }

    };

    grafico = new ApexCharts(

        document.querySelector("#graficoCategorias"),

        opciones

    );

    grafico.render();

}
