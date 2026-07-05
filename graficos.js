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

        height:440,

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

    colors:[
        "#7C5CFC",
        "#4F8EF7",
        "#F59E0B",
        "#22C55E",
        "#EF4444",
        "#06B6D4",
        "#A855F7"
    ],

    legend:{
        show:false
    },

    stroke:{
        width:0
    },

   plotOptions:{

    pie:{

        expandOnClick:false,

        donut:{

            size:"72%",

            labels:{

                show:true,

                name:{
                    show:false
                },

                value:{
                    show:true,

                    fontFamily:"Montserrat",

                    fontSize:"34px",

                    fontWeight:800,

                    color:"#FFFFFF",

                    offsetY:10,

                    formatter:function(){

                        const total = series.reduce((a,b)=>a+b,0);

                        return "S/ " + total.toFixed(2);

                    }

                },

                total:{

                    show:true,

                    label:"Total",

                    fontFamily:"Montserrat",

                    fontSize:"12px",

                    fontWeight:500,

                    color:"#94A3B8",

                    formatter:function(){

                        return "";

                    }

                }

            }

        }

    }

},

    dataLabels:{
        enabled:false
    },

    tooltip:{

        theme:"dark",

        y:{
            formatter:function(val){
                return "S/ " + val.toFixed(2);
            }
        }

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
