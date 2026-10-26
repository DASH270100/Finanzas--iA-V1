// =========================
// BILLETE: al registrar, la pantalla muestra el billete o la moneda más cercana al monto
// (diseño propio de la app: el color de cada denominación, el ícono de la categoría al centro)
// =========================

const billete = (() => {

    // Denominaciones en soles. Las de menos de 10 son monedas.
    const DENOM = [
        { v: 0.1, tipo: "moneda", clase: "dorada" },
        { v: 0.2, tipo: "moneda", clase: "dorada" },
        { v: 0.5, tipo: "moneda", clase: "dorada" },
        { v: 1, tipo: "moneda", clase: "plateada" },
        { v: 2, tipo: "moneda", clase: "bimetal" },
        { v: 5, tipo: "moneda", clase: "bimetal" },
        { v: 10, tipo: "billete", color: "#1f8a5b", color2: "#7fd1a6" },
        { v: 20, tipo: "billete", color: "#b8612a", color2: "#f3b07a" },
        { v: 50, tipo: "billete", color: "#c2413b", color2: "#f59a8e" },
        { v: 100, tipo: "billete", color: "#2b62b0", color2: "#8fb6ee" },
        { v: 200, tipo: "billete", color: "#a23d7a", color2: "#eba1cd" }
    ];

    // La más cercana al monto (como en el vuelto: 18 → 20, 13 → 10, 3.50 → 5)
    function cercana(monto) {

        const m = Math.abs(Number(monto) || 0);

        return DENOM.reduce((mejor, d) => Math.abs(d.v - m) <= Math.abs(mejor.v - m) ? d : mejor, DENOM[0]);

    }

    const txtDenom = (v) => v < 1 ? String(Math.round(v * 100)) : String(v);

    function pieza(d, cat, ingreso) {

        const c = icoCategoria(cat, ingreso);

        if (d.tipo === "moneda") {

            return `<div class="bt-moneda ${d.clase}">
                <span class="bt-m-ico">${ico(c.nombre)}</span>
                <span class="bt-m-valor">${d.v < 1 ? txtDenom(d.v) + "<small>cént.</small>" : "S/ " + d.v}</span>
            </div>`;

        }

        return `<div class="bt-billete" style="--b1:${d.color};--b2:${d.color2}">
            <span class="bt-num bt-num-a">${d.v}</span>
            <span class="bt-num bt-num-b">${d.v}</span>
            <span class="bt-hilo"></span>
            <span class="bt-sello">${ico(c.nombre)}</span>
            <span class="bt-texto">S/ ${d.v} · FINANZAS IA</span>
        </div>`;

    }

    let reloj = null;

    function cerrar() {

        clearTimeout(reloj);

        const o = $("billeteOverlay");

        if (!o || o.hidden) return;

        o.classList.add("saliendo");

        setTimeout(() => { o.hidden = true; o.classList.remove("saliendo", "es-ingreso", "es-gasto"); }, 260);

    }

    // nuevos: movimientos recién registrados
    function mostrar(nuevos) {

        if (!nuevos || !nuevos.length) return;

        const o = $("billeteOverlay");

        if (!o) return;

        // El protagonista es el movimiento más grande; si hay más, se cuenta abajo
        const prin = nuevos.reduce((a, b) => Number(b.monto) > Number(a.monto) ? b : a);

        const ingreso = esIngreso(prin);

        const d = cercana(prin.monto);

        // Montos grandes: billetes apilados detrás (máx. 4)
        const pila = d.v === 200 ? Math.min(4, Math.max(1, Math.round(Math.abs(prin.monto) / 200))) : 1;

        $("billeteEscena").innerHTML =
            Array.from({ length: pila }, (_, i) =>
                `<div class="bt-capa" style="--i:${pila - 1 - i}">${pieza(d, prin.categoria, ingreso)}</div>`).join("");

        $("billeteVerbo").textContent = ingreso ? "Entró a tu cuenta" : (prin.medio && /tarjeta|visa|bbva|bcp|interbank|scotia|credito/i.test(prin.medio) ? "Pagaste con tarjeta" : "Salió de tu cuenta");

        $("billeteMonto").textContent = (ingreso ? "+ " : "- ") + money(prin.monto);

        const detalle = [prin.descripcion || prin.categoria, prin.categoria, prin.medio].filter(Boolean);

        $("billeteDetalle").textContent = [...new Set(detalle)].join(" · ");

        $("billeteMas").textContent = nuevos.length > 1 ? `y ${nuevos.length - 1} movimiento${nuevos.length > 2 ? "s" : ""} más` : "";

        o.classList.remove("es-ingreso", "es-gasto", "saliendo");

        o.classList.add(ingreso ? "es-ingreso" : "es-gasto");

        o.style.setProperty("--bt-tinte", d.color || (d.clase === "dorada" ? "#c9a227" : "#9aa4b2"));

        o.hidden = false;

        // Reinicia la animación aunque se registre dos veces seguidas
        void o.offsetWidth;

        try { navigator.vibrate && navigator.vibrate(ingreso ? [12, 60, 12] : 15); } catch (e) { }

        clearTimeout(reloj);

        reloj = setTimeout(cerrar, 1900);


    }

    function iniciar() {

        const o = $("billeteOverlay");

        if (!o) return;

        o.addEventListener("click", cerrar);

        document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });

    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

    return { mostrar, cerrar, cercana };

})();
