// Finanzas IA · ciclo.js — «Registrar nuevo mes»: el saldo empieza desde tu sueldo.
// Cuenta por orden de registro: el sueldo y todo lo que registres después. Lo de antes queda aparte
// (no se borra nada). El Apps Script marca el sueldo en la hoja (acción "ciclo").
"use strict";

const ciclo = (() => {

    const SUELDO = /sueldo|salario|quincena|planilla|me pagaron|pago (de|del) (mi )?trabajo/i;

    const esSueldo = (m) => !!m && esIngreso(m) && SUELDO.test(`${m.categoria} ${m.descripcion}`);

    // Para ofrecer «¿Es tu sueldo?» tras registrar: lo que parece sueldo o un ingreso grande
    const puedeSerSueldo = (m) => esSueldo(m) || (!!m && esIngreso(m) && !esPrestamo(m) && !esReembolso(m) && m.monto >= 500);

    const cuando = (d) => {
        if (!d) return "";
        const t = formatearFecha(d);
        return t === "Hoy" || t === "Ayer" ? t.toLowerCase() : d.toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(".", "");
    };

    let opciones = [];   // ingresos recientes que se pueden elegir

    // Ingresos de los últimos 20 días (primero los que parecen sueldo), máx. 3
    function recientes() {

        const limite = new Date();

        limite.setDate(limite.getDate() - 20);

        return estado.movimientos
            .filter((m) => esIngreso(m) && m.fecha && m.fecha >= limite && !esReembolso(m) && !esPrestamo(m))
            .sort((a, b) => (esSueldo(b) - esSueldo(a)) || (b.fila - a.fila))
            .slice(0, 3);

    }

    const elegido = () => {
        const r = document.querySelector('input[name="cicloOrigen"]:checked');
        return r ? r.value : "";
    };

    // Cuánto tendrías y cuánto queda aparte
    function calcular() {

        const v = elegido();

        if (v === "nuevo") {

            const monto = Number($("cicloMonto").value) || 0;

            return { empieza: monto, aparte: saldoDe(estado.movimientos) };

        }

        const m = opciones[Number(v)];

        if (!m) return null;

        return {
            empieza: saldoDe(estado.movimientos.filter((x) => x.fila >= m.fila)),
            aparte: saldoDe(estado.movimientos.filter((x) => x.fila < m.fila))
        };

    }

    function actualizar() {

        $("cicloError").textContent = "";

        $("cicloMonto").closest(".ciclo-op").classList.toggle("activa", elegido() === "nuevo");

        const c = calcular();

        $("cicloEmpieza").textContent = c ? money(c.empieza) : "—";

        $("cicloAparte").textContent = c ? money(c.aparte) : "—";

    }

    // «sugerido»: el sueldo que se acaba de registrar (opcional)
    function abrir(sugerido) {

        opciones = recientes();

        if (sugerido && !opciones.some((m) => m.fila === sugerido.fila)) opciones.unshift(sugerido);

        $("cicloRecientes").innerHTML = opciones.map((m, i) => `
            <label class="ciclo-op">
                <input type="radio" name="cicloOrigen" value="${i}">
                <span class="ciclo-op-txt">${esc(m.descripcion || m.categoria)} <small>${cuando(m.fecha)}${estado.ciclo && estado.ciclo.fila === m.fila ? " · mes actual" : ""}</small></span>
                <b>${money(m.monto)}</b>
            </label>`).join("");

        // Selección inicial: el sugerido, o el sueldo más reciente que no sea el del mes actual, o registrar uno nuevo
        let i = sugerido ? opciones.findIndex((m) => m.fila === sugerido.fila) : opciones.findIndex((m) => esSueldo(m) && !(estado.ciclo && estado.ciclo.fila === m.fila));

        const radios = document.querySelectorAll('input[name="cicloOrigen"]');

        radios.forEach((r) => { r.checked = false; });

        if (i >= 0) radios[i].checked = true;
        else document.querySelector('input[name="cicloOrigen"][value="nuevo"]').checked = true;

        $("cicloMonto").value = "";

        $("cicloQuitar").hidden = !estado.ciclo;

        $("cicloOverlay").hidden = false;

        actualizar();

        if (elegido() === "nuevo") setTimeout(() => $("cicloMonto").focus(), 60);

    }

    function cerrar() { $("cicloOverlay").hidden = true; }

    async function guardar(valores, aviso) {

        const botones = [$("cicloOk"), $("cicloQuitar")];

        botones.forEach((b) => { b.disabled = true; });

        try {

            await api("ciclo", valores);

            estado.mesInicio = null;   // el gráfico del inicio vuelve a «Desde mi sueldo»

            await cargarDatos();

            renderTodo();

            cerrar();

            mostrarToast(aviso);

            animar(".tarjeta");

        } catch (err) {

            $("cicloError").textContent = err && err.message ? err.message : "No se pudo guardar. Inténtalo otra vez.";

        } finally {

            botones.forEach((b) => { b.disabled = false; });

        }

    }

    function iniciar() {

        if (!$("cicloOverlay")) return;

        document.addEventListener("click", (e) => { if (e.target.closest(".ciclo-abrir")) abrir(); });

        $("cicloForm").addEventListener("change", actualizar);

        $("cicloMonto").addEventListener("input", () => {
            document.querySelector('input[name="cicloOrigen"][value="nuevo"]').checked = true;
            actualizar();
        });

        $("cicloCerrar").addEventListener("click", cerrar);

        $("cicloOverlay").addEventListener("click", (e) => { if (e.target === $("cicloOverlay")) cerrar(); });

        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("cicloOverlay").hidden) cerrar(); });

        $("cicloForm").addEventListener("submit", (e) => {

            e.preventDefault();

            const v = elegido();

            if (v === "nuevo") {

                const monto = Number($("cicloMonto").value);

                if (!(monto > 0)) { $("cicloError").textContent = "Escribe cuánto te pagaron."; $("cicloMonto").focus(); return; }

                guardar({ monto }, `💼 Nuevo mes: empiezas con ${money(monto)}`);

                return;

            }

            const m = opciones[Number(v)];

            if (!m) { $("cicloError").textContent = "Elige con qué sueldo empiezas."; return; }

            guardar({
                fila: m.fila,
                orig: { tipo: m.tipo, categoria: m.categoria, descripcion: m.descripcion, monto: m.monto }
            }, `💼 Nuevo mes desde tu ${(m.descripcion || "sueldo").toLowerCase()} de ${money(m.monto)}`);

        });

        $("cicloQuitar").addEventListener("click", () => guardar({ quitar: true }, "Tu saldo vuelve a contar todo junto"));

    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

    return { abrir, esSueldo, puedeSerSueldo };

})();
