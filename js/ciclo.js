// Finanzas IA · ciclo.js — «Empezar con mi sueldo»: el saldo cuenta solo desde el día que elijas.
// Lo de antes queda aparte (no se borra nada). Se guarda por persona en el Apps Script (acción "ciclo").
"use strict";

const ciclo = (() => {

    const SUELDO = /sueldo|salario|quincena|planilla|pago de (mi )?trabajo|me pagaron/i;

    const aTexto = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

    const aInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const deInput = (v) => {
        const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    };

    const corto = (d) => d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

    // El sueldo más reciente de los últimos 20 días (para sugerir la fecha)
    function ultimoSueldo() {

        const limite = new Date();

        limite.setDate(limite.getDate() - 20);

        return estado.movimientos
            .filter((m) => esIngreso(m) && m.fecha && m.fecha >= limite && SUELDO.test(`${m.categoria} ${m.descripcion}`))
            .sort((a, b) => b.fecha - a.fecha)[0] || null;

    }

    // Cuánto tendrías desde esa fecha y cuánto queda aparte
    function calcular(desde) {

        const antes = estado.movimientos.filter((m) => !m.fecha || m.fecha < desde);

        const despues = estado.movimientos.filter((m) => m.fecha && m.fecha >= desde);

        return { empieza: saldoDe(despues), aparte: saldoDe(antes) };

    }

    function actualizar() {

        const desde = deInput($("cicloFecha").value);

        $("cicloError").textContent = "";

        if (!desde) { $("cicloEmpieza").textContent = "—"; $("cicloAparte").textContent = "—"; return; }

        const { empieza, aparte } = calcular(desde);

        $("cicloEmpieza").textContent = money(empieza);

        $("cicloAparte").textContent = money(aparte);

        const s = ultimoSueldo();

        $("cicloPista").textContent = s && s.fecha.getTime() === desde.getTime()
            ? `Es el día en que registraste tu sueldo (${money(s.monto)}).`
            : s
                ? `Tu último sueldo registrado fue el ${corto(s.fecha)} (${money(s.monto)}).`
                : "Si aún no registraste tu sueldo, escríbelo en la barra (ej: «me pagaron 2500») y queda dentro.";

    }

    function abrir() {

        const s = ultimoSueldo();

        const sugerida = estado.ciclo ? estado.ciclo.inicio : (s ? s.fecha : new Date());

        const f = $("cicloFecha");

        f.max = aInput(new Date());

        f.value = aInput(sugerida);

        $("cicloQuitar").hidden = !estado.ciclo;

        $("cicloOk").textContent = estado.ciclo ? "Guardar nueva fecha" : "Empezar desde aquí";

        $("cicloOverlay").hidden = false;

        actualizar();

        setTimeout(() => f.focus(), 50);

    }

    function cerrar() { $("cicloOverlay").hidden = true; }

    async function guardar(valores, aviso) {

        const botones = [$("cicloOk"), $("cicloQuitar")];

        botones.forEach((b) => { b.disabled = true; });

        try {

            await api("ciclo", valores);

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

        $("cicloFecha").addEventListener("input", actualizar);

        $("cicloCerrar").addEventListener("click", cerrar);

        $("cicloOverlay").addEventListener("click", (e) => { if (e.target === $("cicloOverlay")) cerrar(); });

        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("cicloOverlay").hidden) cerrar(); });

        $("cicloForm").addEventListener("submit", (e) => {

            e.preventDefault();

            const desde = deInput($("cicloFecha").value);

            if (!desde) { $("cicloError").textContent = "Elige una fecha."; return; }

            if (desde > new Date()) { $("cicloError").textContent = "La fecha no puede ser futura."; return; }

            guardar({ inicio: aTexto(desde) }, `💸 Listo: tu saldo cuenta desde el ${desde.getDate()}/${desde.getMonth() + 1}`);

        });

        $("cicloQuitar").addEventListener("click", () => guardar({ quitar: true }, "Tu saldo vuelve a contar todo"));

    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

    return { abrir, calcular };

})();
