/* =========================================================
   FLUIDEZ: animaciones suaves sin tocar la lógica de la app.
   Solo observa la pantalla y anima cuando algo cambia.
   ========================================================= */
(function () {

    const reducir = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducir) return;

    // ---------- 1. Números que suben contando ----------
    const IDS_NUMEROS = ["hsSaldo", "hsIngresos", "hsGastos", "hsDeuda", "saldo", "ingresos", "gastos", "totalGastado"];
    const escribiendo = new WeakSet();
    const ultimo = new WeakMap();

    function leer(txt) {
        const m = String(txt).match(/[\d,]+(?:\.\d+)?/);
        if (!m) return null;
        const n = parseFloat(m[0].replace(/,/g, ""));
        return isNaN(n) ? null : { n, partes: [txt.slice(0, m.index), txt.slice(m.index + m[0].length)] };
    }
    const formato = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function contar(el) {
        if (escribiendo.has(el)) return;
        const datos = leer(el.textContent);
        if (!datos) return;
        const desde = ultimo.has(el) ? ultimo.get(el) : 0;
        const hasta = datos.n;
        ultimo.set(el, hasta);
        if (desde === hasta) return;
        const inicio = performance.now(), dur = 750;
        escribiendo.add(el);
        function paso(t) {
            const p = Math.min(1, (t - inicio) / dur);
            const e = 1 - Math.pow(1 - p, 3);
            el.textContent = datos.partes[0] + formato(desde + (hasta - desde) * e) + datos.partes[1];
            if (p < 1) requestAnimationFrame(paso);
            else { el.textContent = datos.partes[0] + formato(hasta) + datos.partes[1]; requestAnimationFrame(() => escribiendo.delete(el)); }
        }
        requestAnimationFrame(paso);
    }

    const obsNumeros = new MutationObserver((cambios) => {
        const vistos = new Set();
        cambios.forEach((c) => {
            const el = c.target.nodeType === 3 ? c.target.parentElement : c.target;
            if (el && !vistos.has(el)) { vistos.add(el); contar(el); }
        });
    });

    // ---------- 2. Vistas que entran suave + tarjetas en cascada ----------
    function cascada(contenedor) {
        const tarjetas = contenedor.querySelectorAll(":scope > .card, :scope > section, :scope > .cat-tiles, :scope > .grid-principal > .card");
        let i = 0;
        tarjetas.forEach((t) => {
            if (t.hidden || t.offsetParent === null) return;
            t.classList.remove("cascada");
            void t.offsetWidth;
            t.style.setProperty("--retraso", Math.min(i * 55, 400) + "ms");
            t.classList.add("cascada");
            i++;
        });
    }

    const obsVistas = new MutationObserver((cambios) => {
        cambios.forEach((c) => {
            const v = c.target;
            if (c.attributeName === "hidden" && !v.hidden) cascada(v);
        });
    });

    // ---------- 3. Movimiento recién registrado ----------
    let primeroAntes = "";
    let cantidadAntes = 0;
    const obsActividad = new MutationObserver(() => {
        const lista = document.getElementById("actividad");
        if (!lista) return;
        const items = lista.querySelectorAll(".movimiento");
        const primero = items[0] ? items[0].textContent : "";
        if (items.length > cantidadAntes && cantidadAntes > 0 && primero !== primeroAntes && items[0]) {
            items[0].classList.add("mov-nuevo");
        }
        primeroAntes = primero;
        cantidadAntes = items.length;
    });

    // ---------- Arranque ----------
    function iniciar() {
        IDS_NUMEROS.forEach((id) => {
            const el = document.getElementById(id);
            if (el) obsNumeros.observe(el, { childList: true, characterData: true, subtree: true });
        });
        document.querySelectorAll(".vista").forEach((v) => obsVistas.observe(v, { attributes: true, attributeFilter: ["hidden"] }));
        const act = document.getElementById("actividad");
        if (act) obsActividad.observe(act, { childList: true });
        const dash = document.getElementById("vista-dashboard");
        if (dash && !dash.hidden) cascada(dash);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

})();

/* =========================================================
   CINTA DEL ESTILO NEÓN: resume ingresos, gastos y top
   categorías en una franja que corre (solo se ve en Neón)
   ========================================================= */
(function () {

    function txt(id) { const el = document.getElementById(id); return el ? el.textContent.trim() : ""; }
    const limpiar = (t) => t.replace(/\s+/g, " ").replace("S/ ", "S/").toUpperCase();

    function armar(cinta) {
        const partes = [];
        const ing = txt("hsIngresos"), gas = txt("hsGastos");
        if (ing) partes.push("ENTRÓ " + limpiar(ing));
        if (gas) partes.push("SALIÓ " + limpiar(gas));
        document.querySelectorAll("#catTiles .cat-tile").forEach((t, i) => {
            if (i > 3) return;
            const n = t.querySelector("small"), m = t.querySelector("strong");
            if (n && m) partes.push(limpiar(n.textContent) + " " + limpiar(m.textContent));
        });
        if (!partes.length) partes.push("FINANZAS IA");
        const tramo = partes.map((p) => "<span>" + p.replace(/</g, "&lt;") + "</span><i>●</i>").join("");
        const html = '<div class="pista">' + tramo + tramo + tramo + tramo + "</div>";
        if (cinta.innerHTML !== html) cinta.innerHTML = html;
    }

    function iniciar() {
        const tiles = document.getElementById("catTiles");
        if (!tiles || !tiles.parentNode) return;
        const cinta = document.createElement("div");
        cinta.className = "cinta-neon";
        cinta.setAttribute("aria-hidden", "true");
        tiles.parentNode.insertBefore(cinta, tiles);
        let pendiente;
        const actualizar = () => { clearTimeout(pendiente); pendiente = setTimeout(() => armar(cinta), 900); };
        ["hsIngresos", "hsGastos"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) new MutationObserver(actualizar).observe(el, { childList: true, characterData: true, subtree: true });
        });
        new MutationObserver(actualizar).observe(tiles, { childList: true });
        armar(cinta);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

})();
