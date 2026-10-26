// Finanzas IA · registro.js — Render general, registrar movimientos (rápido, con IA, pasos) y buzón de mejoras
// Se cargan en orden: nucleo → cuenta → inicio → secciones → registro → eventos (comparten el mismo ámbito global).
"use strict";

// =========================
// RENDER GENERAL
// =========================

function renderTodo() {

    renderUsuario();

    renderDashboard();

    renderBienvenida();

    renderActividad();

    actualizarSelectorMes();

    renderResumenPeriodo();

    renderEstadisticas();

    renderPresupuestos();

    renderTarjetas();

    renderFijos();

    renderMetas();

    if (window.freelance) freelance.render();

    if (window.compartido) compartido.render();

    plan.contar();

    if (window.extras) extras.render();

    renderDeudas();

}

function mostrarErrorCarga(mostrar) {

    $("errorCarga").hidden = !mostrar;

    if (mostrar) document.documentElement.classList.remove("cargando");

}

function manejarError(e) {

    if (e instanceof ErrorPausa) {

        // No se borra el código: cuando te reactiven, basta con recargar
        pedirPin(MENSAJE_PAUSA);

        return;

    }

    if (e instanceof ErrorPin) {

        borrarPin();

        pedirPin("Tu sesión terminó. Vuelve a entrar.");

        return;

    }

    if (e instanceof ErrorCambiarClave) {

        abrirCambioClave(true);

        return;

    }

    console.error(e);

    mostrarErrorCarga(true);

}

async function actualizarTodo() {

    try {

        await cargarDatos();

        mostrarErrorCarga(false);

        renderTodo();

        animar(".tarjeta");

    } catch (e) {

        manejarError(e);

    }

}

// =========================
// REGISTRAR MOVIMIENTO
// =========================

// ---------- Registro rápido (sin IA) ----------
// Mensajes simples como "almuerzo 15" se entienden aquí mismo y se guardan directo en el Sheet.
// Si hay cualquier duda (varios montos, préstamos, fechas, categoría desconocida) devuelve null
// y el mensaje sigue el camino de siempre (Make + IA).

const sinTildes = (t) =>
    String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REGLAS_RAPIDAS = [
    // Ingresos por fuente primero: "vendí ropa" es una venta, no un gasto en ropa
    { tipo: "Ingreso", claves: ["venta", "ventas", "vendi", "vendimos"], candidatas: ["Ventas"] },
    { tipo: "Ingreso", claves: ["freelance", "freelancer", "proyecto", "logo", "diseno", "cliente", "trabajito", "chamba", "comision"], candidatas: ["Freelance"] },
    { tipo: "Gasto", claves: ["almuerzo", "cena", "desayuno", "menu", "comida", "pollo", "pizza", "cafe", "snack", "galletas", "bebida", "jugo", "helado", "hamburguesa", "chifa", "sushi", "ceviche", "agua", "gaseosa", "pan"], candidatas: ["Comida", "Alimentación", "Alimentacion", "Restaurantes"] },
    { tipo: "Gasto", claves: ["taxi", "uber", "cabify", "bus", "pasaje", "combi", "metro", "gasolina", "combustible", "peaje", "estacionamiento", "scooter"], candidatas: ["Transporte", "Movilidad"] },
    { tipo: "Gasto", claves: ["mercado", "supermercado", "plaza", "tottus", "wong", "metro"], candidatas: ["Supermercado", "Mercado", "Compras"] },
    { tipo: "Gasto", claves: ["cine", "netflix", "spotify", "juego", "salida", "entrada", "concierto", "disco", "bar"], candidatas: ["Entretenimiento", "Ocio", "Salidas"] },
    { tipo: "Gasto", claves: ["farmacia", "medicina", "doctor", "pastillas", "consulta"], candidatas: ["Salud"] },
    { tipo: "Gasto", claves: ["ropa", "zapatillas", "zapatos", "polo", "pantalon", "casaca", "camisa", "vestido", "jean", "short"], candidatas: ["Ropa", "Compras"] },
    { tipo: "Gasto", claves: ["luz", "internet", "celular", "recarga", "alquiler", "cable"], candidatas: ["Servicios", "Recibos", "Hogar"] },
    { tipo: "Ingreso", claves: ["sueldo", "salario", "quincena"], candidatas: ["Sueldo", "Salario", "Ingresos"] },
    { tipo: "Ingreso", claves: ["propina", "bono", "gratificacion", "cts", "utilidades"], candidatas: ["Otros ingresos", "Ingresos"] }
];

// Categorías que ya existen en tus movimientos (así no se inventan categorías nuevas)
function categoriasExistentes() {

    const mapa = new Map();

    // En la demo todavía no hay datos: se usan categorías típicas para que el registro rápido funcione
    if (modoDemo) DemoBackend.categorias.forEach((c) => mapa.set(sinTildes(c), c));

    estado.movimientos.forEach((m) => {

        const k = sinTildes(m.categoria).trim();

        if (k && !mapa.has(k)) mapa.set(k, m.categoria.trim());

    });

    return mapa;

}

const MARCAS_TARJETA = "bcp|bbva|interbank|ibk|scotiabank|scotia|visa|mastercard|amex|diners|falabella|cmr|ripley";

function nombreBonito(n) {

    const t = String(n).replace(/\s+/g, " ").trim();

    const conocida = infoTarjetas().find((x) => claveTarjeta(x.nombre) === claveTarjeta(t));

    if (conocida) return conocida.nombre;

    return t.length <= 4 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

}

