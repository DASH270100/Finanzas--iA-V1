/* =========================================================
   CUENTA COMPARTIDA (pareja, roomies…)
   - Se invita por usuario; la otra persona acepta
   - Cada gasto guarda cuánto puso cada uno
   - Total del mes, aportes de cada uno y la lista de gastos
   - Las cuentas personales no se mezclan
   ========================================================= */
(function () {

    let mesVisto = null;          // "2026-10"; null = el mes actual

    let ocupado = false;

    const vacio = () => ({ activo: null, recibidas: [], enviada: null });

    const comp = () => estado.compartido || vacio();

    const primerNombre = (n) => String(n || "").trim().split(/\s+/)[0] || n;

    const iniciales = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";

    const r2 = (x) => Math.round(Number(x) * 100) / 100;

    // El primero de la lista siempre tiene el color A y el segundo el B (igual en los dos celulares)
    const colorDe = (i) => `var(--comp-${["a", "b", "c", "d"][i] || "d"})`;

    function nombreDe(usuario) {

        const a = comp().activo;

        const p = a && a.miembros.find((m) => m.usuario === usuario);

        return p ? primerNombre(p.nombre) : usuario;

    }

    // Los gastos con su fecha ya convertida
    function gastos() {

        const a = comp().activo;

        if (!a) return [];

        return (a.gastos || []).map((g, i) => ({ ...g, idx: i, f: parseFecha(g.fecha) }));

    }

    const mesActual = () => claveMes(new Date());

    const delMes = (clave) => gastos().filter((g) => g.f && claveMes(g.f) === clave);

    // =========================
    // PANTALLA
    // =========================

    function render() {

        const c = comp();

        const a = c.activo;

        // Botón del switch y aviso de invitación en el inicio
        const otro = a ? a.miembros.find((m) => m.usuario !== a.yo) : null;

        $("switchCompNombre").textContent = otro ? `Con ${primerNombre(otro.nombre)}` : "Compartido";

        $("switchCuenta").classList.toggle("tiene-aviso", !a && c.recibidas.length > 0);

        const inv = c.recibidas[0];

        $("avisoInvitacion").hidden = !inv || !!a;

        if (inv) $("avisoInvitacion").innerHTML = `${ico("users")} <span><strong>${esc(primerNombre(inv.de.nombre))}</strong> te invitó a llevar cuentas juntos</span> <b>Ver</b>`;

        $("compSinEspacio").hidden = !!a;

        $("compEspacio").hidden = !a;

        if (!a) { renderSinEspacio(); return; }

        renderHero();

        renderAportesForm();

        renderLista();

        renderAjustes();

    }

    function renderSinEspacio() {

        const c = comp();

        const yo = (estado.usuario && estado.usuario.usuario) || "";

        if (c.recibidas.length) {

            $("compSinEspacio").innerHTML = c.recibidas.map((r) => `
                <section class="card comp-invitacion" data-inv="${esc(r.id)}">
                    <div class="comp-avatares">${avatar(r.de.nombre, 0)}${avatar((estado.usuario && estado.usuario.nombre) || "Tú", 1)}</div>
                    <h2>${esc(primerNombre(r.de.nombre))} te invitó a llevar cuentas juntos</h2>
                    <p>Verán juntos los gastos en común y cuánto pone cada uno. Tus gastos personales siguen siendo solo tuyos.</p>
                    <div class="comp-botones">
                        <button type="submit" data-comp="aceptar">Aceptar</button>
                        <button type="button" class="mov-btn" data-comp="rechazar">Ahora no</button>
                    </div>
                </section>`).join("");

            return;

        }

        if (c.enviada) {

            $("compSinEspacio").innerHTML = `
                <section class="card comp-intro comp-esperando">
                    <div class="comp-avatares">${avatar((estado.usuario && estado.usuario.nombre) || "Tú", 0)}${avatar(c.enviada.a.nombre, 1, true)}</div>
                    <h2>Esperando a ${esc(primerNombre(c.enviada.a.nombre))}</h2>
                    <p>Le llegó tu invitación. Cuando entre a la app y la acepte, aquí verán los gastos en común.</p>
                    <p class="comp-nota">Invitaste a <b>@${esc(c.enviada.a.usuario)}</b></p>
                    <button type="button" class="mov-btn mov-btn-borrar" data-comp="cancelar">Cancelar invitación</button>
                </section>`;

            return;

        }

        $("compSinEspacio").innerHTML = `
            <section class="card comp-intro">
                <div class="comp-icono">${ico("users")}</div>
                <h2>Lleven cuentas juntos</h2>
                <p>Para tu pareja, tu roomie o con quien compartas gastos de la casa.</p>
                <ul class="comp-puntos">
                    <li>${ico("receipt")} Anoten los gastos en común: súper, alquiler, salidas.</li>
                    <li>${ico("hand-coins")} En cada gasto, cada uno pone lo que aportó.</li>
                    <li>${ico("chart-column")} Vean el total del mes y cuánto puso cada uno.</li>
                </ul>
                <p class="comp-nota">Tus gastos personales siguen siendo solo tuyos.</p>
                ${yo ? `
                <form id="compInvitar" class="comp-invitar">
                    <label for="compUsuario">Usuario de la otra persona</label>
                    <div class="comp-invitar-fila">
                        <span class="comp-arroba">@</span>
                        <input id="compUsuario" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="su.usuario" required>
                        <button type="submit">Invitar</button>
                    </div>
                    <small>Tu usuario es <b>@${esc(yo)}</b>. Si prefieres, pásaselo para que te invite a ti.</small>
                </form>` : `<p class="comp-nota">Para invitar a alguien primero necesitas tu usuario y contraseña. Pídeselos a Diego.</p>`}
            </section>`;

    }

    function avatar(nombre, i, pendiente) {

        return `<span class="comp-avatar${pendiente ? " pendiente" : ""}" style="--c:${colorDe(i)}">${esc(iniciales(nombre))}</span>`;

    }

    function renderHero() {

        const a = comp().activo;

        const clave = mesVisto || mesActual();

        const lista = delMes(clave);

        const total = r2(lista.reduce((t, g) => t + g.total, 0));

        const por = a.miembros.map((m, i) => ({ ...m, i, monto: r2(lista.reduce((t, g) => t + (Number(g.aportes[m.usuario]) || 0), 0)) }));

        // Meses con gastos (más el actual) para elegir
        const meses = [...new Set([mesActual(), ...gastos().filter((g) => g.f).map((g) => claveMes(g.f))])].sort().reverse();

        const opciones = meses.map((k) => `<option value="${k}"${k === clave ? " selected" : ""}>${esc(nombreMes(k))}</option>`).join("");

        const barra = total > 0
            ? por.filter((p) => p.monto > 0).map((p) => `<span style="--c:${colorDe(p.i)};flex:${p.monto}" title="${esc(primerNombre(p.nombre))}: ${money(p.monto)}"></span>`).join("")
            : `<span class="vacia"></span>`;

        const orden = [...por].sort((x, y) => y.monto - x.monto);

        const dif = orden.length > 1 ? r2(orden[0].monto - orden[1].monto) : 0;

        const nota = !total ? "Aún no hay gastos este mes"
            : dif < 0.5 ? "Este mes van parejos 🤝"
            : `${esc(primerNombre(orden[0].nombre))} puso ${money(dif)} más este mes`;

        $("compHero").innerHTML = `
            <div class="comp-top">
                <div class="comp-avatares">${a.miembros.map((m, i) => avatar(m.nombre, i)).join("")}</div>
                <div class="comp-titulo">
                    <strong>${esc(a.nombre)}</strong>
                    <small>Cuenta compartida</small>
                </div>
            </div>
            <div class="comp-fila-mes">
                <span class="comp-label">${clave === mesActual() ? "Gastaron este mes" : "Gastaron en " + esc(nombreMes(clave).toLowerCase())}</span>
                <select id="compMes" class="comp-mes" aria-label="Mes">${opciones}</select>
            </div>
            <strong class="comp-total">${money(total)}</strong>
            <div class="comp-barra" role="img" aria-label="${esc(por.map((p) => primerNombre(p.nombre) + " " + money(p.monto)).join(", "))}">${barra}</div>
            <div class="comp-personas">
                ${por.map((p) => `
                <div class="comp-persona" style="--c:${colorDe(p.i)}">
                    <span class="comp-punto"></span>
                    <span class="comp-quien">${esc(primerNombre(p.nombre))}</span>
                    <b>${money(p.monto)}</b>
                    <small>${total > 0 ? Math.round(p.monto / total * 100) : 0}%</small>
                </div>`).join("")}
            </div>
            <p class="comp-dif">${nota}</p>
            ${a.error ? `<p class="comp-error">⚠️ ${esc(a.error)}</p>` : ""}`;

    }

    // Un campo por persona en el formulario a mano
    function renderAportesForm() {

        const a = comp().activo;

        const caja = $("compAportes");

        const firma = a.miembros.map((m) => m.usuario).join(",");

        if (caja.dataset.firma === firma) return;

        caja.dataset.firma = firma;

        caja.innerHTML = a.miembros.map((m, i) => `
            <label class="comp-aporte" style="--c:${colorDe(i)}">
                <span><span class="comp-punto"></span>Puso ${esc(primerNombre(m.nombre))}${m.usuario === a.yo ? " (tú)" : ""}</span>
                <input type="number" step="0.01" min="0" inputmode="decimal" data-aporte="${esc(m.usuario)}" placeholder="0.00">
            </label>`).join("");

        const otro = a.miembros.find((m) => m.usuario !== a.yo);

        $("compTexto").placeholder = `súper 120, yo 80 ${otro ? primerNombre(otro.nombre) : ""} 40`.replace("  ", " ");

        document.querySelectorAll("#compEjemplos [data-comp-ejemplo]").forEach((b) => {

            b.dataset.compEjemplo = b.dataset.base.replace("{otro}", otro ? primerNombre(otro.nombre) : "");

            b.textContent = b.dataset.compEjemplo;

        });

    }

    function textoAportes(g) {

        const a = comp().activo;

        const pusieron = a.miembros.filter((m) => (Number(g.aportes[m.usuario]) || 0) > 0.004);

        if (pusieron.length === 1) return `Pagó ${esc(nombreDe(pusieron[0].usuario))}`;

        return pusieron.map((m) => `${esc(nombreDe(m.usuario))} ${money(g.aportes[m.usuario])}`).join(" · ");

    }

    function renderLista() {

        const a = comp().activo;

        const clave = mesVisto || mesActual();

        const lista = delMes(clave).sort((x, y) => (y.f - x.f) || (y.idx - x.idx));

        // Gastos sin fecha legible (no debería pasar) van al final del mes actual
        if (clave === mesActual()) gastos().filter((g) => !g.f).forEach((g) => lista.push(g));

        $("compListaTitulo").textContent = clave === mesActual() ? "Gastos de este mes" : "Gastos de " + nombreMes(clave).toLowerCase();

        if (!lista.length) {

            const otro = a.miembros.find((m) => m.usuario !== a.yo);

            $("compLista").innerHTML = vacioGuia("🧾", "Aún no hay gastos en común",
                "Anota el primero arriba. Por ejemplo, si fueron al súper y cada uno puso una parte:",
                `súper 120, yo 80 ${otro ? primerNombre(otro.nombre) : ""} 40`.replace("  ", " "));

            return;

        }

        const grupos = [];

        lista.forEach((g) => {

            const k = g.f ? g.f.toDateString() : "x";

            let d = grupos.find((x) => x.k === k);

            if (!d) { d = { k, f: g.f, lista: [] }; grupos.push(d); }

            d.lista.push(g);

        });

        $("compLista").innerHTML = grupos.map((d) => `
            <div class="act-dia">
                <span>${d.f ? esc(etiquetaDia(d.f)) : "Sin fecha"}</span>
                <span>${money(d.lista.reduce((t, g) => t + g.total, 0))}</span>
            </div>
            ${d.lista.map((g) => `
            <div class="movimiento comp-gasto" data-gasto="${esc(g.id)}">
                ${burbujaCategoria(g.categoria || g.descripcion, false)}
                <span class="mov-txt">
                    <strong>${esc(g.descripcion)}</strong>
                    <small>${textoAportes(g)}</small>
                </span>
                <div class="comp-lado">
                    <span class="mov-monto">${money(g.total)}</span>
                    <div class="comp-mini">
                        <button class="mov-btn btn-ico" type="button" data-comp="editar" aria-label="Editar ${esc(g.descripcion)}" title="Editar">${ico("pencil")}</button>
                        <button class="mov-btn mov-btn-borrar btn-ico" type="button" data-comp="borrar" aria-label="Borrar ${esc(g.descripcion)}" title="Borrar">${ico("trash")}</button>
                    </div>
                </div>
            </div>`).join("")}`).join("");

    }

    function renderAjustes() {

        const a = comp().activo;

        $("compAjustes").innerHTML = `
            <div class="comp-miembros">
                ${a.miembros.map((m, i) => `<span class="comp-miembro">${avatar(m.nombre, i)} ${esc(m.nombre)} <small>@${esc(m.usuario)}</small></span>`).join("")}
            </div>
            <button type="button" class="mov-btn mov-btn-borrar" data-comp="salir">Dejar de compartir</button>
            <small class="comp-nota">Si uno deja de compartir, el espacio se cierra para los dos. Los gastos personales no se tocan.</small>`;

    }

    // =========================
    // FORMULARIO A MANO
    // =========================

    function abrirFormulario(g) {

        const f = $("compForm");

        f.reset();

        $("compId").value = g ? g.id : "";

        $("compDesc").value = g ? g.descripcion : "";

        $("compCat").value = g ? g.categoria : "";

        $("compTotal").value = g ? g.total : "";

        $("compFecha").value = g && g.f ? aInputFecha(g.f) : aInputFecha(new Date());

        f.querySelectorAll("[data-aporte]").forEach((i) => { i.value = g ? (Number(g.aportes[i.dataset.aporte]) || 0) : ""; i.dataset.tocado = g ? "1" : ""; });

        $("compGuardar").textContent = g ? "Guardar cambios" : "Anotar gasto";

        f.hidden = false;

        $("compManualBtn").hidden = true;

        cuadre();

        f.scrollIntoView({ behavior: "smooth", block: "center" });

        $("compDesc").focus({ preventScroll: true });

    }

    function cerrarFormulario() {

        $("compForm").hidden = true;

        $("compManualBtn").hidden = false;

    }

    // Muestra si los aportes suman el total
    function cuadre() {

        const total = Number($("compTotal").value) || 0;

        const campos = [...document.querySelectorAll("#compAportes [data-aporte]")];

        const llenos = campos.filter((i) => i.value !== "");

        const suma = r2(llenos.reduce((t, i) => t + (Number(i.value) || 0), 0));

        const el = $("compCuadre");

        el.className = "comp-cuadre";

        if (!llenos.length) { el.textContent = total > 0 ? "Si no pones aportes, se anota como pagado por ti." : ""; return; }

        if (total > 0 && Math.abs(suma - total) < 0.01) { el.textContent = "✓ Cuadra con el total"; el.classList.add("ok"); return; }

        if (total > 0 && suma > total) { el.textContent = `Los aportes suman ${money(suma)}: ${money(r2(suma - total))} más que el total`; el.classList.add("mal"); return; }

        if (total > 0) { el.textContent = `Faltan ${money(r2(total - suma))} por repartir`; el.classList.add("falta"); return; }

        el.textContent = `El total será ${money(suma)}`;

    }

    // Con dos personas: al escribir lo de una, la otra se completa sola con lo que falta
    function autocompletar(e) {

        const t = e.target;

        if (t.id === "compTotal") {

            const campos = [...document.querySelectorAll("#compAportes [data-aporte]")];

            const tocados = campos.filter((i) => i.dataset.tocado);

            if (campos.length === 2 && tocados.length === 1) {

                const otro = campos.find((i) => !i.dataset.tocado);

                otro.value = Math.max(0, r2((Number(t.value) || 0) - (Number(tocados[0].value) || 0))) || "";

            }

            cuadre();

            return;

        }

        if (!t.dataset.aporte) return;

        t.dataset.tocado = "1";

        const campos = [...document.querySelectorAll("#compAportes [data-aporte]")];

        const total = Number($("compTotal").value) || 0;

        if (campos.length === 2 && total > 0) {

            const otro = campos.find((i) => i !== t);

            otro.dataset.tocado = "";

            otro.value = Math.max(0, r2(total - (Number(t.value) || 0)));

        }

        cuadre();

    }

    async function guardarFormulario(e) {

        e.preventDefault();

        if (ocupado) return;

        const aportes = {};

        document.querySelectorAll("#compAportes [data-aporte]").forEach((i) => { if (i.value !== "") aportes[i.dataset.aporte] = Number(i.value); });

        const datos = {
            op: "gasto",
            id: $("compId").value,
            descripcion: $("compDesc").value.trim(),
            categoria: $("compCat").value.trim(),
            total: Number($("compTotal").value) || 0,
            fecha: $("compFecha").value,
            aportes
        };

        if (!datos.descripcion) { mostrarToast("✍️ Escribe en qué fue el gasto"); $("compDesc").focus(); return; }

        const boton = $("compGuardar");

        const original = boton.textContent;

        ocupado = true;

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await api("compartido", datos);

            cerrarFormulario();

            await recargar();

            mostrarToast(datos.id ? "✓ Gasto actualizado" : `✓ Anotado: ${datos.descripcion}`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            ocupado = false;

            boton.disabled = false;

            boton.textContent = original;

        }

    }

    // =========================
    // ANOTAR ESCRIBIENDO
    // =========================

    async function anotarTexto(e) {

        if (e) e.preventDefault();

        if (ocupado) return;

        const texto = $("compTexto").value.trim();

        if (!texto) { $("compTexto").focus(); return; }

        const boton = $("compEnviar");

        ocupado = true;

        boton.disabled = true;

        boton.classList.add("cargando");

        $("compEstado").textContent = "Anotando…";

        $("compEstado").className = "comp-estado";

        try {

            const r = await api("compartido", { op: "texto", mensaje: texto });

            $("compTexto").value = "";

            ajustarAlto();

            await recargar();

            const nuevos = gastos().filter((g) => (r.ids || []).includes(g.id));

            $("compEstado").innerHTML = nuevos.length
                ? "✓ " + nuevos.map((g) => `<b>${esc(g.descripcion)} ${money(g.total)}</b> <span>${textoAportes(g)}</span>`).join("<br>✓ ")
                : "✓ Anotado";

            $("compEstado").classList.add("ok");

            if (r.aviso) mostrarToast("⚠️ " + r.aviso);

        } catch (err) {

            $("compEstado").textContent = "❌ " + (err.message || "No se pudo anotar");

            $("compEstado").classList.add("mal");

            if (err instanceof ErrorPin) errorDeAccion(err);

        } finally {

            ocupado = false;

            boton.disabled = false;

            boton.classList.remove("cargando");

        }

    }

    function ajustarAlto() {

        const t = $("compTexto");

        t.style.height = "auto";

        t.style.height = Math.min(t.scrollHeight, 120) + "px";

    }

    async function recargar() {

        await cargarDatos();

        renderTodo();

    }

    // =========================
    // CLICS
    // =========================

    async function clic(e) {

        const b = e.target.closest("[data-comp]");

        if (!b || ocupado) return;

        const accion = b.dataset.comp;

        const c = comp();

        try {

            if (accion === "editar") {

                const g = gastos().find((x) => x.id === b.closest("[data-gasto]").dataset.gasto);

                if (g) abrirFormulario(g);

                return;

            }

            // Lo que no se puede deshacer pide un segundo toque
            if ((accion === "borrar" || accion === "salir" || accion === "cancelar") && !b.dataset.confirmar) {

                const original = b.innerHTML;

                b.dataset.confirmar = "1";

                b.textContent = accion === "salir" ? "¿Seguro? Toca otra vez" : "¿Seguro?";

                setTimeout(() => { if (b.isConnected) { b.dataset.confirmar = ""; b.innerHTML = original; } }, 3500);

                return;

            }

            ocupado = true;

            b.disabled = true;

            if (accion === "borrar") {

                await api("compartido", { op: "borrar", id: b.closest("[data-gasto]").dataset.gasto });

                await recargar();

                mostrarToast("🗑️ Gasto borrado");

            } else if (accion === "aceptar" || accion === "rechazar") {

                const id = b.closest("[data-inv]").dataset.inv;

                await api("compartido", { op: "responder", id, aceptar: accion === "aceptar" });

                await recargar();

                mostrarToast(accion === "aceptar" ? "🤝 ¡Listo! Ya comparten cuentas" : "Invitación rechazada");

            } else if (accion === "cancelar") {

                await api("compartido", { op: "cancelar", id: c.enviada.id });

                await recargar();

                mostrarToast("Invitación cancelada");

            } else if (accion === "salir") {

                await api("compartido", { op: "salir" });

                mesVisto = null;

                await recargar();

                mostrarToast("Dejaste de compartir cuentas");

            }

        } catch (err) {

            errorDeAccion(err);

        } finally {

            ocupado = false;

            if (b.isConnected) b.disabled = false;

        }

    }

    async function invitar(e) {

        if (!e.target.closest("#compInvitar")) return;

        e.preventDefault();

        if (ocupado) return;

        const usuario = $("compUsuario").value.trim().replace(/^@/, "");

        if (!usuario) { $("compUsuario").focus(); return; }

        const b = e.target.querySelector("button");

        ocupado = true;

        b.disabled = true;

        b.textContent = "⏳";

        try {

            const r = await api("compartido", { op: "invitar", usuario });

            await recargar();

            mostrarToast(r.activo ? "🤝 ¡Listo! Ya comparten cuentas" : `💌 Invitación enviada a @${usuario.toLowerCase()}`);

        } catch (err) {

            errorDeAccion(err);

            if (b.isConnected) { b.disabled = false; b.textContent = "Invitar"; }

        } finally {

            ocupado = false;

        }

    }

    function iniciar() {

        if (!$("vista-compartido")) return;

        $("switchCuenta").addEventListener("click", (e) => {

            const b = e.target.closest("[data-cuenta]");

            if (b) mostrarVista(b.dataset.cuenta === "compartida" ? "compartido" : "dashboard");

        });

        $("avisoInvitacion").addEventListener("click", () => mostrarVista("compartido"));

        $("vista-compartido").addEventListener("click", clic);

        $("vista-compartido").addEventListener("submit", invitar);

        $("vista-compartido").addEventListener("change", (e) => {

            if (e.target.id !== "compMes") return;

            mesVisto = e.target.value === mesActual() ? null : e.target.value;

            renderHero();

            renderLista();

        });

        $("compTextoForm").addEventListener("submit", anotarTexto);

        $("compTexto").addEventListener("input", ajustarAlto);

        $("compTexto").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) anotarTexto(e); });

        $("compEjemplos").addEventListener("click", (e) => {

            const b = e.target.closest("[data-comp-ejemplo]");

            if (!b) return;

            $("compTexto").value = b.dataset.compEjemplo;

            ajustarAlto();

            $("compTexto").focus();

        });

        // El ejemplo de la lista vacía llena esta barra, no la de tus gastos personales
        $("compLista").addEventListener("click", (e) => {

            const b = e.target.closest("[data-ejemplo]");

            if (!b) return;

            e.stopPropagation();

            $("compTexto").value = b.dataset.ejemplo;

            ajustarAlto();

            $("compTexto").focus();

        });

        $("compManualBtn").addEventListener("click", () => abrirFormulario(null));

        $("compCancelar").addEventListener("click", cerrarFormulario);

        $("compForm").addEventListener("submit", guardarFormulario);

        $("compForm").addEventListener("input", autocompletar);

    }

    window.compartido = { render };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

})();
