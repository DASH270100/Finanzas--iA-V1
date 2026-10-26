// Finanzas IA · arranque: se carga en <head> antes de pintar (estilo guardado y esqueletos de carga).
// Mientras llegan los datos se muestran "esqueletos" con brillo
document.documentElement.classList.add("cargando");
try {
    var t = localStorage.getItem("finanzas_tema");
    if (t === "iridiscente" || t === "atardecer" || t === "vidrio") document.documentElement.setAttribute("data-tema", t);
    else if (t && /^[a-z]+$/.test(t) && t !== "noche") {
        // Estilo especial: se usa la copia guardada en este dispositivo
        var css = localStorage.getItem("finanzas_css_" + t);
        if (css) {
            document.documentElement.setAttribute("data-tema", t);
            var st = document.createElement("style");
            st.id = "estiloEspecial";
            st.textContent = css;
            document.head.appendChild(st);
        }
    }
} catch (e) {}

