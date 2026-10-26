// Finanzas IA · splash: quita la pantalla de bienvenida cuando el documento está listo.
(function () {
    var t0 = Date.now();
    function quitar() {
        var s = document.getElementById("splash");
        if (!s) return;
        setTimeout(function () { s.classList.add("fuera"); setTimeout(function () { s.remove(); }, 450); }, Math.max(0, 500 - (Date.now() - t0)));
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", quitar); else quitar();
})();
