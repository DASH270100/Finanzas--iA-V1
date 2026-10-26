// Finanzas IA · eventos.js — Audio y foto, presupuestos, editar y borrar, pagar deudas, eventos y modo demo
// Se cargan en orden: nucleo → cuenta → inicio → secciones → registro → eventos (comparten el mismo ámbito global).
"use strict";

// =========================
// REGISTRAR CON AUDIO O FOTO
// =========================

const medios = (() => {

    const SEG_MAX = 60;

    let grabadora = null, flujo = null, trozos = [], reloj = null, inicio = 0, cancelado = false;

    const btnAudio = () => $("btnAudio");

    const btnFoto = () => $("btnFoto");

    function ocupado(si) {

        [btnAudio(), btnFoto()].forEach((b) => { if (b && !(si === false && b.classList.contains("grabando"))) b.disabled = si; });

    }

    function enDemo() {

        if (!modoDemo) return false;

        mostrarToast("🎙️📷 En la demo no se puede usar audio ni foto");

        return true;

    }

    function tipoAudio() {

        if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";

        return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) || "";

    }

    function aBase64(blob) {

        return new Promise((ok, mal) => {

            const lector = new FileReader();

            lector.onload = () => ok(String(lector.result).split(",")[1] || "");

            lector.onerror = () => mal(new Error("No se pudo leer el archivo"));

            lector.readAsDataURL(blob);

        });

    }

    function apagar() {

        clearInterval(reloj);

        if (flujo) flujo.getTracks().forEach((t) => t.stop());

        flujo = null;

        const b = btnAudio();

        if (b) { b.classList.remove("grabando"); b.setAttribute("aria-pressed", "false"); b.setAttribute("aria-label", "Registrar con audio"); }

        $("mensaje").placeholder = $("mensaje").dataset.placeholder || $("mensaje").placeholder;

    }

    async function alternarAudio() {

        if (enDemo()) return;

        if (grabadora && grabadora.state === "recording") { grabadora.stop(); return; }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {

            mostrarToast("🎙️ Tu navegador no permite grabar audio aquí");

            return;

        }

        try {

            flujo = await navigator.mediaDevices.getUserMedia({ audio: true });

        } catch (e) {

            console.error(e);

            $("respuesta").textContent = "🎙️ Necesito permiso para usar el micrófono. Actívalo en los ajustes del navegador para esta página.";

            mostrarToast("🎙️ Sin permiso para el micrófono");

            return;

        }

        const tipo = tipoAudio();

        grabadora = tipo ? new MediaRecorder(flujo, { mimeType: tipo }) : new MediaRecorder(flujo);

        trozos = [];

        cancelado = false;

        grabadora.ondataavailable = (e) => { if (e.data && e.data.size) trozos.push(e.data); };

        grabadora.onstop = enviarAudio;

        grabadora.start();

        inicio = Date.now();

        const b = btnAudio();

        b.classList.add("grabando");

        b.setAttribute("aria-pressed", "true");

        b.setAttribute("aria-label", "Terminar de grabar");

        btnFoto().disabled = true;

        const caja = $("mensaje");

        if (!caja.dataset.placeholder) caja.dataset.placeholder = caja.placeholder;

        caja.placeholder = "Te escucho… toca el micrófono para terminar";

        const tic = () => {

            const s = Math.floor((Date.now() - inicio) / 1000);

            $("respuesta").textContent = `🔴 Grabando 0:${String(s).padStart(2, "0")} · di algo como «almuerzo 18 y taxi 12». Toca 🎙️ para terminar.`;

            if (s >= SEG_MAX && grabadora.state === "recording") grabadora.stop();

        };

        tic();

        reloj = setInterval(tic, 500);

    }

    async function enviarAudio() {

        const duro = Date.now() - inicio;

        const tipo = (grabadora && grabadora.mimeType) || tipoAudio() || "audio/webm";

        apagar();

        btnFoto().disabled = false;

        if (cancelado) return;

        const blob = new Blob(trozos, { type: tipo });

        if (duro < 700 || blob.size < 1500) {

            $("respuesta").textContent = "🎙️ Muy corto. Mantén el micrófono un par de segundos y habla claro.";

            return;

        }

        ocupado(true);

        pasos.mostrar(["audio", "voz", "ia", "guardar", "actualizar"]);

        pasos.ir("audio");

        let texto = "";

        try {

            const audio = await aBase64(blob);

            pasos.ir("voz");

            const r = await api("transcribir", { audio, tipo });

            texto = String(r.texto || "").trim();

        } catch (e) {

            ocupado(false);

            if (e instanceof ErrorPin) { manejarError(e); return; }

            console.error(e);

            $("respuesta").textContent = "⚠️ " + (e && e.message && !/fetch|network|red \(/i.test(e.message) ? e.message : "No se pudo escuchar el audio. Inténtalo otra vez.");

            return;

        }

        ocupado(false);

        if (!texto) {

            $("respuesta").textContent = "🎙️ No entendí nada en el audio. Prueba otra vez, más cerca del celular.";

            return;

        }

        // Se registra como si lo hubieras escrito (pasa por las mismas reglas rápidas)
        $("mensaje").value = texto.slice(0, MAX_CARACTERES);

        mostrarToast("🎙️ «" + texto.slice(0, 60) + (texto.length > 60 ? "…" : "") + "»");

        registrarMovimiento();

    }

    // Achica la foto (≈1280 px, JPEG) para que viaje rápido y la IA la lea bien
    function achicar(archivo) {

        return new Promise((ok, mal) => {

            const url = URL.createObjectURL(archivo);

            const img = new Image();

            img.onload = () => {

                URL.revokeObjectURL(url);

                const lado = 1280, k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));

                const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));

                const lienzo = document.createElement("canvas");

                lienzo.width = w;

                lienzo.height = h;

                const ctx = lienzo.getContext("2d");

                ctx.fillStyle = "#fff";

                ctx.fillRect(0, 0, w, h);

                ctx.drawImage(img, 0, 0, w, h);

                ok(lienzo.toDataURL("image/jpeg", 0.75).split(",")[1] || "");

            };

            img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("Ese archivo no parece una foto")); };

            img.src = url;

        });

    }

    function elegirFoto() {

        if (enDemo()) return;

        const entrada = $("fotoEntrada");

        entrada.value = "";

        entrada.click();

    }

    async function fotoElegida() {

        const archivo = $("fotoEntrada").files && $("fotoEntrada").files[0];

        if (!archivo) return;

        let imagen = "";

        try {

            pasos.mostrar(["foto", "fotoIA", "guardar", "actualizar"]);

            pasos.ir("foto");

            imagen = await achicar(archivo);

        } catch (e) {

            $("respuesta").textContent = "⚠️ " + e.message;

            return;

        }

        if (!imagen) { $("respuesta").textContent = "⚠️ No se pudo leer la foto"; return; }

        // Lo escrito en la barra viaja como pista («fue con la BCP», «dividido entre 2»...)
        const pista = $("mensaje").value.trim().slice(0, MAX_CARACTERES);

        await registrarConIA({ mensaje: pista, imagen });

    }

    function iniciar() {

        if (!btnAudio() || !btnFoto()) return;

        btnAudio().addEventListener("click", alternarAudio);

        btnFoto().addEventListener("click", elegirFoto);

        $("fotoEntrada").addEventListener("change", fotoElegida);

        // Si no hay forma de grabar, el micrófono ni se muestra
        if (!navigator.mediaDevices || !window.MediaRecorder) btnAudio().hidden = true;

        // Al bloquear o cambiar de pestaña a media grabación, se descarta
        document.addEventListener("visibilitychange", () => {

            if (document.hidden && grabadora && grabadora.state === "recording") { cancelado = true; grabadora.stop(); }

        });

    }

    return { iniciar, ocupado };

})();

