// Finanzas IA - Script v2.0
// =========================
// CONFIGURACIÓN
// =========================

const WEBHOOK = "https://hook.us2.make.com/bmcjqeay6jcuvxkif8utgscmi8tdidd5";
const SHEET_ID = "1_7GeuQeIonqzuWCzRiWIjbg0xjbb1XpppYLM56pBU18";

const DASHBOARD_URL =
`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=Dashboards`;

const MOVIMIENTOS_URL =
`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=Movimientos`;

const $ = (id)=>document.getElementById(id);

// =========================
// TOAST
// =========================

function mostrarToast(mensaje) {

    const toast = document.getElementById("toast");
    const texto = document.getElementById("toastTexto");

    texto.textContent = mensaje;

    toast.classList.add("mostrar");

    setTimeout(() => {

        toast.classList.remove("mostrar");

    }, 3000);

}
// =========================
// FORMATEAR FECHA
// =========================

function formatearFecha(fechaTexto){

    if(!fechaTexto) return "";

    // Eliminar comillas y espacios
    fechaTexto = String(fechaTexto)
        .replace(/"/g, "")
        .trim();

    const partes = fechaTexto.split("/");

    if(partes.length !== 3){
        return fechaTexto;
    }

    const dia = Number(partes[0]);
    const mes = Number(partes[1]) - 1;
    const anio = Number(partes[2]);

    const fecha = new Date(anio, mes, dia);

    if (isNaN(fecha.getTime())) {
        return fechaTexto;
    }

    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);

    const mismaFecha = (a,b)=>
        a.getDate()===b.getDate() &&
        a.getMonth()===b.getMonth() &&
        a.getFullYear()===b.getFullYear();

    if(mismaFecha(fecha,hoy)) return "Hoy";
    if(mismaFecha(fecha,ayer)) return "Ayer";

    return fecha.toLocaleDateString("es-PE",{
        day:"numeric",
        month:"short"
    });


}
async function leerHoja(url){
    const r = await fetch(url);
    const t = await r.text();
    return JSON.parse(t.substring(47).slice(0,-2));
}
// =========================
// OBTENER MOVIMIENTOS
// =========================

async function obtenerMovimientos(){

    try{

        const json = await leerHoja(MOVIMIENTOS_URL);

        const filas = json.table.rows;

        const movimientos = [];

        filas.forEach(fila=>{

            const c = fila.c;

            movimientos.push({

                fecha: c[0]?.v ?? "",

                tipo: c[1]?.v ?? "",

                categoria: c[2]?.v ?? "",

                descripcion: c[3]?.v ?? "",

                monto: Number(c[4]?.v ?? 0)

            });

        });

        return movimientos;

    }catch(error){

        console.error("Error obteniendo movimientos:", error);

        return [];

    }

}

async function cargarDashboard(){
    try{
        const json = await leerHoja(DASHBOARD_URL);
        const filas = json.table.rows;

        $("ingresos").textContent = "S/ " + Number(filas[0].c[1].v).toFixed(2);
        $("gastos").textContent = "S/ " + Number(filas[1].c[1].v).toFixed(2);
        $("saldo").textContent = "S/ " + Number(filas[2].c[1].v).toFixed(2);
        animarDashboard();
        document.querySelector(".resumen").classList.add("actualizando");
        document.querySelector(".saldo").classList.add("actualizando");

        setTimeout(()=>{
            document.querySelector(".resumen").classList.remove("actualizando");
            document.querySelector(".saldo").classList.remove("actualizando");
        },500);

    }catch(e){
        console.error(e);
    }
}

async function cargarActividad(){
    try{
        const json = await leerHoja(MOVIMIENTOS_URL);
        const filas = json.table.rows;

        const iconos={
            Comida:"🍔",
            Bebidas:"🥤",
            Transporte:"🚕",
            Sueldo:"💼",
            Salud:"🏥",
            Entretenimiento:"🎮",
            Compras:"🛍️",
            Hogar:"🏠"
        };

        let html="";
        const inicio=Math.max(0,filas.length-5);

        for(let i=filas.length-1;i>=inicio;i--){
    const f = filas[i].c;

    console.log(f);

    const fechaOriginal = f[0]?.v ?? "";

console.log(fechaOriginal, typeof fechaOriginal);

const fecha = formatearFecha(fechaOriginal);
            const tipo=f[1]?.v ?? "";
            const categoria=f[2]?.v ?? "";
            const descripcion=f[3]?.v ?? "";
            const monto=Number(f[4]?.v ?? 0);

            html+=`
            <div class="movimiento">
                <div class="movimiento-superior">
                    <div class="movimiento-nombre">${iconos[categoria]||"📦"} ${descripcion}</div>
                    <div class="movimiento-monto ${tipo==="Ingreso"?"ingreso":"gasto"}">
                        ${tipo==="Ingreso"?"+":"-"} S/ ${monto.toFixed(2)}
                    </div>
                </div>
                <div class="movimiento-inferior">
                    <span>${categoria}</span>
                    <span>${fecha}</span>
                </div>
            </div>`;
        }

        $("actividad").innerHTML=html;

    }catch(e){
        console.error(e);
    }
}
// =========================
// ANIMACIÓN DASHBOARD
// =========================

function animarDashboard(){

    const tarjetas = document.querySelectorAll(".tarjeta, .saldo");

    tarjetas.forEach((tarjeta)=>{

        tarjeta.classList.add("actualizando");

    });

    setTimeout(()=>{

        tarjetas.forEach((tarjeta)=>{

            tarjeta.classList.remove("actualizando");

        });

    },500);

}
async function actualizarTodo(){

    await cargarDashboard();

    await cargarActividad();

    await cargarGrafico();

}

async function registrarMovimiento(){

    const texto=$("mensaje").value.trim();

    if(!texto){
        alert("Escribe un movimiento.");
        return;
    }

    const boton=$("registrar");
    const textoBoton=$("textoBoton");

    boton.disabled=true;
    textoBoton.textContent="⏳ Registrando...";
    $("respuesta").textContent="🤖 Analizando movimiento...";

    try{

        const r = await fetch(WEBHOOK,{
    method:"POST",
    headers:{
        "Content-Type":"application/json"
    },
    body:JSON.stringify({
        mensaje:texto
    })
});

console.log(r.status);
console.log(r.ok);
console.log(r.type);

        if(!r.ok) throw new Error("Error del webhook");

        $("mensaje").value="";
        $("respuesta").textContent="📊 Actualizando información...";

        await new Promise(res=>setTimeout(res,3000));

        await actualizarTodo();

        textoBoton.textContent="✅ Registrado";

       setTimeout(()=>{

    textoBoton.textContent="➕ Registrar movimiento";

    boton.disabled=false;

    mostrarToast("✅ Movimiento registrado");

},1200);

    }catch(e){

    console.error(e);

    boton.disabled = false;

    textoBoton.textContent = "➕ Registrar movimiento";

    mostrarToast("❌ No se pudo al registrar el movimiento");

}

}

window.addEventListener("DOMContentLoaded",()=>{
    $("registrar").addEventListener("click",registrarMovimiento);
    actualizarTodo();
});
