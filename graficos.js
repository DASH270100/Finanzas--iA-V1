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

    if(grafico){

        grafico.destroy();

    }

    const opciones = {

        chart:{

            type:"donut",

            height:430,

            toolbar:{
                show:false
            },

            animations:{
                enabled:true,
                easing:"easeinout",
                speed:900
            }

        },

        series:series,

        labels:labels,

        legend:{
            position:"bottom",
            fontSize:"15px",
            fontFamily:"Montserrat",
            labels:{
                colors:"#ffffff"
            }
        },

        dataLabels:{
            enabled:true
        },

        noData:{
            text:"Sin datos"
        }

    };

    grafico = new ApexCharts(

        document.querySelector("#graficoCategorias"),

        opciones

    );

    grafico.render();

}
