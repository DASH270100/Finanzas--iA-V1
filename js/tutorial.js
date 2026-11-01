// Finanzas IA · tutorial.js — recorrido guiado la primera vez que alguien entra.
// Ilumina cada parte de la app con una explicación corta. Se puede saltar en cualquier momento
// y volver a ver desde Configuración. Se recuerda por persona en este dispositivo.
"use strict";

const tutorial = (() => {

    const PASOS = [
        {
            titulo: "Bienvenido a Finanzas IA 👋",
            texto: "Te muestro cómo funciona en menos de un minuto. Si ya la conoces, puedes saltarlo.",
            inicio: true
        },
        {
            sel: [".card.registro"],
            vista: "dashboard",
            titulo: "Registra como hablas",
            texto: "Escribe «almorcé 18 y taxi 10» y la IA lo separa, le pone categoría y lo guarda. También puedes dictar con el micrófono o mandar la foto de una boleta."
        },
        {
            sel: ["#heroSaldo", ".card.tarjeta.saldo"],
            vista: "dashboard",
            titulo: "Tu saldo",
            texto: "Lo que entró menos lo que salió. Las compras con tarjeta de crédito se descuentan cuando pagas la tarjeta, no al comprar."
        },
        {
            sel: [".actividad-card .card-title", ".actividad-card"],
            vista: "dashboard",
            titulo: "Lo último que registraste",
            texto: "Cada movimiento se puede editar o borrar. Si la IA se equivoca, toca «Deshacer» justo después de registrar."
        },
        {
            sel: ['nav a[data-vista="estadisticas"]'],
            arriba: true,
            titulo: "Estadísticas",
            texto: "En qué se va tu plata cada mes, cuánto gastas por día y el resumen del mes en PDF."
        },
        {
            sel: ['nav a[data-vista="fijos"]'],
            arriba: true,
            titulo: "Planificar",
            texto: "Tus pagos fijos, tarjetas, ingresos y metas de ahorro. Te aviso antes de cada pago. Cuando te paguen, usa «Registrar nuevo mes»."
        },
        {
            sel: ['nav a[data-vista="asistente"]'],
            arriba: true,
            titulo: "Asistente IA",
            texto: "Pregúntale lo que quieras: «¿cuánto gasté en delivery?» o «¿me alcanza para unas zapatillas de 300?»."
        },
        {
            sel: ['nav a[data-vista="configuracion"]'],
            arriba: true,
            titulo: "Configuración",
            texto: "Tu nombre y contraseña, el estilo de la app, las notificaciones y el buzón para contarme ideas o fallas."
        },
        {
            titulo: "¡Listo! 🎉",
            texto: "Prueba registrar tu primer gasto ahora. Puedes volver a ver este recorrido cuando quieras en Configuración.",
            fin: true
        }
    ];

    let i = 0;

    let objetivo = null;

    let activo = false;

    let ofrecido = false;

    const clave = () => "finanzas_tutorial_" + (modoDemo ? "demo" : (estado.usuario && estado.usuario.usuario) || "anon");

    const visto = () => { try { return localStorage.getItem(clave()) === "1"; } catch (e) { return true; } };

    const marcarVisto = () => { try { localStorage.setItem(clave(), "1"); } catch (e) { } };

    const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };

    function buscar(paso) {

        for (const s of paso.sel || []) {

            const el = [...document.querySelectorAll(s)].find(visible);

            if (el) return el;

        }

        return null;

    }

    // Coloca el foco de luz y la tarjeta junto al elemento (o al centro si no hay)
    function ubicar() {

        if (!activo) return;

        const luz = $("tutoLuz");

        const caja = $("tutoCaja");

        const M = 8;

        if (!objetivo) {

            luz.classList.add("sin");

            caja.classList.add("centro");

            caja.style.left = caja.style.top = "";

            return;

        }

        const r = objetivo.getBoundingClientRect();

        luz.classList.remove("sin");

        caja.classList.remove("centro");

        luz.style.left = (r.left - M) + "px";

        luz.style.top = (r.top - M) + "px";

        luz.style.width = (r.width + M * 2) + "px";

        luz.style.height = (r.height + M * 2) + "px";

        const W = window.innerWidth, H = window.innerHeight;

        const cw = caja.offsetWidth, ch = caja.offsetHeight;

        const abajo = H - r.bottom, arriba = r.top;

        let top = abajo >= ch + 24 || abajo > arriba ? r.bottom + M + 12 : r.top - M - 12 - ch;

        top = Math.max(12, Math.min(top, H - ch - 12));

        let left = r.left + r.width / 2 - cw / 2;

        left = Math.max(16, Math.min(left, W - cw - 16));

        caja.style.left = left + "px";

        caja.style.top = top + "px";

    }

    function pintar() {

        const p = PASOS[i];

        if (p.vista && document.body.dataset.vista !== p.vista) mostrarVista(p.vista);

        // El menú está arriba en la compu (en el celular va fijo abajo): se vuelve al inicio de la página
        if (p.arriba) window.scrollTo({ top: 0, behavior: "instant" });

        objetivo = p.sel ? buscar(p) : null;

        $("tutoTitulo").textContent = p.titulo;

        $("tutoTexto").textContent = p.texto;

        const reales = PASOS.length - 2;

        $("tutoCuenta").textContent = p.inicio || p.fin ? "" : `${i} de ${reales}`;

        $("tutoPuntos").innerHTML = p.inicio || p.fin ? "" : PASOS.slice(1, -1).map((_, j) => `<i class="${j + 1 === i ? "on" : ""}"></i>`).join("");

        $("tutoAtras").hidden = !!(p.inicio || p.fin) || i === 1;

        $("tutoSaltar").hidden = !!p.fin;

        $("tutoSaltar").textContent = p.inicio ? "Ahora no" : "Saltar";

        $("tutoSig").textContent = p.inicio ? "Empezar" : p.fin ? "Empezar a usarla" : (i === PASOS.length - 2 ? "Terminar" : "Siguiente");

        const caja = $("tutoCaja");

        caja.classList.remove("entra");

        void caja.offsetWidth;

        caja.classList.add("entra");

        if (objetivo) {

            const r = objetivo.getBoundingClientRect();

            const fuera = r.top < 70 || r.bottom > window.innerHeight - 90;

            if (fuera) objetivo.scrollIntoView({ block: "center", behavior: "smooth" });

            setTimeout(ubicar, fuera ? 380 : 0);

        }

        ubicar();

        $("tutoSig").focus({ preventScroll: true });

    }

    function abrir() {

        if (activo) return;

        activo = true;

        i = 0;

        if (document.body.dataset.vista !== "dashboard") mostrarVista("dashboard");

        $("tutoOverlay").hidden = false;

        document.documentElement.classList.add("tuto-abierto");

        pintar();

    }

    function cerrar(final) {

        if (!activo) return;

        activo = false;

        marcarVisto();

        $("tutoOverlay").hidden = true;

        document.documentElement.classList.remove("tuto-abierto");

        if (document.body.dataset.vista !== "dashboard") mostrarVista("dashboard");

        if (final) {

            window.scrollTo({ top: 0, behavior: "smooth" });

            setTimeout(() => { const m = $("mensaje"); if (m) m.focus(); }, 350);

        }

    }

    function siguiente() {

        if (PASOS[i].fin) return cerrar(true);

        i = Math.min(i + 1, PASOS.length - 1);

        pintar();

    }

    function atras() { if (i > 1) { i--; pintar(); } }

    // Se llama después de cada renderTodo: la primera vez que la persona entra, aparece solo
    function quizas() {

        if (ofrecido || activo) return;

        if (!estado.usuario && !modoDemo) return;

        const ocupado = ["pinOverlay", "claveOverlay"].some((id) => $(id) && !$(id).hidden);

        if (ocupado) return;

        if (visto()) { ofrecido = true; return; }

        ofrecido = true;

        setTimeout(() => {
            const sigueOcupado = ["pinOverlay", "claveOverlay"].some((id) => $(id) && !$(id).hidden);
            if (sigueOcupado) { ofrecido = false; return; }
            abrir();
        }, 900);

    }

    // Al cambiar de cuenta (salir / entrar con otra) se vuelve a preguntar
    function reiniciar() { ofrecido = false; }

    function iniciar() {

        if (!$("tutoOverlay")) return;

        $("tutoSig").addEventListener("click", siguiente);

        $("tutoAtras").addEventListener("click", atras);

        $("tutoSaltar").addEventListener("click", () => cerrar(false));

        $("tutoVer") && $("tutoVer").addEventListener("click", abrir);

        document.addEventListener("keydown", (e) => {
            if (!activo) return;
            if (e.key === "Escape") cerrar(false);
            else if (e.key === "ArrowRight") siguiente();
            else if (e.key === "ArrowLeft") atras();
        });

        window.addEventListener("resize", ubicar);

        window.addEventListener("scroll", ubicar, { passive: true });

    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

    return { abrir, quizas, reiniciar };

})();