// "pagué la tarjeta BCP 450" / "pagué 450 de la tarjeta BCP"
function parsearPagoTarjeta(original) {

    // Sin monto: "pagué la tarjeta BCP" paga todo lo que debes en esa tarjeta
    const sinMonto = original.match(/^\s*(?:pagu[eé]|pago|pagar|abon[eé])\s+(?:toda\s+|todo\s+)?(?:la\s+|mi\s+)?tarjeta\s+(?:de\s+cr[eé]dito\s+)?([A-Za-zÁÉÍÓÚáéíóúÑñ0-9 ]{2,30}?)\s*$/i);

    if (sinMonto) {

        const k = claveTarjeta(sinMonto[1]);

        const t = infoTarjetas().find((x) => claveTarjeta(x.nombre) === k);

        if (t && t.deuda > 0.005) return { tipo: "Gasto", categoria: "Pago de tarjeta", descripcion: "Pago tarjeta " + t.nombre, monto: t.deuda, medio: t.nombre };

    }

    const num = "(?:S\\/\\.?\\s*)?(\\d+(?:[.,]\\d{1,2})?)\\s*(?:soles?)?";

    let m = original.match(new RegExp("^\\s*(?:pagu[eé]|pago|pagar|abon[eé])\\s+(?:la\\s+|mi\\s+)?(tarjeta\\s+(?:de\\s+cr[eé]dito\\s+)?)?([A-Za-zÁÉÍÓÚáéíóúÑñ0-9 ]{2,30}?)\\s+" + num + "\\s*$", "i"));

    let nombre, monto;

    if (m) {

        nombre = m[2];

        monto = m[3];

        const conocida = infoTarjetas().some((x) => claveTarjeta(x.nombre) === claveTarjeta(nombre));

        if (!m[1] && !conocida && !new RegExp("^(" + MARCAS_TARJETA + ")$", "i").test(nombre.trim())) return null;

    } else {

        m = original.match(new RegExp("^\\s*(?:pagu[eé]|pago|pagar|abon[eé])\\s+" + num + "\\s+(?:de|a|en)\\s+(?:la\\s+|mi\\s+)?tarjeta\\s+(?:de\\s+cr[eé]dito\\s+)?([A-Za-zÁÉÍÓÚáéíóúÑñ0-9 ]{2,30}?)\\s*$", "i"));

        if (!m) return null;

        monto = m[1];

        nombre = m[2];

    }

    nombre = nombre.replace(/^(?:la|mi|de|tarjeta)\s+/i, "").trim();

    const valor = parseFloat(monto.replace(",", "."));

    if (!nombre || !(valor > 0) || valor > 1000000) return null;

    const medio = nombreBonito(nombre);

    return { tipo: "Gasto", categoria: "Pago de tarjeta", descripcion: "Pago tarjeta " + medio, monto: valor, medio };

}

// Saca "con la BCP" / "con mi tarjeta Interbank" del texto y devuelve la tarjeta
function extraerTarjeta(original) {

    const escapar = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const conocidas = infoTarjetas().map((t) => t.nombre).sort((a, b) => b.length - a.length);

    const prefijo = "(?:\\s+(?:con|en|usando|de))?\\s+(?:(?:la|mi|el)\\s+)?(?:tarjeta\\s+)?(?:de\\s+cr[eé]dito\\s+)?";

    for (const nombre of conocidas) {

        const re = new RegExp(prefijo + "(" + escapar(nombre) + ")(?![A-Za-z0-9ÁÉÍÓÚáéíóúÑñ])", "i");

        const m = original.match(re);

        if (m && /\b(con|en|usando|tarjeta)\b/i.test(m[0])) return { limpio: original.replace(m[0], " ").trim(), tarjeta: nombre };

    }

    let m = original.match(/\s+con\s+(?:la\s+|mi\s+)?tarjeta\s+(?:de\s+cr[eé]dito\s+)?([A-Za-zÁÉÍÓÚáéíóúÑñ0-9]{2,20})(?![A-Za-z0-9])/i);

    if (!m) m = original.match(new RegExp("\\s+con\\s+(?:la\\s+|mi\\s+)?(?:tarjeta\\s+)?(" + MARCAS_TARJETA + ")(?![A-Za-z0-9])", "i"));

    if (m) return { limpio: original.replace(m[0], " ").trim(), tarjeta: nombreBonito(m[1]) };

    return { limpio: original, tarjeta: "" };

}

// «interés BCP 25» / «interés de la tarjeta BCP 25» / «me cobraron 25 de interés en la BCP»
function parsearInteres(original) {

    const nom = "([A-Za-zÁÉÍÓÚáéíóúÑñ0-9 ]{2,30}?)";

    const num = "(?:S\\/\\.?\\s*)?(\\d+(?:[.,]\\d{1,2})?)\\s*(?:soles?)?";

    const pre = "(?:(?:de|en)\\s+)?(?:(?:la|mi)\\s+)?(tarjeta\\s+(?:de\\s+cr[eé]dito\\s+)?)?";

    const intro = "(?:me\\s+(?:cobraron|cobr[oó]|salieron)\\s+)?";

    let m = original.match(new RegExp("^\\s*" + intro + "inter[eé]s(?:es)?\\s+" + pre + nom + "\\s+" + num + "\\s*$", "i"));

    let nombre, monto, conTarjeta;

    if (m) { conTarjeta = m[1]; nombre = m[2]; monto = m[3]; }

    else {

        m = original.match(new RegExp("^\\s*" + intro + "inter[eé]s(?:es)?\\s+" + num + "\\s+" + pre + nom + "\\s*$", "i"));

        if (m) { monto = m[1]; conTarjeta = m[2]; nombre = m[3]; }

        else {

            m = original.match(new RegExp("^\\s*me\\s+(?:cobraron|cobr[oó]|salieron)\\s+" + num + "\\s+(?:de|en)\\s+inter[eé]s(?:es)?\\s+" + pre + nom + "\\s*$", "i"));

            if (!m) return null;

            monto = m[1]; conTarjeta = m[2]; nombre = m[3];

        }

    }

    nombre = nombre.replace(/^(?:la|mi|de|tarjeta)\s+/i, "").trim();

    const valor = parseFloat(monto.replace(",", "."));

    if (!nombre || !(valor > 0) || valor > 1000000) return null;

    const conocida = infoTarjetas().some((x) => claveTarjeta(x.nombre) === claveTarjeta(nombre));

    if (!conTarjeta && !conocida && !new RegExp("^(" + MARCAS_TARJETA + ")$", "i").test(nombre.trim())) return null;

    const medio = nombreBonito(nombre);

    return { tipo: "Gasto", categoria: "Intereses", descripcion: "Interés tarjeta " + medio, monto: valor, medio };

}

// «openai 5 dólares», «$12 steam»: se lee el monto en dólares y luego se pasa a soles
const RE_DOLAR = /us\$|\$|\busd\b|\bd[oó]lar(?:es)?\b/gi;

