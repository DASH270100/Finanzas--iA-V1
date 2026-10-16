/* =========================================================
   MODO FREELANCE: trabajos por cobrar
   - Lista de lo que te deben, con fecha de cobro y avisos
   - "Me pagaron" (todo o una parte) registra el ingreso Freelance
   - Tus clientes del año: cuánto te pagó cada uno
   ========================================================= */
(function () {

    const MS = 86400000;

    const COLORES = ["#6366F1", "#10B981", "#F59E0B", "#EC4899", "#0EA5E9", "#8B5CF6", "#14B8A6", "#F97316"];

    const avisados = new Set();

    const sinTildes = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

    function colorDe(nombre) {

        let h = 0;

        for (const ch of sinTildes(nombre)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;

        return COLORES[h % COLORES.length];

    }

    const iniciales = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";

    // Cuándo toca cobrar
    function cuando(x) {

        if (!x.fecha) return { clase: "sin-fecha", texto: "Sin fecha de cobro" };

        const hoy = new Date(); const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

        const d = Math.round((x.fecha - h0) / MS);

        if (d < 0) return { clase: "vencido", texto: `Debió pagarte el ${fechaCorta(x.fecha)} · hace ${-d} ${d === -1 ? "día" : "días"}`, dias: d };

        if (d === 0) return { clase: "hoy", texto: "Te pagan hoy", dias: 0 };

        return { clase: d <= 3 ? "pronto" : "futuro", texto: `Te paga el ${fechaCorta(x.fecha)} · ${d === 1 ? "mañana" : `en ${d} días`}`, dias: d };

    }

    // ---------- Lista ----------

    function itemHTML(x) {

        const c = cuando(x);

        return `
            <div class="cobro-item estado-${c.clase}" data-cobro="${esc(x.id)}">

                <div class="cobro-top">

                    <span class="cobro-avatar" style="--av:${colorDe(x.cliente)}">${esc(iniciales(x.cliente))}</span>

                    <div class="cobro-info">
                        <strong>${esc(x.trabajo || x.cliente)}</strong>
                        <span>${x.trabajo ? esc(x.cliente) : "Trabajo freelance"}</span>
                        <small class="cobro-cuando">${ico("calendar-days")} ${esc(c.texto)}</small>
                    </div>

                    <div class="cobro-lado">
                        <b class="cobro-monto">${money(x.monto)}</b>
                        <div class="cobro-mini">
                            <button class="mov-btn btn-ico" type="button" data-cobrar="editar" aria-label="Editar" title="Editar">${ico("pencil")}</button>
                            <button class="mov-btn mov-btn-borrar btn-ico" type="button" data-cobrar="quitar" aria-label="Quitar" title="Quitar">${ico("trash")}</button>
                        </div>
                    </div>

                </div>

                <div class="cobro-acciones">
                    <button class="mov-btn mov-btn-primario" type="button" data-cobrar="todo">✓ Me pagaron</button>
                    <button class="mov-btn" type="button" data-cobrar="parte">Pagó una parte</button>
                </div>

                <form class="cobro-parte" data-cobrar-parte hidden>
                    <input type="number" step="0.01" min="0.01" max="${x.monto}" inputmode="decimal" placeholder="¿Cuánto te pagaron?" aria-label="Monto que te pagaron" required>
                    <button type="submit">Registrar</button>
                </form>

            </div>`;

    }

    // Clientes del año: ingresos Freelance agrupados por cliente ("Trabajo · Cliente")
    function clientesDelAnio() {

        const anio = new Date().getFullYear();

        const mapa = new Map();

        estado.movimientos.filter((m) => m.fecha && m.fecha.getFullYear() === anio && esIngresoReal(m) && /freelance/i.test(sinTildes(m.categoria)))
            .forEach((m) => {

                const d = String(m.descripcion || "").trim();

                const cliente = d.includes(" · ") ? d.split(" · ").pop().trim() : (d || "Sin nombre");

                const k = sinTildes(cliente);

                const x = mapa.get(k) || { cliente, total: 0, veces: 0 };

                x.total += m.monto;

                x.veces++;

                mapa.set(k, x);

            });

        return [...mapa.values()].sort((a, b) => b.total - a.total);

    }

    function render() {

        const caja = document.getElementById("porCobrar");

        if (!caja) return;

        const todos = estado.porCobrar || [];

        const pendientes = todos.filter((x) => !x.cobrado).sort((a, b) => (a.fecha ? a.fecha.getTime() : Infinity) - (b.fecha ? b.fecha.getTime() : Infinity));

        const cobrados = todos.filter((x) => x.cobrado).sort((a, b) => (b.cobradoEl || 0) - (a.cobradoEl || 0)).slice(0, 5);

        const total = pendientes.reduce((s, x) => s + x.monto, 0);

        const vencidos = pendientes.filter((x) => cuando(x).clase === "vencido");

        $("subtituloCobrar").textContent = pendientes.length
            ? `Te deben ${money(total)} · ${pendientes.length} ${pendientes.length === 1 ? "trabajo" : "trabajos"}${vencidos.length ? ` · ${vencidos.length} ${vencidos.length === 1 ? "atrasado" : "atrasados"}` : ""}`
            : "Tus trabajos freelance: quién te debe y cuándo te paga.";

        caja.innerHTML = pendientes.length
            ? pendientes.map(itemHTML).join("")
            : vacioGuia("💼", "Nadie te debe nada 🙌",
                "Cuando hagas un trabajo y te paguen después, agrégalo abajo. Te aviso cuando toque cobrar y, al pagarte, se registra solo como ingreso.");

        if (cobrados.length) {

            caja.innerHTML += `
                <details class="cobrados">
                    <summary>Cobrados recientemente</summary>
                    ${cobrados.map((x) => `<div class="cobrado-fila"><span>${ico("circle-dollar-sign")} ${esc(x.trabajo || x.cliente)} · ${esc(x.cliente)}</span><b>${x.cobradoEl ? fechaCorta(x.cobradoEl) : ""}</b></div>`).join("")}
                </details>`;

        }

        // Clientes para autocompletar
        const nombres = [...new Set(todos.map((x) => x.cliente).concat(clientesDelAnio().map((c) => c.cliente)))];

        $("listaClientes").innerHTML = nombres.map((n) => `<option value="${esc(n)}"></option>`).join("");

        // Ranking de clientes
        const top = clientesDelAnio().slice(0, 5);

        const max = top.length ? top[0].total : 1;

        const anual = clientesDelAnio().reduce((s, c) => s + c.total, 0);

        $("clientesTop").innerHTML = top.length ? `
            <h3>${ico("trending-up", "ico h-ico")}Tus clientes en ${new Date().getFullYear()}</h3>
            <p class="clientes-total">Ganaste <b>${money(anual)}</b> en trabajos freelance este año</p>
            ${top.map((c) => `
                <div class="cliente-fila">
                    <span class="cobro-avatar chica" style="--av:${colorDe(c.cliente)}">${esc(iniciales(c.cliente))}</span>
                    <div class="cliente-datos">
                        <div class="cliente-cab"><strong>${esc(c.cliente)}</strong><b>${money(c.total)}</b></div>
                        <div class="cliente-barra"><span style="width:${Math.max(4, Math.round((c.total / max) * 100))}%;background:${colorDe(c.cliente)}"></span></div>
                        <small>${c.veces} ${c.veces === 1 ? "pago" : "pagos"}</small>
                    </div>
                </div>`).join("")}` : "";

        avisar(pendientes);

    }

    // Una vez por sesión: "Hoy te paga X" / "X te debe desde hace N días"
    function avisar(pendientes) {

        if (modoDemo) return;

        const urgentes = pendientes.filter((x) => { const c = cuando(x); return (c.clase === "hoy" || c.clase === "vencido") && !avisados.has(x.id); });

        if (!urgentes.length) return;

        urgentes.forEach((x) => avisados.add(x.id));

        const x = urgentes[0], c = cuando(x);

        const texto = c.clase === "hoy"
            ? `💼 Hoy te paga ${x.cliente}: ${money(x.monto)}`
            : `💼 ${x.cliente} te debe ${money(x.monto)} desde hace ${-c.dias} ${c.dias === -1 ? "día" : "días"}`;

        setTimeout(() => mostrarToast(texto + (urgentes.length > 1 ? ` (+${urgentes.length - 1} más)` : "")), 2500);

    }

    // ---------- Acciones ----------

    async function guardar(e) {

        e.preventDefault();

        const boton = $("cobrarBoton");

        const datos = {
            id: $("cobrarId").value || undefined,
            cliente: $("cobrarCliente").value.trim(),
            trabajo: $("cobrarTrabajo").value.trim(),
            monto: Number($("cobrarMonto").value),
            fecha: $("cobrarFecha").value
        };

        if (!datos.cliente || !(datos.monto > 0)) { mostrarToast("Escribe el cliente y el monto"); return; }

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await api("porCobrar", datos);

            await cargarDatos();

            renderTodo();

            $("cobrarForm").reset();

            $("cobrarId").value = "";

            cerrarForm("cobrarForm");

            mostrarToast(datos.id ? "✅ Trabajo actualizado" : `✅ Anotado: ${datos.cliente} te debe ${money(datos.monto)}`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar";

        }

    }

    async function cobrar(id, monto) {

        const x = (estado.porCobrar || []).find((c) => c.id === id);

        if (!x) return;

        try {

            const r = await api("cobrar", monto ? { id, monto } : { id });

            await cargarDatos();

            renderTodo();

            mostrarToast(r.resta > 0.005
                ? `💰 Registrado ${money(monto)} de ${x.cliente} · aún te debe ${money(r.resta)}`
                : `💰 ¡${x.cliente} te pagó ${money(monto || x.monto)}! Ya está en tus ingresos`);

        } catch (err) {

            errorDeAccion(err);

        }

    }

    async function clic(e) {

        const b = e.target.closest("[data-cobrar]");

        if (!b) return;

        const item = b.closest("[data-cobro]");

        const id = item.dataset.cobro;

        const x = (estado.porCobrar || []).find((c) => c.id === id);

        const accion = b.dataset.cobrar;

        if (accion === "todo") { b.disabled = true; await cobrar(id); return; }

        if (accion === "parte") {

            const f = item.querySelector("[data-cobrar-parte]");

            f.hidden = !f.hidden;

            if (!f.hidden) f.querySelector("input").focus();

            return;

        }

        if (accion === "editar" && x) {

            $("cobrarId").value = x.id;

            $("cobrarCliente").value = x.cliente;

            $("cobrarTrabajo").value = x.trabajo;

            $("cobrarMonto").value = x.monto;

            $("cobrarFecha").value = x.fecha ? aInputFecha(x.fecha) : "";

            abrirForm("cobrarForm");

            $("cobrarForm").scrollIntoView({ behavior: "smooth", block: "center" });

            return;

        }

        if (accion === "quitar") {

            if (!b.dataset.confirmar) {

                b.dataset.confirmar = "1";

                b.textContent = "¿Seguro?";

                setTimeout(() => { if (b.isConnected) { b.dataset.confirmar = ""; b.innerHTML = ico("trash"); } }, 3000);

                return;

            }

            try {

                await api("porCobrar", { id, quitar: true });

                await cargarDatos();

                renderTodo();

                mostrarToast("🗑️ Trabajo quitado");

            } catch (err) {

                errorDeAccion(err);

            }

        }

    }

    function parcial(e) {

        const f = e.target.closest("[data-cobrar-parte]");

        if (!f) return;

        e.preventDefault();

        const monto = Number(f.querySelector("input").value);

        if (!(monto > 0)) return;

        f.querySelector("button").disabled = true;

        cobrar(f.closest("[data-cobro]").dataset.cobro, monto);

    }

    function iniciar() {

        if (!document.getElementById("cobrarForm")) return;

        $("cobrarForm").addEventListener("submit", guardar);

        $("porCobrar").addEventListener("click", clic);

        $("porCobrar").addEventListener("submit", parcial);

    }

    window.freelance = { render, clientesDelAnio };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

})();