// =========================
// PRESUPUESTO POR CATEGORÍA
// =========================

function renderPresupuestos() {

    // Si el gráfico está en "Todo el historial", el presupuesto usa el mes actual
    const periodo = (!estado.mes || estado.mes === "all")
        ? claveMes(new Date())
        : estado.mes;

    const gastadoPor = new Map();

    gastosDelPeriodo(periodo).forEach((m) => {

        const c = nombreCategoria(m.categoria);

        gastadoPor.set(c, (gastadoPor.get(c) || 0) + m.monto);

    });

    // Sugerencias para el formulario: categorías que ya usas y las que ya tienen límite
    const categorias = new Set(estado.movimientos.map((m) => nombreCategoria(m.categoria)));

    estado.presupuestos.forEach((p) => categorias.add(p.categoria));

    $("categoriasPresupuesto").innerHTML = [...categorias]
        .sort()
        .map((c) => `<option value="${esc(c)}"></option>`)
        .join("");

    const items = estado.presupuestos
        .map((p) => ({ ...p, gastado: gastadoPor.get(p.categoria) || 0 }))
        .sort((a, b) => (b.gastado / b.limite) - (a.gastado / a.limite));

    if (!items.length) {

        $("subtituloPresupuesto").textContent =
            "Fija un límite mensual por categoría y sigue cuánto te queda.";

        $("presupuestos").innerHTML =
            vacioGuia("💰", "Aún no tienes presupuestos",
                "Elige una categoría abajo y fija un límite mensual. Te muestro cuánto te queda.");

        return;

    }

    const totalLimite = items.reduce((t, p) => t + p.limite, 0);

    const totalGastado = items.reduce((t, p) => t + p.gastado, 0);

    $("subtituloPresupuesto").textContent =
        `${nombreMes(periodo)} · ${money(totalGastado)} gastados de ${money(totalLimite)}`;

    $("presupuestos").innerHTML = items.map((p) => {

        const pct = p.gastado / p.limite;

        const nivel = pct > 1 ? "exceso" : pct >= 0.8 ? "alerta" : "ok";

        const resto = p.limite - p.gastado;

        const mensaje = resto >= 0
            ? `Te quedan ${money(resto)}`
            : `Te pasaste por ${money(-resto)}`;

        const ancho = Math.min(100, Math.round(pct * 100));

        const icono = burbujaCategoria(p.categoria, false, "chica");

        return `
            <div class="presupuesto-item" data-categoria="${esc(p.categoria)}" data-limite="${p.limite}">

                <div class="presupuesto-top">

                    <span class="presupuesto-nombre">${icono} ${esc(p.categoria)}</span>

                    <span class="presupuesto-monto">${money(p.gastado)} de ${money(p.limite)}</span>

                </div>

                <div class="presupuesto-barra" role="progressbar"
                    aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ancho}"
                    aria-label="Gastado en ${esc(p.categoria)}">

                    <div class="presupuesto-progreso nivel-${nivel}" style="width:${ancho}%"></div>

                </div>

                <div class="presupuesto-pie">

                    <span class="presupuesto-mensaje nivel-${nivel}">${mensaje} · ${Math.round(pct * 100)}%</span>

                    <span class="presupuesto-acciones">

                        <button class="mov-btn" type="button" data-pres="editar">Cambiar</button>

                        <button class="mov-btn mov-btn-borrar" type="button" data-pres="quitar">Quitar</button>

                    </span>

                </div>

            </div>
        `;

    }).join("");

}

async function guardarPresupuesto(categoria, limite) {

    await api("presupuesto", { categoria, limite });

    await cargarDatos();

    renderTodo();

}

// =========================
// EDITAR Y BORRAR MOVIMIENTOS
// =========================

const origenDe = (m) => ({
    tipo: m.tipo,
    categoria: m.categoria,
    descripcion: m.descripcion,
    monto: m.monto
});

function buscarMovimiento(fila) {

    const m = estado.movimientos.find((x) => x.fila === fila);

    if (!m) throw new Error("No se encontró el movimiento. Recarga la página.");

    return m;

}

async function guardarMovimiento(fila, valores) {

    const m = buscarMovimiento(fila);

    await api("editar", { fila, orig: origenDe(m), nuevo: valores });

    estado.editando = null;

    await cargarDatos();

    renderTodo();

    animar(".tarjeta");

}