function parsearRapido(texto) {

    const original = String(texto || "").trim();

    if (RE_DOLAR.test(original)) {

        RE_DOLAR.lastIndex = 0;

        const sinDolar = original.replace(RE_DOLAR, " ").replace(/\s+/g, " ").trim();

        const { limpio, tarjeta } = extraerTarjeta(sinDolar);

        const r = parsearRapidoBase(limpio);

        if (!r || (tarjeta && r.tipo !== "Gasto")) return null;

        if (tarjeta) r.medio = tarjeta;

        r.usd = r.monto;

        return r;

    }

    RE_DOLAR.lastIndex = 0;

    const interes = parsearInteres(original);

    if (interes) return interes;

    const pago = parsearPagoTarjeta(original);

    if (pago) return pago;

    const { limpio, tarjeta } = extraerTarjeta(original);

    const r = parsearRapidoBase(limpio);

    if (r && tarjeta) {

        if (r.tipo !== "Gasto") return null;

        r.medio = tarjeta;

    }

    return r;

}

function parsearRapidoBase(texto) {

    const original = String(texto || "").trim();

    const t = sinTildes(original);

    // Varios movimientos, préstamos, deudas, fechas o monedas raras: que lo resuelva la IA
    if (/[\n;+]|,(?!\d)|\d,(?=\D)/.test(original)) return null;

    if (/\s(y|e)\s/.test(" " + t + " ")) return null;

    if (/(prestam|preste|debe|debo|deuda|reembols|devolv|devuelv|ayer|anoche|anteayer|manana|semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|dolar|usd|\$|%)/.test(t)) return null;

    // "1,500" es ambiguo (¿1.5 o mil quinientos?): que lo resuelva la IA
    if (/\d[,.]\d{3}(?!\d)/.test(original)) return null;

    // Exactamente un número
    const numeros = original.match(/\d+(?:[.,]\d+)?/g) || [];

    if (numeros.length !== 1) return null;

    const monto = parseFloat(numeros[0].replace(",", "."));

    if (!(monto > 0) || monto > 1000000) return null;

    // Descripción: el texto sin el número, sin "S/" y sin verbos de relleno
    let desc = original
        .replace(numeros[0], " ")
        .replace(/\bs\/\.?|\bsoles?\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    desc = desc.replace(/^(me\s+(?:pagaron|depositaron|yapearon|dieron|transfirieron)|gan[eé]|gast[eé]|compr[eé]|pagu[eé]|pago|gasto|compra|recib[ií]|cobr[eé])\s+/i, "");

    desc = desc.replace(/^(?:(?:en|de|por|con|un|una|el|la|los|las)\s+)+/i, "");

    desc = desc.replace(/(?:\s+(?:en|de|por|con|a))+$/i, "");

    desc = desc.replace(/^[\s.\-:]+|[\s.\-:]+$/g, "");

    if (desc.length < 2 || desc.length > 60) return null;

    desc = desc.charAt(0).toUpperCase() + desc.slice(1);

    const clave = sinTildes(desc).trim();

    const palabras = new Set(clave.split(/[^a-z0-9ñ]+/).filter(Boolean));

    // 1) ¿Ya registraste algo con esa misma descripción? Se copia su tipo y categoría
    for (let i = estado.movimientos.length - 1; i >= 0; i--) {

        const m = estado.movimientos[i];

        if (sinTildes(String(m.descripcion || "").replace(/ · US\$.*$/, "")).trim() === clave) {

            if (esPrestamo(m) || esReembolso(m)) return null;

            if (m.tipo.toLowerCase() !== "gasto" && m.tipo.toLowerCase() !== "ingreso") return null;

            return {
                tipo: esIngreso(m) ? "Ingreso" : "Gasto",
                categoria: m.categoria.trim() || "Otros",
                descripcion: desc,
                monto
            };

        }

    }

    // 2) Palabras comunes, pero solo si esa categoría ya existe en tu hoja
    const existentes = categoriasExistentes();

    for (const regla of REGLAS_RAPIDAS) {

        if (!regla.claves.some((c) => palabras.has(c))) continue;

        for (const cand of regla.candidatas) {

            const real = existentes.get(sinTildes(cand));

            if (real) return { tipo: regla.tipo, categoria: real, descripcion: desc, monto };

        }

        // Ninguna de esas categorías existe todavía (cuenta nueva): se usa la principal
        return { tipo: regla.tipo, categoria: regla.candidatas[0], descripcion: desc, monto };

    }

    return null;

}

let pendientesGuardar = 0;

// Pago de una tarjeta (todo o una parte): baja lo que debes, no cuenta como gasto nuevo
// "Pagué todo": si ya pasó el día de pago, primero pregunta si te cobraron interés (así el total cuadra con el banco)
function pagarTodoTarjeta(nombre) {

    const buscar = () => infoTarjetas().find((x) => claveTarjeta(x.nombre) === claveTarjeta(nombre));

    const info = buscar();

    if (!info || !(info.deuda > 0.005)) return;

    const pagar = () => { const t = buscar(); if (t && t.deuda > 0.005) registrarPagoTarjeta(t.nombre, t.deuda); };

    if (info.vencido > 0.005) preguntarInteres(info.nombre, pagar);

    else pagar();

}

function preguntarInteres(nombre, continuar) {

    const viejo = $("preguntaInteres");

    if (viejo) viejo.remove();

    const caja = document.createElement("div");

    caja.id = "preguntaInteres";

    caja.className = "pregunta-interes";

    caja.innerHTML = `
        <div class="pi-caja" role="dialog" aria-modal="true" aria-labelledby="piTitulo">
            <p class="pi-titulo" id="piTitulo">Antes de pagar 💳</p>
            <p class="pi-texto">¿Te cobraron interés en tu ${esc(nombre)}?</p>
            <div class="pi-botones">
                <button type="button" class="pi-btn" data-pi="no">No, pagar todo</button>
                <button type="button" class="pi-btn pi-principal" data-pi="si">Sí, anotarlo</button>
            </div>
            <form class="pi-form" hidden>
                <input type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="¿Cuánto? Ej: 25" aria-label="Monto del interés" required>
                <button type="submit" class="pi-btn pi-principal">Anotar y pagar</button>
            </form>
            <button type="button" class="pi-cancelar" data-pi="cancelar">Cancelar</button>
        </div>
    `;

    const cerrar = () => { caja.remove(); document.removeEventListener("keydown", tecla); };

    const tecla = (e) => { if (e.key === "Escape") cerrar(); };

    document.addEventListener("keydown", tecla);

    caja.addEventListener("click", (e) => {

        if (e.target === caja) { cerrar(); return; }

        const b = e.target.closest("[data-pi]");

        if (!b) return;

        if (b.dataset.pi === "cancelar") cerrar();

        else if (b.dataset.pi === "no") { cerrar(); continuar(); }

        else if (b.dataset.pi === "si") {

            const f = caja.querySelector(".pi-form");

            f.hidden = false;

            caja.querySelector(".pi-botones").hidden = true;

            f.querySelector("input").focus();

        }

    });

    caja.querySelector(".pi-form").addEventListener("submit", (e) => {

        e.preventDefault();

        const valor = Math.round(Number(caja.querySelector("input").value) * 100) / 100;

        if (!(valor > 0)) return;

        cerrar();

        registrarRapido({ tipo: "Gasto", categoria: "Intereses", descripcion: "Interés tarjeta " + nombre, monto: valor, medio: nombre });

        continuar();

    });

    document.body.appendChild(caja);

}

function registrarPagoTarjeta(nombre, monto) {

    const valor = Math.round(Number(monto) * 100) / 100;

    if (!(valor > 0)) return;

    registrarRapido({ tipo: "Gasto", categoria: "Pago de tarjeta", descripcion: "Pago tarjeta " + nombre, monto: valor, medio: nombre });

}

// Muestra el movimiento al instante y lo guarda en segundo plano
function registrarRapido(r) {

    const hoy = new Date();

    const texto =
        String(hoy.getDate()).padStart(2, "0") + "/" +
        String(hoy.getMonth() + 1).padStart(2, "0") + "/" + hoy.getFullYear();

    const maxFila = estado.movimientos.reduce((a, m) => Math.max(a, m.fila), 1);

    const temporal = {
        idx: estado.movimientos.length,
        fila: maxFila + 1,
        fechaTexto: texto,
        fecha: parseFecha(texto),
        tipo: r.tipo,
        categoria: r.categoria,
        descripcion: r.descripcion,
        monto: r.monto,
        medio: r.medio || ""
    };

    const nivelesAntes = nivelesTarjetas();

    estado.movimientos.push(temporal);

    estado.mes = null;

    renderTodo();

    animar(".tarjeta");

    mostrarRegistrados([temporal]);

    if (esPagoTarjeta(temporal)) {

        const info = infoTarjetas().find((x) => claveTarjeta(x.nombre) === claveTarjeta(temporal.medio));

        mostrarToast(info && info.deuda <= 0.005
            ? `✅ Pagaste ${money(temporal.monto)} · ${temporal.medio} al día 🎉`
            : `✅ Pagaste ${money(temporal.monto)}${info ? ` · aún debes ${money(info.deuda)}` : ""}`);

    } else if (esInteres(temporal)) {

        const info = infoTarjetas().find((x) => claveTarjeta(x.nombre) === claveTarjeta(temporal.medio));

        mostrarToast(`😬 Interés de ${money(temporal.monto)} anotado${info ? ` · ahora debes ${money(info.deuda)} en ${info.nombre}` : ""}`);

    } else {

        mostrarToast("✅ Movimiento registrado");

    }

    avisarCambioTarjetas(nivelesAntes, [temporal.medio]);

    let promesaGuardado = Promise.resolve();

    agregarDeshacer(temporal, () => promesaGuardado);

    pendientesGuardar++;

    promesaGuardado = (async () => {

        let fallo = null;

        try {

            await api("agregar", {
                tipo: r.tipo,
                categoria: r.categoria,
                descripcion: r.descripcion,
                monto: r.monto,
                medio: r.medio || ""
            });

        } catch (e) {

            fallo = e;

        }

        pendientesGuardar--;

        // Sin conexión: se queda en la pantalla y se envía cuando vuelva la señal
        if (fallo && !modoDemo && !(fallo instanceof ErrorPin) && colaOffline.esDeRed(fallo)) {

            colaOffline.agregar(null, "agregar", { tipo: r.tipo, categoria: r.categoria, descripcion: r.descripcion, monto: r.monto, medio: r.medio || "" });

            return;

        }

        if (fallo) {

            const i = estado.movimientos.indexOf(temporal);

            if (i >= 0) estado.movimientos.splice(i, 1);

            renderTodo();

            if (fallo instanceof ErrorPin) {

                manejarError(fallo);

            } else {

                console.error(fallo);

                $("respuesta").textContent = "⚠️ No se pudo guardar: " + r.descripcion + ". Inténtalo otra vez.";

                mostrarToast("❌ No se pudo guardar el movimiento");

            }

        }

        // Cuando ya no queda nada guardándose, se trae la hoja real (con sus números de fila)
        if (pendientesGuardar === 0) {

            try {

                await cargarDatos();

                if (estado.editando === null) renderTodo();

            } catch (e) {

                console.error(e);

            }

        }

    })();

}

// Espera a que Make escriba la fila en el Sheet (en vez de un tiempo fijo)
async function esperarNuevos(cantidadAntes) {

    // Si la respuesta ya trajo los datos nuevos, no hay que esperar nada
    if (estado.movimientos.length > cantidadAntes) return estado.movimientos.slice(cantidadAntes);

    for (let i = 0; i < 12; i++) {

        await dormir(1200);

        await cargarDatos();

        if (estado.movimientos.length > cantidadAntes) {

            await dormir(900); // por si el mensaje generó más de una fila

            await cargarDatos();

            return estado.movimientos.slice(cantidadAntes);

        }

    }

    return null;

}

function mostrarRegistrados(nuevos) {

    const caja = $("respuesta");

    if (nuevos === null) {

        caja.textContent = "⏳ Enviado, pero todavía no aparece en la hoja. Recarga en unos segundos.";

        return;

    }

    // Un solo mensaje no genera decenas de filas: si pasa, no listamos todo
    if (nuevos.length > 5) {

        caja.textContent = "✅ Registrado. Revisa tu actividad reciente aquí abajo.";

        return;

    }

    const lineas = nuevos.map((m) =>
        `${esIngreso(m) ? "📈" : "📉"} ${esc(m.descripcion || m.categoria)} · ${esc(m.categoria)}${m.medio ? ` · 💳 ${esc(m.medio)}` : ""} · ` +
        `<strong>${esIngreso(m) ? "+" : "-"} ${money(m.monto)}</strong>`
    );

    if (typeof billete !== "undefined") billete.mostrar(nuevos);

    caja.innerHTML =
        `✅ Registrado${nuevos.length > 1 ? ` (${nuevos.length} movimientos)` : ""}:<br>` +
        lineas.join("<br>");

}

// «pagué la cuota de la moto» / «pagué cuota préstamo BCP 350» / «pagué la cuota» (si solo tienes un préstamo)
function parsearPagoCuota(texto) {

    const m = String(texto || "").match(/^\s*(?:pagu[eé]|pago|pagar|abon[eé])\s+(?:la\s+|mi\s+|una\s+)?cuota(?:\s+(?:del?|para)\s+|\s+)?(?:(?:el|la|mi|del?)\s+)?(?:pr[eé]stamo\s+)?(?:(?:de|del|la|el)\s+)?([A-Za-zÁÉÍÓÚáéíóúÑñ0-9 ]*?)\s*(?:S\/\.?\s*)?(?:\d+(?:[.,]\d{1,2})?)?\s*(?:soles?)?\s*$/i);

    if (!m) return null;

    const lista = estado.fijos.filter((f) => f.tipo === "Cuota" && !(f.cuotas > 0 && f.pagadas >= f.cuotas));

    if (!lista.length) return null;

    const nombre = claveTarjeta(m[1]);

    if (!nombre) return lista.length === 1 ? lista[0] : null;

    const exacto = lista.filter((f) => claveTarjeta(f.nombre) === nombre);

    if (exacto.length === 1) return exacto[0];

    const parecido = lista.filter((f) => claveTarjeta(f.nombre).includes(nombre) || nombre.includes(claveTarjeta(f.nombre)));

    return parecido.length === 1 ? parecido[0] : null;

}

// «adelanté 1000 a la moto» / «adelanto moto 1000» / «adelanté 500 al préstamo»
function parsearAdelanto(texto) {

    const m = String(texto || "").match(/^\s*(?:adelant[eé]|adelanto|adelantar)\s+(?:(?:S\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:soles?)?\s+)?(?:(?:a|al|de|del|para|en)\s+)?(?:(?:la|el|mi|una)\s+)?(?:cuota\s+)?(?:(?:de|del)\s+)?(?:(?:la|el|mi)\s+)?(?:pr[eé]stamo\s+)?(?:(?:de|del|la|el)\s+)?([A-Za-zÁÉÍÓÚáéíóúÑñ ]*?)\s*(?:S\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)?\s*(?:soles?)?\s*$/i);

    if (!m) return null;

    const monto = parseFloat(String(m[1] || m[3] || "").replace(",", "."));

    if (!(monto > 0)) return null;

    const lista = estado.fijos.filter((f) => f.tipo === "Cuota" && !(f.cuotas > 0 && f.pagadas >= f.cuotas));

    if (!lista.length) return null;

    const nombre = claveTarjeta(m[2]);

    let c = null;

    if (!nombre) c = lista.length === 1 ? lista[0] : null;

    else {

        const exacto = lista.filter((f) => claveTarjeta(f.nombre) === nombre);

        const parecido = lista.filter((f) => claveTarjeta(f.nombre).includes(nombre) || nombre.includes(claveTarjeta(f.nombre)));

        c = exacto.length === 1 ? exacto[0] : (parecido.length === 1 ? parecido[0] : null);

    }

    return c ? { c, monto } : null;

}

async function adelantarPrestamo(nombre, monto) {

    const f = estado.fijos.find((x) => x.tipo === "Cuota" && claveTarjeta(x.nombre) === claveTarjeta(nombre));

    if (f) {

        const d = datosPrestamo(f);

        if (monto > d.saldo + 0.005) {

            mostrarToast(`Solo te faltan ${money(d.saldo)} de capital. Pon un monto menor.`);

            return;

        }

    }

    try {

        await api("adelantarCuota", { nombre, monto });

        estado.mes = null;

        await cargarDatos();

        renderTodo();

        animar(".tarjeta");

        const n = estado.fijos.find((x) => x.tipo === "Cuota" && claveTarjeta(x.nombre) === claveTarjeta(nombre));

        const quedan = n ? planPrestamo(datosPrestamo(n).saldo, n.monto, datosPrestamo(n).i).n : null;

        $("respuesta").innerHTML = `✅ Adelantaste <strong>${money(monto)}</strong> a <strong>${esc(nombre)}</strong>`;

        mostrarToast(quedan === 0 ? `🎉 ¡Terminaste de pagar ${nombre}!`
            : `✅ Adelanto de ${money(monto)} registrado${quedan != null ? ` · te quedan ${quedan} ${quedan === 1 ? "cuota" : "cuotas"}` : ""}`);

    } catch (err) {

        errorDeAccion(err);

    }

}

async function pagarCuotaDesdeBarra(c) {

    try {

        await api("pagarFijo", { nombre: c.nombre, tipo: "Cuota" });

        estado.mes = null;

        await cargarDatos();

        renderTodo();

        animar(".tarjeta");

        const n = estado.fijos.find((x) => x.tipo === "Cuota" && claveTarjeta(x.nombre) === claveTarjeta(c.nombre));

        $("respuesta").innerHTML = `✅ Pagaste la cuota de <strong>${esc(c.nombre)}</strong> · ${money(c.monto)}`;

        mostrarToast(n && n.pagadas >= n.cuotas
            ? `🎉 ¡Terminaste de pagar ${c.nombre}!`
            : `✅ Cuota ${n ? n.pagadas : ""} de ${n ? n.cuotas : ""} pagada${n ? ` · te faltan ${n.cuotas - n.pagadas}` : ""}`);

    } catch (err) {

        errorDeAccion(err);

    }

}

// Tipo de cambio dólar → sol del día (se pide una sola vez por día)
let cambioDelDia = null;

async function tipoCambioHoy() {

    const hoy = new Date().toDateString();

    if (cambioDelDia && cambioDelDia.dia === hoy) return cambioDelDia.tc;

    if (modoDemo) return 3.75;

    try {

        const r = await api("tipoCambio");

        cambioDelDia = { dia: hoy, tc: Number(r.tc) };

        return cambioDelDia.tc;

    } catch (e) {

        console.error(e);

        return null;

    }

}

async function registrarMovimiento() {

    const texto = $("mensaje").value.trim();

    if (!texto) {

        mostrarToast("✍️ Escribe un movimiento primero");

        return;

    }

    if (texto.length > MAX_CARACTERES) {

        mostrarToast(`Máximo ${MAX_CARACTERES} caracteres`);

        return;

    }

    // «¿me alcanza para unas zapatillas de 450?» → abre el simulador, no registra nada
    if (window.meAlcanza && meAlcanza.desdeLaBarra(texto)) return;

    // «adelanté 1000 a la moto» → baja el capital del préstamo (sin IA)
    const adelanto = parsearAdelanto(texto);

    if (adelanto) {

        $("mensaje").value = "";

        adelantarPrestamo(adelanto.c.nombre, adelanto.monto);

        return;

    }

    // «pagué la cuota del préstamo Moto» → marca la cuota del mes (sin IA)
    const cuotaBarra = parsearPagoCuota(texto);

    if (cuotaBarra) {

        $("mensaje").value = "";

        pagarCuotaDesdeBarra(cuotaBarra);

        return;

    }

    // Camino rápido: mensaje simple y categoría conocida, sin IA ni Make
    let rapido = parsearRapido(texto);

    // En dólares: se convierte a soles con el cambio del día (si no hay cambio, lo intenta la IA)
    if (rapido && rapido.usd) {

        const tc = await tipoCambioHoy();

        if (tc) {

            rapido.monto = Math.round(rapido.usd * tc * 100) / 100;

            rapido.descripcion = `${rapido.descripcion} · US$${rapido.usd} × ${tc}`;

        } else {

            rapido = null;

        }

    }

    if (rapido) {

        // Pagar la tarjeta de más escondería un sobrepago: se pide un monto que no pase de la deuda
        if (esPagoTarjeta({ tipo: rapido.tipo, categoria: rapido.categoria })) {

            const info = infoTarjetas().find((x) => claveTarjeta(x.nombre) === claveTarjeta(rapido.medio));

            if (info && info.deuda <= 0.005) {

                $("respuesta").textContent = `💳 Tu ${info.nombre} está al día: no debes nada, así que no anoto ese pago.`;

                mostrarToast("💳 No debes nada en esa tarjeta");

                return;

            }

            if (info && rapido.monto > info.deuda + 0.005) {

                $("respuesta").textContent = `💳 Solo debes ${money(info.deuda)} en tu ${info.nombre}. Escribe un monto menor o «pagué la tarjeta ${info.nombre}» para pagar todo.`;

                mostrarToast(`💳 Solo debes ${money(info.deuda)}`);

                return;

            }

        }

        $("mensaje").value = "";

        registrarRapido(rapido);

        return;

    }

    await registrarConIA({ mensaje: texto });

}

// =========================
// PASOS VISIBLES MIENTRAS SE REGISTRA
// Muestra qué está haciendo la app (leer, IA, guardar, actualizar) en vez de un "Registrando..." fijo
// =========================

const pasos = (() => {

    const TEXTOS = {
        leer: "Leyendo tu mensaje",
        audio: "Escuchando tu audio",
        voz: "Pasando tu voz a texto",
        foto: "Preparando la foto",
        ia: "La IA identifica montos y categorías",
        fotoIA: "La IA lee tu boleta",
        guardar: "Guardando en tu hoja de Google",
        actualizar: "Actualizando tus números"
    };

    let reloj = null;

    const caja = () => $("respuesta");

    const items = () => [...caja().querySelectorAll(".pasos li")];

    function mostrar(claves) {

        clearTimeout(reloj);

        caja().innerHTML = `<div class="pasos-caja"><span class="pasos-moneda" aria-hidden="true"><i>S/</i></span><ol class="pasos">${claves.map((k) =>
            `<li data-k="${k}"><span class="paso-ico" aria-hidden="true"></span><span class="paso-txt">${TEXTOS[k] || k}</span></li>`).join("")}</ol></div>`;

    }

    const tiene = (k) => !!caja().querySelector(`.pasos li[data-k="${k}"]`);

    // Marca como hechos los anteriores y deja "k" en curso
    function ir(k) {

        const lista = items();

        const i = lista.findIndex((li) => li.dataset.k === k);

        if (i < 0) return;

        lista.forEach((li, j) => {

            li.classList.toggle("hecho", j < i);

            li.classList.toggle("activo", j === i);

        });

    }

    // Mientras se espera una sola llamada, pasa al siguiente paso después de un rato
    function despues(k, ms) {

        clearTimeout(reloj);

        reloj = setTimeout(() => ir(k), ms);

    }

    async function fin() {

        clearTimeout(reloj);

        items().forEach((li) => { li.classList.remove("activo"); li.classList.add("hecho"); });

        await dormir(450);

    }

    function cancelar() { clearTimeout(reloj); }

    return { mostrar, tiene, ir, despues, fin, cancelar };

})();

// Registro con la IA: texto, texto dictado o foto de una boleta.
// «envio» es lo que va al servidor: { mensaje } o { mensaje, imagen }.
async function registrarConIA(envio) {

    const texto = envio.mensaje || "";

    const boton = $("registrar");

    const textoBoton = $("textoBoton");

    boton.disabled = true;

    medios.ocupado(true);

    textoBoton.textContent = "⏳ Registrando...";

    // Si ya hay pasos en pantalla (audio o foto) se continúa; si no, se empieza desde "Leyendo tu mensaje"
    const pasoIA = pasos.tiene("fotoIA") ? "fotoIA" : "ia";

    if (!pasos.tiene(pasoIA)) { pasos.mostrar(["leer", "ia", "guardar", "actualizar"]); pasos.ir("leer"); }

    try {

        // Si hay algo guardándose en segundo plano, esperar a que termine para contar bien
        for (let i = 0; i < 40 && pendientesGuardar > 0; i++) await dormir(300);

        // Los datos ya están en pantalla; solo se vuelven a pedir si están viejos
        if (Date.now() - ultimaCarga > 60000) await cargarDatos();

        const cantidadAntes = estado.movimientos.length;

        const nivelesAntes = nivelesTarjetas();

        pasos.ir(pasoIA);

        // La IA entiende el mensaje y luego escribe en la hoja dentro de la misma llamada
        pasos.despues("guardar", envio.imagen ? 4500 : 2600);

        await api("registrar", envio);

        pasos.ir("guardar");

        $("mensaje").value = "";

        pasos.ir("actualizar");

        const nuevos = await esperarNuevos(cantidadAntes);

        await pasos.fin();

        estado.mes = null; // vuelve al mes más reciente con gastos

        renderTodo();

        animar(".tarjeta");

        mostrarRegistrados(nuevos);

        if (nuevos && nuevos.length) agregarDeshacerVarios(nuevos);

        mostrarToast(nuevos === null ? "⏳ Enviado, aún procesando" : "✅ Movimiento registrado");

        if (nuevos) avisarCambioTarjetas(nivelesAntes, nuevos.map((m) => m.medio));

    } catch (e) {

        pasos.cancelar();

        if (e instanceof ErrorPin) {

            manejarError(e);

        } else {

            console.error(e);

            // Sin conexión: el texto se guarda y se envía solo cuando vuelve la señal
            if (!envio.imagen && texto && !modoDemo && colaOffline.esDeRed(e)) {

                colaOffline.agregar(texto);

                $("mensaje").value = "";

                return;

            }

            const claro = e && e.message && !/fetch|network|red \(/i.test(e.message) ? e.message : "";

            $("respuesta").textContent = claro
                ? "⚠️ " + claro
                : envio.imagen
                    ? "⚠️ No se pudo leer la foto. Inténtalo otra vez o escríbelo en la barra."
                    : "⚠️ No se pudo registrar. Tu texto sigue abajo, inténtalo otra vez.";

            $("mensaje").value = texto;

            mostrarToast("❌ No se pudo registrar el movimiento");

        }

    } finally {

        boton.disabled = false;

        medios.ocupado(false);

        textoBoton.textContent = "➕ Registrar movimiento";

    }

}

// =========================
// BUZÓN DE MEJORAS (beta)
// =========================

const buzon = (() => {

    const ESTADO_UI = {
        "Recibida": { ico: "📨", clase: "recibida" },
        "En revisión": { ico: "👀", clase: "revision" },
        "Lista": { ico: "✅", clase: "lista" },
        "No por ahora": { ico: "💤", clase: "no" }
    };

    const TIPO_ICO = { "Algo falla": "🐞", "Idea": "💡", "No entendí algo": "🤔" };

    const PISTAS = {
        falla: "Ej: cuando registro con foto, me sale un error…",
        idea: "Ej: me gustaría poder elegir la fecha de pago de mi tarjeta con un calendario",
        confusion: "Ej: no entiendo qué significa «proyección a fin de mes»"
    };

    const vistos = new Set();

    let tipo = "idea";

    function dispositivo() {

        const ua = navigator.userAgent;

        const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
            : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Otro";

        const nav = /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : "";

        return `${so}${nav ? " · " + nav : ""} · ${window.innerWidth}px`;

    }

    function elegir(t) {

        tipo = t;

        document.querySelectorAll(".buzon-tipo").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.tipo === t)));

        $("buzonTexto").placeholder = PISTAS[t];

    }

    function abrir() {

        if (modoDemo) { mostrarToast("💡 En la demo no se envían sugerencias"); return; }

        $("buzonError").textContent = "";

        elegir("idea");

        $("buzonOverlay").hidden = false;

        setTimeout(() => $("buzonTexto").focus(), 50);

        cargarMias();

    }

    function cerrar() { $("buzonOverlay").hidden = true; }

    function itemHTML(x) {

        const e = ESTADO_UI[x.estado] || ESTADO_UI["Recibida"];

        return `<li class="sug-${e.clase}">
            <span class="sug-estado">${e.ico} ${esc(x.estado)}</span>
            <p>${TIPO_ICO[x.tipo] || "💡"} ${esc(x.texto)}</p>
            ${x.respuesta ? `<p class="sug-respuesta">Diego: ${esc(x.respuesta)}</p>` : ""}
        </li>`;

    }

    async function cargarMias() {

        const caja = $("buzonMias");

        try {

            const r = await api("misSugerencias");

            const lista = r.sugerencias || [];

            caja.hidden = !lista.length;

            caja.innerHTML = lista.length ? `<h4>Tus sugerencias</h4><ul>${lista.map(itemHTML).join("")}</ul>` : "";

        } catch (e) {

            caja.hidden = true;

        }

    }

    async function enviar(ev) {

        ev.preventDefault();

        const texto = $("buzonTexto").value.trim();

        if (texto.replace(/\s/g, "").length < 5) { $("buzonError").textContent = "Cuéntame un poquito más 🙂"; return; }

        const boton = $("buzonEnviar");

        boton.disabled = true;

        boton.textContent = "⏳ Enviando...";

        try {

            await api("sugerir", {
                tipo,
                texto,
                pantalla: document.body.dataset.vista || "",
                estilo: document.documentElement.getAttribute("data-tema") || "noche",
                dispositivo: dispositivo()
            });

            $("buzonTexto").value = "";

            $("buzonError").textContent = "";

            mostrarToast("🙌 ¡Gracias! Tu sugerencia llegó");

            cargarMias();

        } catch (e) {

            if (e instanceof ErrorPin) { cerrar(); manejarError(e); return; }

            $("buzonError").textContent = e && e.message && !/fetch|network|red \(/i.test(e.message) ? e.message : "No se pudo enviar. Inténtalo otra vez.";

        } finally {

            boton.disabled = false;

            boton.textContent = "Enviar";

        }

    }

    // Al entrar: avisa si Diego cambió el estado de alguna sugerencia
    function avisar(lista) {

        if (modoDemo || !Array.isArray(lista)) return;

        const nuevas = lista.filter((x) => x && x.id && !vistos.has(x.id + x.estado));

        if (!nuevas.length) return;

        nuevas.forEach((x) => vistos.add(x.id + x.estado));

        const corto = (t) => "«" + (t.length > 40 ? t.slice(0, 40) + "…" : t) + "»";

        const resp = (x) => x.respuesta ? " · " + x.respuesta : "";

        const textos = nuevas.map((x) =>
            x.tipo === "No entendí algo" && x.respuesta ? `💬 Diego respondió tu duda ${corto(x.texto)}: ${x.respuesta}`
            : x.estado === "Lista" && x.tipo === "Algo falla" ? `🔧 Arreglado: ${corto(x.texto)}${resp(x)}`
            : x.estado === "Lista" ? `🎉 Tu idea ${corto(x.texto)} ya está en la app${resp(x)}`
            : x.estado === "En revisión" ? `👀 Diego está revisando ${corto(x.texto)}`
            : `💤 ${corto(x.texto)}: por ahora no${x.respuesta ? " · " + x.respuesta : ""}`);

        textos.forEach((t, i) => setTimeout(() => mostrarToast(t), 1200 + i * 3200));

        api("sugerenciasVistas", { ids: nuevas.map((x) => x.id) }).catch(() => {});

    }

    // ---------- Panel de admin ----------

    function adminItemHTML(x, estados) {

        return `<div class="admin-sug" data-sug="${esc(x.id)}">
            <div class="admin-sug-cab">
                <strong>${TIPO_ICO[x.tipo] || "💡"} ${esc(x.nombre || x.usuario)}</strong>
                <span>@${esc(x.usuario)} · ${esc(x.fecha)}</span>
            </div>
            <p class="admin-sug-texto">${esc(x.texto)}</p>
            <p class="admin-sug-meta">📍 ${esc(x.pantalla || "—")} · 🎨 ${esc(x.estilo || "—")} · 📱 ${esc(x.dispositivo || "—")}</p>
            <div class="admin-sug-acciones">
                <select aria-label="Estado">${estados.map((e) => `<option${e === x.estado ? " selected" : ""}>${esc(e)}</option>`).join("")}</select>
                <input type="text" maxlength="300" placeholder="Respuesta (opcional)" value="${esc(x.respuesta)}" aria-label="Respuesta">
                <button class="mov-btn" type="button" data-sug-guardar>Guardar</button>
            </div>
        </div>`;

    }

    // Filtro del buzón por tipo: Todas / Fallas / Ideas / Dudas
    const FILTROS_ADMIN = [
        { id: "todas", nombre: "Todas", ico: "📬", tipo: null },
        { id: "falla", nombre: "Fallas", ico: "🐞", tipo: "Algo falla" },
        { id: "idea", nombre: "Ideas", ico: "💡", tipo: "Idea" },
        { id: "duda", nombre: "Dudas", ico: "🤔", tipo: "No entendí algo" }
    ];

    let adminLista = [], adminEstados = null, adminFiltro = "todas";


    function pintarAdmin() {

        const caja = $("adminBuzon");

        const delTipo = (f) => f.tipo ? adminLista.filter((x) => x.tipo === f.tipo) : adminLista;

        $("adminBuzonFiltros").innerHTML = FILTROS_ADMIN.map((f) => {

            const todas = delTipo(f);

            const nuevas = todas.filter((x) => x.estado === "Recibida").length;

            return `<button type="button" role="tab" class="buzon-filtro" data-filtro="${f.id}" aria-selected="${adminFiltro === f.id}">
                ${f.ico} ${f.nombre} <span class="bf-num">${todas.length}</span>${nuevas ? `<span class="bf-nuevas" title="${nuevas} sin revisar">${nuevas}</span>` : ""}
            </button>`;

        }).join("");

        const filtro = FILTROS_ADMIN.find((f) => f.id === adminFiltro) || FILTROS_ADMIN[0];

        // Primero lo que aún no revisas
        const lista = delTipo(filtro).slice().sort((a, b) => (a.estado === "Recibida" ? 0 : 1) - (b.estado === "Recibida" ? 0 : 1));

        caja.innerHTML = lista.length
            ? lista.map((x) => adminItemHTML(x, adminEstados || Object.keys(ESTADO_UI))).join("")
            : adminLista.length
                ? `<p class="vacio">No hay ${filtro.nombre.toLowerCase()} por ahora.</p>`
                : '<p class="vacio">Todavía no llegan sugerencias. Cuando tus amigas escriban, aparecen aquí.</p>';

    }

    async function cargarAdmin() {

        const caja = $("adminBuzon");

        try {

            const r = await api("admin_sugerencias");

            adminLista = r.sugerencias || [];

            adminEstados = r.estados || null;

            const nuevas = adminLista.filter((x) => x.estado === "Recibida").length;

            $("adminBuzonNuevas").hidden = !nuevas;

            $("adminBuzonNuevas").textContent = nuevas + (nuevas === 1 ? " nueva" : " nuevas");

            pintarAdmin();

            // Llegaste tocando una notificación: baja directo al buzón
            if (window.__irAlBuzon) {

                window.__irAlBuzon = false;

                setTimeout(() => $("adminBuzon").closest(".admin-buzon").scrollIntoView({ behavior: "smooth", block: "start" }), 200);

            }

        } catch (e) {

            if (e instanceof ErrorPin) { manejarError(e); return; }

            caja.innerHTML = '<p class="vacio">No se pudo cargar el buzón.</p>';

        }

    }

    async function guardarAdmin(boton) {

        const item = boton.closest("[data-sug]");

        boton.disabled = true;

        try {

            await api("admin_sugerencia", {
                id: item.dataset.sug,
                estado: item.querySelector("select").value,
                respuesta: item.querySelector("input").value.trim()
            });

            mostrarToast("✅ Sugerencia actualizada · se le avisará al entrar");

            cargarAdmin();

        } catch (e) {

            errorDeAccion(e);

        } finally {

            boton.disabled = false;

        }

    }

    function iniciar() {

        $("btnBuzon").addEventListener("click", abrir);

        $("buzonAbrir").addEventListener("click", abrir);

        $("buzonCerrar").addEventListener("click", cerrar);

        $("buzonForm").addEventListener("submit", enviar);

        $("buzonOverlay").addEventListener("click", (e) => { if (e.target === $("buzonOverlay")) cerrar(); });

        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("buzonOverlay").hidden) cerrar(); });

        document.querySelectorAll(".buzon-tipo").forEach((b) => b.addEventListener("click", () => elegir(b.dataset.tipo)));

        $("adminBuzonFiltros").addEventListener("click", (e) => {

            const b = e.target.closest("[data-filtro]");

            if (!b) return;

            adminFiltro = b.dataset.filtro;

            pintarAdmin();

        });

        $("adminBuzon").addEventListener("click", (e) => {

            const b = e.target.closest("[data-sug-guardar]");

            if (b) guardarAdmin(b);

        });

    }

    return { iniciar, avisar, cargarAdmin };

})();
