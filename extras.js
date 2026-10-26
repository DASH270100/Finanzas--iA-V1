/* =========================================================
   EXTRAS
   - Cobros que se repiten (posibles suscripciones) → agregarlos a gastos fijos
   - Ahorro mes a mes (Estadísticas)
   - Dividir una cuenta con amigos (Deudas)
   - Mis categorías: renombrar o juntar (Configuración)
   - Mis datos: descargar todo / pedir borrar la cuenta (Configuración)
   ========================================================= */
(function () {

    const r2 = (x) => Math.round(Number(x) * 100) / 100;

    const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/[0-9.,:;()\-–—_/·]+/g, " ").replace(/\s+/g, " ").trim();

    const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

    // =========================
    // COBROS QUE SE REPITEN
    // =========================

    const CLAVE_NO = "finanzas_no_subs";

    const descartados = () => { try { return JSON.parse(localStorage.getItem(CLAVE_NO) || "[]"); } catch (e) { return []; } };

    function candidatos() {

        const hoy = new Date();

        const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);

        const recientes = new Set([claveMes(hoy), claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1))]);

        const fijos = estado.fijos.map((f) => norm(f.nombre)).filter(Boolean);

        const no = new Set(descartados());

        const grupos = new Map();

        estado.movimientos.forEach((m) => {

            if (!esGastoReal(m) || esInteres(m) || !m.fecha || m.fecha < desde) return;

            const k = norm(m.descripcion);

            if (k.length < 3) return;

            if (!grupos.has(k)) grupos.set(k, []);

            grupos.get(k).push(m);

        });

        const out = [];

        grupos.forEach((lista, k) => {

            const meses = new Set(lista.map((m) => claveMes(m.fecha)));

            if (meses.size < 2 || lista.length > meses.size * 1.5) return;            // varios meses, ~1 vez al mes

            if ([...meses].filter((x) => recientes.has(x)).length < 2) return;       // y que siga pasando

            const montos = lista.map((m) => m.monto).sort((a, b) => a - b);

            const mediana = montos[Math.floor(montos.length / 2)];

            if (montos.some((x) => Math.abs(x - mediana) > mediana * 0.15)) return;  // casi el mismo monto

            if (no.has(k) || fijos.some((f) => f && (f.includes(k) || k.includes(f)))) return;

            const ultimo = lista.slice().sort((a, b) => b.fecha - a.fecha)[0];

            out.push({ k, nombre: ultimo.descripcion, categoria: ultimo.categoria, monto: ultimo.monto, dia: ultimo.fecha.getDate(),
                meses: [...meses].sort().map((x) => MESES_CORTOS[Number(x.slice(5)) - 1]) });

        });

        return out.sort((a, b) => b.monto - a.monto).slice(0, 6);

    }

    function renderSuscripciones() {

        const card = $("suscripcionesCard");

        if (!card) return;

        const lista = candidatos();

        card.hidden = !lista.length;

        if (!lista.length) return;

        $("suscripciones").innerHTML = lista.map((x) => `
            <div class="sub-item" data-sub="${esc(x.k)}">
                ${burbujaCategoria(x.categoria, false)}
                <span class="mov-txt">
                    <strong>${esc(x.nombre)}</strong>
                    <small>${money(x.monto)} · el día ${x.dia} · visto en ${esc(x.meses.join(", "))}</small>
                </span>
                <div class="sub-acciones">
                    <button type="button" class="mov-btn mov-btn-primario" data-sub-accion="fijo">Es fijo</button>
                    <button type="button" class="mov-btn" data-sub-accion="no">No</button>
                </div>
            </div>`).join("");

    }

    async function clicSuscripcion(e) {

        const b = e.target.closest("[data-sub-accion]");

        if (!b) return;

        const k = b.closest("[data-sub]").dataset.sub;

        const x = candidatos().find((c) => c.k === k);

        if (!x) return;

        if (b.dataset.subAccion === "no") {

            try { localStorage.setItem(CLAVE_NO, JSON.stringify([...descartados(), k].slice(-60))); } catch (err) {}

            renderSuscripciones();

            mostrarToast("Listo, no te lo vuelvo a sugerir");

            return;

        }

        b.disabled = true;

        try {

            await guardarFijo({ nombre: x.nombre, categoria: x.categoria, monto: x.monto, dia: x.dia, tipo: "Gasto" });

            mostrarToast(`📅 ${x.nombre} ahora es un gasto fijo: te aviso 2 días antes`);

        } catch (err) {

            errorDeAccion(err);

        }

    }

    // =========================
    // AHORRO MES A MES
    // =========================

    // 638 · 1.3k · 12k (las columnas son angostas en el celular)
    const corto = (n) => n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (Math.round(n / 100) / 10).toFixed(1) + "k" : String(Math.round(n));

    function renderAhorro() {

        const caja = $("ahorroBarras");

        if (!caja) return;

        const hoy = new Date();

        const meses = [];

        for (let i = 5; i >= 0; i--) meses.push(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1));

        const datos = meses.map((d) => {

            const k = claveMes(d);

            const delMes = estado.movimientos.filter((m) => m.fecha && claveMes(m.fecha) === k);

            const ing = sumar(delMes.filter(esIngresoReal)), gas = sumar(delMes.filter(esGastoReal));

            return { d, k, hay: delMes.length > 0, ahorro: r2(ing - gas) };

        });

        const conDatos = datos.filter((x) => x.hay);

        if (conDatos.length < 2) {

            caja.innerHTML = `<p class="vacio">Cuando tengas al menos 2 meses registrados, aquí verás cuánto te quedó cada uno.</p>`;

            $("ahorroSub").textContent = "Lo que te quedó cada mes: ingresos menos gastos.";

            return;

        }

        const max = Math.max(...conDatos.map((x) => Math.abs(x.ahorro)), 1);

        const cerrados = conDatos.filter((x) => x.k !== claveMes(hoy));

        const prom = cerrados.length ? r2(cerrados.reduce((t, x) => t + x.ahorro, 0) / cerrados.length) : null;

        $("ahorroSub").textContent = (prom === null ? "Lo que te quedó cada mes, en soles."
            : prom >= 0 ? `En promedio te quedan ${money(prom)} al mes (montos en soles).` : `En promedio gastas ${money(-prom)} más de lo que entra al mes.`);

        caja.setAttribute("aria-label", conDatos.map((x) => `${nombreMes(x.k)}: ${money(x.ahorro)}`).join(", "));

        caja.innerHTML = datos.map((x) => {

            const alto = x.hay ? Math.max(4, Math.round(Math.abs(x.ahorro) / max * 100)) : 0;

            const neg = x.ahorro < 0;

            return `
                <div class="ah-col${x.k === claveMes(hoy) ? " actual" : ""}${x.hay ? "" : " sin-datos"}">
                    <span class="ah-monto ${neg ? "neg" : ""}">${x.hay ? (neg ? "−" : "") + corto(Math.abs(x.ahorro)) : "—"}</span>
                    <div class="ah-zona">
                        <div class="ah-pos">${!neg && x.hay ? `<i style="height:${alto}%"></i>` : ""}</div>
                        <div class="ah-neg">${neg ? `<i style="height:${alto}%"></i>` : ""}</div>
                    </div>
                    <span class="ah-mes">${MESES_CORTOS[x.d.getMonth()]}</span>
                </div>`;

        }).join("");

    }

    // =========================
    // DIVIDIR UNA CUENTA
    // =========================

    function personasDividir() {

        const vistos = new Set();

        return $("dividirPersonas").value.split(/[,;\n]| y /).map((x) => x.trim()).filter((x) => {

            const k = x.toLowerCase();

            if (!x || vistos.has(k)) return false;

            vistos.add(k);

            return true;

        });

    }

    function calcularDividir() {

        const total = Number($("dividirTotal").value) || 0;

        const p = personasDividir();

        const partes = p.length + ($("dividirYo").checked ? 1 : 0);

        const el = $("dividirCalculo");

        if (!(total > 0) || !p.length) { el.textContent = ""; return; }

        const base = Math.floor(total / partes * 100) / 100;

        el.textContent = `${money(base)} cada uno · te deben ${money(r2(base * p.length))}` + (p.length > 1 ? ` (${p.join(", ")})` : ` (${p[0]})`);

    }

    async function guardarDividir(e) {

        e.preventDefault();

        const p = personasDividir();

        const b = $("dividirGuardar");

        b.disabled = true;

        try {

            const r = await api("dividir", {
                descripcion: $("dividirDesc").value.trim(),
                total: Number($("dividirTotal").value),
                personas: p,
                incluirme: $("dividirYo").checked
            });

            await cargarDatos();

            renderTodo();

            cerrarDividir();

            mostrarToast(`➗ Listo: ${money(r.porPersona)} cada uno. Cuando te paguen, escribe «Juan me pagó ${r.porPersona}».`.replace("Juan", p[0] || "Juan"));

        } catch (err) {

            errorDeAccion(err);

        } finally {

            b.disabled = false;

        }

    }

    function abrirDividir() {

        $("dividirForm").hidden = false;

        $("dividirBtn").setAttribute("aria-expanded", "true");

        $("dividirForm").reset();

        $("dividirYo").checked = true;

        calcularDividir();

        $("dividirDesc").focus();

    }

    function cerrarDividir() {

        $("dividirForm").hidden = true;

        $("dividirBtn").setAttribute("aria-expanded", "false");

    }

    // =========================
    // MIS CATEGORÍAS
    // =========================

    let editandoCat = null;

    function renderCategorias() {

        const caja = $("categoriasLista");

        if (!caja) return;

        const cuenta = new Map();

        estado.movimientos.forEach((m) => { if (m.categoria) cuenta.set(m.categoria, (cuenta.get(m.categoria) || 0) + 1); });

        const lista = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);

        $("categoriasBloque").hidden = !lista.length;

        caja.innerHTML = lista.slice(0, 40).map(([c, n]) => editandoCat === c ? `
            <form class="cat-fila editando" data-cat="${esc(c)}">
                ${burbujaCategoria(c, false)}
                <input type="text" maxlength="40" value="${esc(c)}" list="catOpciones" aria-label="Nuevo nombre para ${esc(c)}">
                <button type="submit">Guardar</button>
                <button type="button" class="mov-btn" data-cat-accion="cancelar">Cancelar</button>
            </form>` : `
            <div class="cat-fila" data-cat="${esc(c)}">
                ${burbujaCategoria(c, false)}
                <span class="mov-txt"><strong>${esc(c)}</strong><small>${n} ${n === 1 ? "movimiento" : "movimientos"}</small></span>
                <button type="button" class="mov-btn" data-cat-accion="editar">Renombrar</button>
            </div>`).join("") + `<datalist id="catOpciones">${lista.map(([c]) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
            <p class="cat-nota">Para juntar dos, ponle a una el nombre de la otra.</p>`;

    }

    function clicCategoria(e) {

        const b = e.target.closest("[data-cat-accion]");

        if (!b) return;

        editandoCat = b.dataset.catAccion === "editar" ? b.closest("[data-cat]").dataset.cat : null;

        renderCategorias();

        if (editandoCat) { const i = $("categoriasLista").querySelector("form input"); i.focus(); i.select(); }

    }

    async function guardarCategoria(e) {

        const f = e.target.closest("form[data-cat]");

        if (!f) return;

        e.preventDefault();

        const de = f.dataset.cat, a = f.querySelector("input").value.trim();

        if (!a) return;

        if (a === de) { editandoCat = null; renderCategorias(); return; }

        const junta = estado.movimientos.some((m) => m.categoria !== de && m.categoria.toLowerCase() === a.toLowerCase());

        f.querySelector("button[type=submit]").disabled = true;

        try {

            const r = await api("categoria", { de, a });

            editandoCat = null;

            await cargarDatos();

            renderTodo();

            mostrarToast(junta ? `🏷️ Junté «${de}» dentro de «${a}» (${r.cambiados} movimientos)` : `🏷️ «${de}» ahora se llama «${a}» (${r.cambiados} movimientos)`);

        } catch (err) {

            errorDeAccion(err);

        }

    }

    // =========================
    // MIS DATOS
    // =========================

    function descargarDatos() {

        const fecha = (d) => d instanceof Date ? d.toLocaleDateString("es-PE") : d;

        const limpio = (lista) => (lista || []).map((x) => {

            const o = {};

            Object.keys(x).forEach((k) => { if (!["idx", "fila", "info"].includes(k)) o[k] = fecha(x[k]); });

            return o;

        });

        const datos = {
            app: "Finanzas IA",
            exportado: new Date().toLocaleString("es-PE"),
            persona: estado.usuario ? { nombre: estado.usuario.saludo || estado.usuario.nombre, usuario: estado.usuario.usuario } : null,
            movimientos: limpio(estado.movimientos),
            gastosFijos: limpio(estado.fijos),
            tarjetas: limpio(estado.tarjetas),
            metas: limpio(estado.metas),
            presupuestos: limpio(estado.presupuestos),
            deudas: limpio(estado.deudas),
            porCobrar: limpio(estado.porCobrar)
        };

        const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });

        const a = document.createElement("a");

        a.href = URL.createObjectURL(blob);

        a.download = `finanzas-ia-mis-datos-${new Date().toISOString().slice(0, 10)}.json`;

        document.body.appendChild(a);

        a.click();

        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);

        mostrarToast(`⬇️ Descargué ${estado.movimientos.length} movimientos y el resto de tus datos`);

    }

    async function pedirBorrado(b) {

        if (!b.dataset.confirmar) {

            b.dataset.confirmar = "1";

            b.textContent = "¿Seguro? Toca otra vez";

            setTimeout(() => { if (b.isConnected) { b.dataset.confirmar = ""; b.textContent = "Pedir que borren mi cuenta"; } }, 4000);

            return;

        }

        b.disabled = true;

        try {

            await api("pedirBorrado", {});

            b.textContent = "Pedido enviado";

            mostrarToast("📨 Le avisé a Diego. Antes de borrarla, descarga tus datos si los quieres guardar.");

        } catch (err) {

            b.disabled = false;

            errorDeAccion(err);

        }

    }

    // =========================

    function render() {

        renderSuscripciones();

        renderAhorro();

        renderCategorias();

        const u = estado.usuario;

        if ($("datosBorrar")) $("datosBorrar").hidden = modoDemo || !u || u.rol === "admin" || !u.usuario;

    }

    function iniciar() {

        if (!$("dividirForm")) return;

        $("suscripciones").addEventListener("click", clicSuscripcion);

        $("dividirBtn").addEventListener("click", () => ($("dividirForm").hidden ? abrirDividir() : cerrarDividir()));

        $("dividirCancelar").addEventListener("click", cerrarDividir);

        $("dividirForm").addEventListener("input", calcularDividir);

        $("dividirForm").addEventListener("submit", guardarDividir);

        $("categoriasLista").addEventListener("click", clicCategoria);

        $("categoriasLista").addEventListener("submit", guardarCategoria);

        $("datosDescargar").addEventListener("click", descargarDatos);

        $("datosBorrar").addEventListener("click", (e) => pedirBorrado(e.currentTarget));

    }

    window.extras = { render };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

})();