async function eliminarMovimiento(fila) {

    const m = buscarMovimiento(fila);

    const data = await api("borrar", { fila, orig: origenDe(m) });

    estado.editando = null;

    await cargarDatos();

    renderTodo();

    animar(".tarjeta");

    return data.deuda || "";

}

function errorDeAccion(e) {

    if (e instanceof ErrorPin) {

        manejarError(e);

        return;

    }

    console.error(e);

    mostrarToast("❌ " + (e.message || "No se pudo completar la acción"));

    actualizarTodo();

}

async function accionActividad(boton) {

    const accion = boton.dataset.accion;

    const tarjeta = boton.closest("[data-fila]");

    if (!tarjeta) return;

    const fila = Number(tarjeta.dataset.fila);

    if (accion === "editar") {

        estado.editando = fila;

        renderActividad();

        const primero = $("actividad").querySelector('[data-campo="descripcion"]');

        if (primero) primero.focus();

        return;

    }

    if (accion === "cancelar") {

        estado.editando = null;

        renderActividad();

        return;

    }

    if (boton.disabled) return;

    if (accion === "guardar") {

        const campo = (n) => tarjeta.querySelector(`[data-campo="${n}"]`).value;

        const valores = {
            tipo: campo("tipo"),
            categoria: campo("categoria").trim() || "Otros",
            descripcion: campo("descripcion").trim(),
            monto: Number(campo("monto"))
        };

        if (!valores.descripcion) {

            mostrarToast("✍️ Escribe una descripción");

            return;

        }

        if (!(valores.monto > 0)) {

            mostrarToast("💲 El monto debe ser mayor que 0");

            return;

        }

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarMovimiento(fila, valores);

            mostrarToast("✅ Movimiento actualizado");

        } catch (e) {

            errorDeAccion(e);

        }

        return;

    }

    if (accion === "borrar") {

        // Primer toque: pide confirmar. Si no confirma en 4 segundos, vuelve a la normalidad.
        if (!boton.dataset.confirmando) {

            boton.dataset.confirmando = "1";

            const mov = estado.movimientos.find((x) => x.fila === fila);

            boton.textContent = mov && esPrestamo(mov) ? "¿Seguro? Quita también la deuda"
                : mov && esReembolso(mov) ? "¿Seguro? La deuda vuelve a pendiente"
                : "¿Seguro? Toca otra vez";

            setTimeout(() => {

                if (boton.isConnected && boton.dataset.confirmando) {

                    delete boton.dataset.confirmando;

                    boton.textContent = "🗑️ Borrar";

                }

            }, 4000);

            return;

        }

        boton.disabled = true;

        boton.textContent = "⏳ Borrando...";

        try {

            const deuda = await eliminarMovimiento(fila);

            mostrarToast(
                deuda === "eliminada" ? "🗑️ Movimiento y deuda borrados"
                : deuda === "reabierta" ? "🗑️ Reembolso borrado · la deuda volvió a pendiente"
                : "🗑️ Movimiento borrado"
            );

        } catch (e) {

            errorDeAccion(e);

        }

    }

}

// =========================
// PAGAR UNA DEUDA
// =========================

async function pagarDeuda(boton) {

    if (boton.disabled) return;

    const persona = boton.dataset.persona;

    const monto = numero(boton.dataset.monto);

    // Primer toque: pide confirmar. Si no confirma en 4 segundos, vuelve a la normalidad.
    if (!boton.dataset.confirmando) {

        boton.dataset.confirmando = "1";

        boton.textContent = "¿Seguro? Toca otra vez";

        setTimeout(() => {

            if (boton.isConnected && boton.dataset.confirmando) {

                delete boton.dataset.confirmando;

                boton.textContent = "✓ Pagado";

            }

        }, 4000);

        return;

    }

    boton.disabled = true;

    boton.textContent = "⏳ Registrando...";

    try {

        await api("pagar", {
            fila: Number(boton.dataset.fila),
            persona,
            monto
        });

        // El Apps Script ya escribió el reembolso: traemos los datos actualizados
        await cargarDatos();

        renderTodo();

        animar(".tarjeta");

        mostrarToast(`✅ ${persona} pagó ${money(monto)} · reembolso registrado`);

    } catch (e) {

        if (e instanceof ErrorPin) {

            manejarError(e);

            return;

        }

        console.error(e);

        mostrarToast("❌ " + (e.message || "No se pudo marcar como pagado"));

        // Si la deuda ya no estaba pendiente, refrescamos para que desaparezca
        actualizarTodo();

    }

}

// =========================
// EVENTOS
// =========================

// =========================
// MODO DEMO
// =========================

async function entrarDemo() {

    if (modoDemo) return;

    DemoBackend.reset();

    modoDemo = true;

    estado.mes = null;

    estado.editando = null;

    estado.chat = [];

    estado.mostrarTodasLasDeudas = false;

    $("bannerDemo").hidden = false;

    estado.usuario = null;

    try {

        await cargarDatos();

    } catch (e) {

        console.error(e);

    }

    renderTodo();

    mostrarVista("dashboard");

    mostrarToast("🎬 Estás en el modo demo");

}

async function salirDemo() {

    if (!modoDemo) return;

    modoDemo = false;

    $("bannerDemo").hidden = true;

    estado.mes = null;

    estado.editando = null;

    estado.chat = [];

    // Vuelven tus datos reales (primero lo último guardado, luego se actualiza)
    const cache = leerCache();

    try { aplicarDatos(cache || {}); } catch (e) { console.error(e); }

    renderTodo();

    mostrarVista("dashboard");

    mostrarToast("Saliste del modo demo");

    actualizarTodo();

}

// Formularios plegados: se ven solo al tocar "+ Agregar"
const PLEGABLES = {
    presForm: "Nuevo presupuesto",
    tarjForm: "Agregar tarjeta",
    cuotaForm: "Agregar préstamo",
    fijoForm: "Agregar gasto fijo",
    ingFijoForm: "Agregar ingreso fijo",
    cobrarForm: "Agregar trabajo por cobrar",
    metaForm: "Nueva meta"
};

function ponerPlegable(id, abierto) {

    const form = $(id);

    if (!form) return;

    const nota = form.nextElementSibling && form.nextElementSibling.classList.contains("presupuesto-nota")
        ? form.nextElementSibling : null;

    form.hidden = !abierto;

    if (nota) nota.hidden = !abierto;

    const b = form.previousElementSibling;

    if (b && b.classList.contains("btn-agregar")) {

        b.setAttribute("aria-expanded", abierto ? "true" : "false");

        b.textContent = abierto ? "✕ Cerrar" : "＋ " + PLEGABLES[id];

    }

}

const abrirForm = (id) => ponerPlegable(id, true);

const cerrarForm = (id) => ponerPlegable(id, false);

function iniciarPlegables() {

    Object.keys(PLEGABLES).forEach((id) => {

        const form = $(id);

        if (!form || form.dataset.plegable) return;

        form.dataset.plegable = "1";

        const b = document.createElement("button");

        b.type = "button";

        b.className = "btn-agregar";

        b.addEventListener("click", () => ponerPlegable(id, form.hidden));

        form.parentNode.insertBefore(b, form);

        ponerPlegable(id, false);

    });

}

// Botón "Deshacer" tras un registro rápido
function agregarDeshacer(temporal, esperarGuardado) {

    const caja = $("respuesta");

    const b = document.createElement("button");

    b.type = "button";

    b.className = "btn-deshacer";

    b.textContent = "↩ Deshacer";

    b.addEventListener("click", async () => {

        b.disabled = true;

        b.textContent = "⏳ Deshaciendo…";

        try {

            await esperarGuardado();

            // Espera a que la hoja real reemplace al movimiento provisional
            for (let i = 0; i < 40 && estado.movimientos.includes(temporal); i++) await dormir(300);

            const real = estado.movimientos
                .filter((x) => x !== temporal && x.tipo === temporal.tipo && x.monto === temporal.monto &&
                    x.descripcion === temporal.descripcion && x.categoria === temporal.categoria)
                .sort((a, c) => c.fila - a.fila)[0];

            if (real) await eliminarMovimiento(real.fila);

            caja.textContent = "↩ Deshecho: " + (temporal.descripcion || temporal.categoria) + " se quitó.";

            mostrarToast("↩ Movimiento deshecho");

        } catch (e) {

            b.disabled = false;

            b.textContent = "↩ Deshacer";

            errorDeAccion(e);

        }

    });

    const fila = document.createElement("div");

    fila.className = "deshacer-fila";

    fila.appendChild(b);

    caja.appendChild(fila);

}

// Deshacer lo que registró la IA (puede ser más de un movimiento)
function agregarDeshacerVarios(movs) {

    const caja = $("respuesta");

    const b = document.createElement("button");

    b.type = "button";

    b.className = "btn-deshacer";

    b.textContent = movs.length > 1 ? `↩ Deshacer los ${movs.length}` : "↩ Deshacer";

    b.addEventListener("click", async () => {

        b.disabled = true;

        b.textContent = "⏳ Deshaciendo…";

        try {

            // De abajo hacia arriba para que no se muevan las filas
            const orden = [...movs].sort((a, c) => c.fila - a.fila);

            for (const m of orden) {

                const real = estado.movimientos.find((x) => x.fila === m.fila && x.monto === m.monto && x.descripcion === m.descripcion)
                    || estado.movimientos.filter((x) => x.tipo === m.tipo && x.monto === m.monto && x.descripcion === m.descripcion && x.categoria === m.categoria)
                        .sort((a, c) => c.fila - a.fila)[0];

                if (real) await eliminarMovimiento(real.fila);

            }

            caja.textContent = movs.length > 1 ? `↩ Deshecho: se quitaron los ${movs.length} movimientos.` : "↩ Deshecho: el movimiento se quitó.";

            mostrarToast("↩ Deshecho");

        } catch (e) {

            b.disabled = false;

            b.textContent = "↩ Deshacer";

            errorDeAccion(e);

        }

    });

    const fila = document.createElement("div");

    fila.className = "deshacer-fila";

    fila.appendChild(b);

    caja.appendChild(fila);

}

window.addEventListener("DOMContentLoaded", () => {

    iniciarPlegables();

    aplicarTema(temaGuardado(), false);

    document.addEventListener("click", (e) => {

        const op = e.target.closest(".tema-opcion[data-tema]");

        if (op) aplicarTema(op.dataset.tema, true);

    });

    $("demoEntrar").addEventListener("click", entrarDemo);

    $("adminForm").addEventListener("submit", crearPersona);

    $("adminClave").addEventListener("input", actualizarAvisoCodigo);

    $("claveForm").addEventListener("submit", guardarCambioClave);

    $("claveCancelar").addEventListener("click", () => { $("claveOverlay").hidden = true; });

    $("cuentaClave").addEventListener("click", () => abrirCambioClave(false));

    // Cambiar el nombre del saludo
    $("cuentaNombreBtn").addEventListener("click", () => {

        $("nombreForm").hidden = false;

        $("cuentaNombreBtn").hidden = true;

        $("nombreNuevo").value = (estado.usuario && (estado.usuario.saludo || estado.usuario.nombre)) || "";

        $("nombreNuevo").focus();

        $("nombreNuevo").select();

    });

    const cerrarNombre = () => { $("nombreForm").hidden = true; $("cuentaNombreBtn").hidden = false; };

    $("nombreCancelar").addEventListener("click", cerrarNombre);

    $("nombreForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const nombre = $("nombreNuevo").value.trim();

        if (nombre.length < 2) { mostrarToast("✍️ Escribe tu nombre"); return; }

        const b = $("nombreGuardar");

        b.disabled = true;

        try {

            await api("miNombre", { nombre });

            cerrarNombre();

            await cargarDatos();

            renderTodo();

            mostrarToast(`👋 ¡Listo, ${nombre}!`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            b.disabled = false;

        }

    });

    $("adminNombre").addEventListener("input", actualizarAvisoCodigo);

    $("adminSugerir").addEventListener("click", () => {

        $("adminClave").value = sugerirCodigo();

        actualizarAvisoCodigo();

    });

    $("adminCopiar").addEventListener("click", async () => {

        const ok = await copiarTexto($("adminListoTexto").value);

        mostrarToast(ok ? "📋 Mensaje copiado" : "No se pudo copiar");

    });

    $("adminLista").addEventListener("click", (e) => {

        const b = e.target.closest("[data-persona-accion]");

        if (b) accionPersona(b);

    });

    $("adminLista").addEventListener("input", (e) => {

        const campo = e.target.closest("[data-campo=clave]");

        if (!campo) return;

        const tarjeta = campo.closest(".persona");

        const persona = estado.personas.find((p) => p.hoja === tarjeta.dataset.hoja);

        const avisos = avisosCodigo(campo.value, persona ? persona.nombre : "");

        const aviso = tarjeta.querySelector("[data-aviso-persona]");

        if (aviso) aviso.textContent = avisos.length
            ? "⚠️ Contraseña débil: " + avisos.join(", ") + ". Igual es temporal."
            : "Al guardarla se cierra su sesión y al entrar tendrá que crear su propia contraseña.";

    });

    $("demoSalir").addEventListener("click", salirDemo);


    $("registrar").addEventListener("click", registrarMovimiento);

    // Buscador de movimientos
    $("btnBuscar").addEventListener("click", () => {

        busqueda.abierto = !busqueda.abierto;

        $("buscador").hidden = !busqueda.abierto;

        $("btnBuscar").setAttribute("aria-expanded", String(busqueda.abierto));

        $("btnBuscar").innerHTML = busqueda.abierto
            ? `${ico("x")} Cerrar` : `${ico("search")} Buscar`;

        busqueda.limite = 40;

        renderActividad();

        if (busqueda.abierto) $("buscarTexto").focus();

    });

    let tBuscar = null;

    $("buscarTexto").addEventListener("input", () => {

        clearTimeout(tBuscar);

        tBuscar = setTimeout(() => { busqueda.texto = $("buscarTexto").value; busqueda.limite = 40; renderActividad(); }, 180);

    });

    $("buscador").addEventListener("click", (e) => {

        const b = e.target.closest("[data-btipo]");

        if (!b) return;

        busqueda.tipo = b.dataset.btipo;

        document.querySelectorAll("[data-btipo]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));

        busqueda.limite = 40;

        renderActividad();

    });

    $("buscarPeriodo").addEventListener("change", (e) => { busqueda.periodo = e.target.value; busqueda.limite = 40; renderActividad(); });

    $("actividad").addEventListener("click", (e) => {

        if (!e.target.closest("[data-buscar-mas]")) return;

        busqueda.limite += 40;

        renderActividad();

    });

    // Tocar el aviso lo cierra
    $("toast").addEventListener("click", () => { clearTimeout(toastTimer); $("toast").classList.remove("mostrar"); });

    medios.iniciar();

    buzon.iniciar();

    vitrina.iniciar();

    // Ejemplos tocables: llenan el cuadro de registro y llevan al usuario hasta él
    document.addEventListener("click", (e) => {

        const chip = e.target.closest("[data-ejemplo]");

        if (!chip) return;

        mostrarVista("dashboard");

        const caja = $("mensaje");

        caja.value = chip.dataset.ejemplo;

        window.scrollTo({ top: 0, behavior: "smooth" });

        caja.focus();

    });

    $("mensaje").addEventListener("keydown", (e) => {

        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {

            e.preventDefault();

            registrarMovimiento();

        }

    });

    $("filtroMes").addEventListener("change", (e) => cambiarMes(e.target.value));

    $("filtroMesStats").addEventListener("change", (e) => cambiarMes(e.target.value));

    // Gastos fijos: guardar, registrar, cambiar y quitar
    $("fijoForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const datos = {
            nombre: $("fijoNombre").value.trim(),
            categoria: nombreCategoria($("fijoCategoria").value) === "Sin categoría"
                ? "Otros"
                : nombreCategoria($("fijoCategoria").value),
            monto: Number($("fijoMonto").value),
            dia: Number($("fijoDia").value)
        };

        if (!datos.nombre || !(datos.monto > 0) || !Number.isInteger(datos.dia) || datos.dia < 1 || datos.dia > 31) {

            mostrarToast("💲 Revisa el nombre, el monto y el día (1 al 31)");

            return;

        }

        const boton = $("fijoBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarFijo(datos);

            $("fijoForm").reset(); cerrarForm("fijoForm");

            mostrarToast(`✅ Gasto fijo "${datos.nombre}" guardado`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar fijo";

        }

    });

    // Ingresos fijos: guardar
    $("ingFijoForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const fuente = nombreCategoria($("ingFijoCategoria").value);

        const datos = {
            tipo: "Ingreso",
            nombre: $("ingFijoNombre").value.trim(),
            categoria: fuente === "Sin categoría" ? "Sueldo" : fuente,
            monto: Number($("ingFijoMonto").value),
            dia: Number($("ingFijoDia").value)
        };

        if (!datos.nombre || !(datos.monto > 0) || !Number.isInteger(datos.dia) || datos.dia < 1 || datos.dia > 31) {

            mostrarToast("💼 Revisa el nombre, el monto y el día (1 al 31)");

            return;

        }

        const boton = $("ingFijoBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarFijo(datos);

            $("ingFijoForm").reset(); cerrarForm("ingFijoForm");

            mostrarToast(`✅ Ingreso fijo "${datos.nombre}" guardado`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar ingreso fijo";

        }

    });

    const clickFijo = async (e) => {

        const boton = e.target.closest("[data-fijo]");

        if (!boton || boton.disabled) return;

        const item = boton.closest("[data-nombre]");

        const nombre = item.dataset.nombre;

        const accion = boton.dataset.fijo;

        const tipo = item.dataset.tipo === "Ingreso" ? "Ingreso" : item.dataset.tipo === "Cuota" ? "Cuota" : "Gasto";

        if (accion === "editar" && tipo === "Cuota") {

            $("cuotaNombre").value = nombre;

            $("cuotaMonto").value = item.dataset.monto;

            $("cuotaTotal").value = item.dataset.cuotas;

            $("cuotaPagadas").value = item.dataset.pagadas;

            $("cuotaDia").value = item.dataset.dia;

            const tea = Number(item.dataset.tea) || 0;

            $("cuotaConInteres").checked = tea > 0;

            $("cuotaTea").value = tea > 0 ? tea : "";

            $("cuotaTeaCampo").hidden = !(tea > 0);

            abrirForm("cuotaForm");

            $("cuotaMonto").focus();

            return;

        }

        if (accion === "editar" && tipo === "Ingreso") {

            $("ingFijoNombre").value = nombre;

            $("ingFijoCategoria").value = item.dataset.categoria;

            $("ingFijoMonto").value = item.dataset.monto;

            $("ingFijoDia").value = item.dataset.dia;

            abrirForm("ingFijoForm");

            $("ingFijoMonto").focus();

            return;

        }

        if (accion === "editar") {

            $("fijoNombre").value = nombre;

            $("fijoCategoria").value = item.dataset.categoria;

            $("fijoMonto").value = item.dataset.monto;

            $("fijoDia").value = item.dataset.dia;

            abrirForm("fijoForm");

            $("fijoMonto").focus();

            return;

        }

        if (accion === "adelantar") {

            const f = item.querySelector("[data-adelanto]");

            if (f) {

                f.hidden = !f.hidden;

                if (!f.hidden) f.querySelector("input").focus();

            }

            return;

        }

        // Registrar y quitar piden un segundo toque para evitar errores
        if (!boton.dataset.confirmando) {

            const original = boton.textContent.trim();

            boton.dataset.confirmando = "1";

            boton.textContent = accion === "registrar"
                ? (tipo === "Cuota" ? `¿Pagar ${money(item.dataset.monto)}?` : `¿Registrar ${money(item.dataset.monto)}?`)
                : "¿Seguro?";

            setTimeout(() => {

                if (boton.isConnected && boton.dataset.confirmando) {

                    delete boton.dataset.confirmando;

                    boton.textContent = original;

                }

            }, 4000);

            return;

        }

        boton.disabled = true;

        boton.textContent = "⏳";

        try {

            if (accion === "registrar") {

                await api("pagarFijo", { nombre, tipo });

                await cargarDatos();

                renderTodo();

                animar(".tarjeta");

                if (tipo === "Cuota") {

                    const c = estado.fijos.find((x) => x.tipo === "Cuota" && claveTarjeta(x.nombre) === claveTarjeta(nombre));

                    mostrarToast(c && c.pagadas >= c.cuotas
                        ? `🎉 ¡Terminaste de pagar ${nombre}!`
                        : `✅ Cuota ${c ? c.pagadas : ""} de ${c ? c.cuotas : ""} pagada${c ? ` · te faltan ${c.cuotas - c.pagadas}` : ""}`);

                } else {

                    mostrarToast(tipo === "Ingreso" ? `✅ ${nombre} registrado como ingreso` : `✅ ${nombre} registrado como gasto`);

                }

            } else {

                await guardarFijo({ nombre, quitar: true, tipo });

                mostrarToast(`🗑️ "${nombre}" quitado de tus fijos`);

            }

        } catch (err) {

            errorDeAccion(err);

        }

    };

    $("fijos").addEventListener("click", clickFijo);

    $("ingresosFijos").addEventListener("click", clickFijo);

    $("cuotas").addEventListener("click", clickFijo);

    // Casilla «tiene intereses»: muestra el campo de la tasa
    $("cuotaConInteres").addEventListener("change", () => {

        $("cuotaTeaCampo").hidden = !$("cuotaConInteres").checked;

        if (!$("cuotaTeaCampo").hidden) $("cuotaTea").focus();

    });

    // Adelantar pago: vista previa mientras escribes y registro al enviar
    $("cuotas").addEventListener("input", (e) => {

        const f = e.target.closest("[data-adelanto]");

        if (!f) return;

        f.querySelector(".adelanto-vista").textContent = vistaAdelanto(f.closest("[data-nombre]"), Number(e.target.value));

    });

    $("cuotas").addEventListener("submit", async (e) => {

        const f = e.target.closest("[data-adelanto]");

        if (!f) return;

        e.preventDefault();

        const item = f.closest("[data-nombre]");

        const monto = Number(f.querySelector("input").value);

        if (!(monto > 0)) return;

        await adelantarPrestamo(item.dataset.nombre, monto);

    });

    // Préstamos en cuotas: guardar
    $("cuotaForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const datos = {
            tipo: "Cuota",
            nombre: $("cuotaNombre").value.trim(),
            monto: Number($("cuotaMonto").value),
            cuotas: Number($("cuotaTotal").value),
            pagadas: Number($("cuotaPagadas").value || 0),
            dia: Number($("cuotaDia").value),
            tea: $("cuotaConInteres").checked ? Number($("cuotaTea").value) : 0
        };

        if ($("cuotaConInteres").checked && !(datos.tea > 0)) {

            mostrarToast("📈 Escribe la tasa de interés anual (TEA) o desmarca «tiene intereses»");

            return;

        }

        if (!datos.nombre || !(datos.monto > 0) || !Number.isInteger(datos.cuotas) || datos.cuotas < 1 ||
            !Number.isInteger(datos.pagadas) || datos.pagadas < 0 || !Number.isInteger(datos.dia) || datos.dia < 1 || datos.dia > 31) {

            mostrarToast("💲 Revisa el nombre, la cuota, el total de cuotas y el día (1 al 31)");

            return;

        }

        if (datos.pagadas > datos.cuotas) {

            mostrarToast("Las cuotas que ya pagaste no pueden ser más que el total");

            return;

        }

        const boton = $("cuotaBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarFijo(datos);

            $("cuotaForm").reset(); $("cuotaTeaCampo").hidden = true; cerrarForm("cuotaForm");

            mostrarToast(`✅ Préstamo "${datos.nombre}" guardado`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar préstamo";

        }

    });

    // Metas de ahorro: guardar, aportar, retirar, cambiar y quitar
    $("metaForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const datos = {
            nombre: $("metaNombre").value.trim(),
            objetivo: Number($("metaObjetivo").value),
            fecha: $("metaFecha").value
        };

        if (!datos.nombre || !(datos.objetivo > 0)) {

            mostrarToast("💲 Revisa el nombre y el objetivo");

            return;

        }

        const boton = $("metaBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarMeta(datos);

            $("metaForm").reset(); cerrarForm("metaForm");

            mostrarToast(`✅ Meta "${datos.nombre}" guardada`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar meta";

        }

    });

    $("metas").addEventListener("click", async (e) => {

        const boton = e.target.closest("[data-meta]");

        if (!boton || boton.disabled) return;

        const item = boton.closest("[data-nombre]");

        const nombre = item.dataset.nombre;

        const accion = boton.dataset.meta;

        if (accion === "editar") {

            $("metaNombre").value = nombre;

            $("metaObjetivo").value = item.dataset.objetivo;

            $("metaFecha").value = item.dataset.fecha;

            abrirForm("metaForm");

            $("metaObjetivo").focus();

            return;

        }

        if (accion === "aportar" || accion === "retirar") {

            const campo = item.querySelector(".meta-monto");

            const monto = Number(campo.value);

            if (!(monto > 0)) {

                mostrarToast("💲 Escribe un monto mayor que 0");

                campo.focus();

                return;

            }

            boton.disabled = true;

            try {

                await api("aporte", { nombre, monto: accion === "aportar" ? monto : -monto });

                await cargarDatos();

                renderTodo();

                mostrarToast(accion === "aportar"
                    ? `✅ Aportaste ${money(monto)} a ${nombre}`
                    : `↩️ Retiraste ${money(monto)} de ${nombre}`);

            } catch (err) {

                boton.disabled = false;

                errorDeAccion(err);

            }

            return;

        }

        // Quitar: segundo toque para confirmar
        if (!boton.dataset.confirmando) {

            boton.dataset.confirmando = "1";

            boton.textContent = "¿Seguro?";

            setTimeout(() => {

                if (boton.isConnected && boton.dataset.confirmando) {

                    delete boton.dataset.confirmando;

                    boton.textContent = "Quitar";

                }

            }, 4000);

            return;

        }

        boton.disabled = true;

        boton.textContent = "⏳";

        try {

            await guardarMeta({ nombre, quitar: true });

            mostrarToast(`🗑️ Meta "${nombre}" quitada`);

        } catch (err) {

            errorDeAccion(err);

        }

    });

    $("avisoFijos").addEventListener("click", () => { plan.ir("pagos"); mostrarVista("fijos"); });

    $("avisoTarjetas").addEventListener("click", () => { plan.ir("tarjetas"); mostrarVista("fijos"); });

    // Tarjetas: guardar presupuesto, usar el del mes pasado, cambiar y quitar
    $("tarjForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const nombre = $("tarjNombre").value.trim();

        const presupuesto = Number($("tarjPresupuesto").value);

        // Del calendario sale la fecha exacta y el día que se repite cada mes
        const proximo = $("tarjFecha").value;

        const dia = proximo ? Number(proximo.slice(8, 10)) : 0;

        if (!nombre || !(presupuesto >= 0) || (proximo && !(dia >= 1 && dia <= 31))) {

            mostrarToast("💳 Revisa el nombre, el límite y la fecha de pago");

            return;

        }

        const boton = $("tarjBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        const antes = nivelesTarjetas();

        try {

            await guardarTarjeta(nombre, presupuesto, dia, proximo);

            $("tarjForm").reset(); cerrarForm("tarjForm");

            mostrarToast(`✅ Tarjeta "${nombre}" guardada`);

            const aviso = avisoCambioTarjetas(antes);

            if (aviso) setTimeout(() => mostrarToast(aviso), 1600);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar tarjeta";

        }

    });

    $("tarjetas").addEventListener("submit", (e) => {

        const f = e.target.closest("[data-tarjpago]");

        if (!f) return;

        e.preventDefault();

        const item = f.closest("[data-nombre]");

        const monto = Number(f.querySelector("input").value);

        const deuda = Number(item.dataset.deuda);

        if (!(monto > 0)) return;

        if (monto > deuda + 0.005) {

            mostrarToast(`💳 Solo debes ${money(deuda)}. Pon un monto menor o toca "Pagué todo".`);

            return;

        }

        registrarPagoTarjeta(item.dataset.nombre, monto);

    });

    $("tarjetas").addEventListener("click", async (e) => {

        const ejemplo = e.target.closest("[data-ejemplo]");

        if (ejemplo) {

            $("mensaje").value = ejemplo.dataset.ejemplo;

            mostrarVista("dashboard");

            $("mensaje").focus();

            return;

        }

        const boton = e.target.closest("[data-tarj]");

        if (!boton || boton.disabled) return;

        const item = boton.closest("[data-nombre]");

        const nombre = item.dataset.nombre;

        const accion = boton.dataset.tarj;

        if (accion === "editar") {

            $("tarjNombre").value = nombre;

            $("tarjPresupuesto").value = Number(item.dataset.presupuesto) || "";

            $("tarjFecha").value = item.dataset.fecha || "";

            abrirForm("tarjForm");

            $("tarjPresupuesto").focus();

            return;

        }

        try {

            if (accion === "pagartodo") {

                pagarTodoTarjeta(nombre);

                return;

            }

            if (accion === "pagarparte") {

                const f = item.querySelector("[data-tarjpago]");

                if (f) {

                    f.hidden = !f.hidden;

                    if (!f.hidden) f.querySelector("input").focus();

                }

                return;

            }

            // Quitar pide un segundo toque
            if (!boton.dataset.confirmando) {

                const original = boton.textContent.trim();

                boton.dataset.confirmando = "1";

                boton.textContent = "¿Seguro?";

                setTimeout(() => {

                    if (boton.isConnected && boton.dataset.confirmando) {

                        delete boton.dataset.confirmando;

                        boton.textContent = original;

                    }

                }, 4000);

                return;

            }

            // Con deuda solo se puede quitar el límite; sin deuda se quita la tarjeta entera (con sus duplicadas)
            if (accion === "quitarlimite") await api("tarjeta", { nombre, presupuesto: 0 });

            else await api("tarjeta", { nombre, quitar: true });

            await cargarDatos();

            renderTodo();

            mostrarToast(accion === "quitarlimite"
                ? `Listo, "${nombre}" ya no tiene límite`
                : `🗑️ Listo, quité "${nombre}" (tus compras se conservan)`);

        } catch (err) {

            errorDeAccion(err);

        }

    });

    $("chatForm").addEventListener("submit", (e) => {

        e.preventDefault();

        enviarPregunta($("chatInput").value);

    });

    $("sugerencias").addEventListener("click", (e) => {

        const chip = e.target.closest("[data-pregunta]");

        if (chip) enviarPregunta(chip.dataset.pregunta);

    });

    $("chatLimpiar").addEventListener("click", () => {

        estado.chat = [];

        renderChat();

    });

    document.querySelectorAll("nav a[data-vista]").forEach((a) => {

        a.addEventListener("click", (e) => {

            e.preventDefault();

            mostrarVista(a.dataset.vista);

        });

    });

    $("toggleDeudas").addEventListener("click", () => {

        estado.mostrarTodasLasDeudas = !estado.mostrarTodasLasDeudas;

        renderDeudas();

    });

    // Marcar una deuda como pagada (dos toques, para evitar clics por error)
    $("deudas").addEventListener("click", (e) => {

        const boton = e.target.closest(".btn-deuda");

        if (boton) pagarDeuda(boton);

    });

    // Presupuestos: guardar, cambiar y quitar
    $("presForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const categoria = nombreCategoria($("presCategoria").value);

        const limite = Number($("presLimite").value);

        if (!$("presCategoria").value.trim() || !(limite > 0)) {

            mostrarToast("💲 Elige una categoría y un límite mayor que 0");

            return;

        }

        const boton = $("presBoton");

        boton.disabled = true;

        boton.textContent = "⏳ Guardando...";

        try {

            await guardarPresupuesto(categoria, limite);

            $("presCategoria").value = "";

            $("presLimite").value = "";

            cerrarForm("presForm");

            mostrarToast(`✅ Presupuesto de ${categoria} guardado`);

        } catch (err) {

            errorDeAccion(err);

        } finally {

            boton.disabled = false;

            boton.textContent = "Guardar presupuesto";

        }

    });

    $("presupuestos").addEventListener("click", async (e) => {

        const boton = e.target.closest("[data-pres]");

        if (!boton) return;

        const item = boton.closest("[data-categoria]");

        const categoria = item.dataset.categoria;

        if (boton.dataset.pres === "editar") {

            $("presCategoria").value = categoria;

            $("presLimite").value = item.dataset.limite;

            abrirForm("presForm");

            $("presLimite").focus();

            return;

        }

        if (boton.disabled) return;

        // Quitar: pide confirmar con un segundo toque
        if (!boton.dataset.confirmando) {

            boton.dataset.confirmando = "1";

            boton.textContent = "¿Seguro?";

            setTimeout(() => {

                if (boton.isConnected && boton.dataset.confirmando) {

                    delete boton.dataset.confirmando;

                    boton.textContent = "Quitar";

                }

            }, 4000);

            return;

        }

        boton.disabled = true;

        boton.textContent = "⏳";

        try {

            await guardarPresupuesto(categoria, 0);

            mostrarToast(`🗑️ Presupuesto de ${categoria} quitado`);

        } catch (err) {

            errorDeAccion(err);

        }

    });

    // Editar y borrar movimientos de la actividad reciente
    $("actividad").addEventListener("click", (e) => {

        const boton = e.target.closest("[data-accion]");

        if (boton) { accionActividad(boton); return; }

        const toque = e.target.closest(".mov-toque");

        if (toque) alternarFila(toque);

    });

    $("actividad").addEventListener("keydown", (e) => {

        const toque = e.target.closest(".mov-toque");

        if (toque && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); alternarFila(toque); }

    });

    document.querySelectorAll("[data-proximamente]").forEach((a) => {

        a.addEventListener("click", (e) => {

            e.preventDefault();

            mostrarToast("🚧 Próximamente");

        });

    });

    $("bloquear").addEventListener("click", async () => {

        // Cierra la sesión también en el servidor (sin esperar más de 1.5 s)
        if (!modoDemo && leerPin()) await Promise.race([api("salir").catch(() => {}), dormir(1500)]);

        borrarPin();

        location.reload();

    });

    $("reintentar").addEventListener("click", actualizarTodo);

    $("pinForm").addEventListener("submit", async (e) => {

        e.preventDefault();

        const usuario = $("pinUsuario").value.trim().toLowerCase();

        const clave = $("pinInput").value;

        if (!usuario || !clave) return;

        const boton = $("pinBoton");

        boton.disabled = true;

        boton.textContent = "Verificando...";

        $("pinError").textContent = "";

        try {

            const sesion = await api("login", { usuario, clave }, "");

            guardarPin(sesion.token);

            try { localStorage.setItem(USUARIO_KEY, usuario); } catch (e2) { /* sin almacenamiento */ }

            const data = await api("leer");

            aplicarDatos(data);

            guardarCache(data);

            $("pinOverlay").hidden = true;

            $("pinInput").value = "";

            mostrarErrorCarga(false);

            renderTodo();

            if (sesion.cambiarClave || (data.usuario && data.usuario.cambiarClave)) abrirCambioClave(true);

        } catch (err) {

            $("pinError").textContent = err instanceof ErrorPausa
                ? MENSAJE_PAUSA
                : err instanceof ErrorPin
                ? "Usuario o contraseña incorrectos."
                : err && err.message && !/fetch|network|red \(/i.test(err.message)
                ? err.message
                : "No se pudo conectar. Revisa tu internet.";

        } finally {

            boton.disabled = false;

            boton.textContent = "Entrar";

        }

    });

    if (leerPin()) {

        // Muestra al instante lo último que se vio y actualiza por detrás
        const cache = leerCache();

        if (cache) {

            try {

                aplicarDatos(cache);

                renderTodo();

            } catch (e) {

                console.error(e);

            }

        }

        actualizarTodo();

    } else {

        pedirPin();

    }

});
