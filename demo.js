// Finanzas IA - Demo v1.0
// Un "Sheet" de mentira que vive solo en la memoria del navegador.
// Responde igual que el Apps Script, pero no toca tu hoja ni guarda nada.
"use strict";

const DemoBackend = (() => {

    let db = null;

    const pad = (n) => String(n).padStart(2, "0");

    const textoFecha = (d = new Date()) =>
        pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();

    const sinTildes = (t) =>
        String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    const clonar = (x) => JSON.parse(JSON.stringify(x));

    const ok = (extra = {}) => ({ ok: true, ...extra });

    const fallo = (error) => ({ ok: false, error });

    const clave = (v) => String(v ?? "").trim().toLowerCase();

    const soles = (n) => "S/ " + (Math.round(Number(n) * 100) / 100).toFixed(2);

    // Igual que seguro_() del Apps Script: nada se convierte en fórmula
    function seguro(v, max) {

        let t = String(v == null ? "" : v).trim().slice(0, max);

        if (/^[=+\-@]/.test(t)) t = " " + t;

        return t;

    }

    function fechaDe(v) {

        const t = String(v == null ? "" : v).replace(/"/g, "").trim();

        const m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);

        return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;

    }

    function reset() {

        db = {
            movimientos: [["Fecha", "Tipo", "Categoría", "Descripción", "Monto"]],
            deudas: [["Persona", "Fecha", "Monto", "Estado"]],
            presupuestos: [["Categoría", "Límite"]],
            fijos: [["Nombre", "Categoría", "Monto", "Día", "Último registro"]],
            metas: [["Nombre", "Objetivo", "Ahorrado", "Fecha límite"]]
        };

    }

    reset();

    // =========================
    // "IA" de la demo: entiende mensajes simples con reglas
    // =========================

    const CATEGORIAS = [
        ["Comida", ["almuerzo", "cena", "desayuno", "menu", "comida", "pollo", "pizza", "cafe", "snack", "galletas", "jugo", "helado", "hamburguesa", "chifa", "sushi", "ceviche", "gaseosa", "pan", "restaurante", "rappi", "delivery"]],
        ["Bebidas", ["monster", "cerveza", "chela", "trago", "vino", "bebida", "red bull"]],
        ["Transporte", ["taxi", "uber", "cabify", "bus", "pasaje", "combi", "metro", "gasolina", "combustible", "peaje", "estacionamiento", "scooter"]],
        ["Supermercado", ["mercado", "supermercado", "tottus", "wong", "plaza vea", "vivanda"]],
        ["Entretenimiento", ["cine", "juego", "salida", "entrada", "concierto", "disco", "bar", "fiesta"]],
        ["Suscripciones", ["netflix", "spotify", "youtube", "disney", "hbo", "prime", "icloud", "chatgpt"]],
        ["Salud", ["farmacia", "medicina", "doctor", "pastillas", "consulta", "dentista"]],
        ["Ropa", ["ropa", "zapatillas", "polo", "pantalon", "casaca", "camisa"]],
        ["Hogar", ["luz", "internet", "alquiler", "cable", "gas", "limpieza", "recibo"]],
        ["Servicios", ["celular", "recarga", "plan"]]
    ];

    const NOMBRES_CATEGORIAS = [...CATEGORIAS.map((c) => c[0]), "Otros", "Sueldo", "Otros ingresos"];

    const PALABRAS_INGRESO =
        /\b(sueldo|salario|quincena|me pagaron|me depositaron|me yapearon|me yapeo|yapearon|cobre|recibi|propina|venta|vendi|ingreso|me dieron)\b/;

    function categoriaDe(norm, esIngreso) {

        if (esIngreso) return /\b(sueldo|salario|quincena)\b/.test(norm) ? "Sueldo" : "Otros ingresos";

        const palabras = new Set(norm.split(/[^a-z0-9ñ]+/).filter(Boolean));

        for (const [nombre, claves] of CATEGORIAS) {

            if (claves.some((c) => (c.includes(" ") ? norm.includes(c) : palabras.has(c)))) return nombre;

        }

        return "Otros";

    }

    function capitalizar(t) {

        return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;

    }

    function limpiarDescripcion(original, numeroTexto) {

        let d = original
            .replace(numeroTexto, " ")
            .replace(/\bs\/\.?|\bsoles?\b|\bsol\b/gi, " ")
            .replace(/\b(me\s+yapearon|me\s+yape[oó]|me\s+pagaron|me\s+depositaron|me\s+dieron|recib[ií]|cobr[eé])\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim();

        d = d.replace(/^(gast[eé]|compr[eé]|pagu[eé]|pago|gasto|compra)\s+/i, "");

        d = d.replace(/^(?:(?:en|de|por|con|un|una|el|la|los|las)\s+)+/i, "");

        d = d.replace(/(?:\s+(?:en|de|por|con|a))+$/i, "");

        d = d.replace(/^[\s.\-:]+|[\s.\-:]+$/g, "");

        return d;

    }

    function nuevaFilaMov(tipo, categoria, descripcion, monto) {

        db.movimientos.push(['"' + textoFecha() + '"', tipo, categoria, descripcion, monto]);

    }

    // Devuelve cuántos movimientos se registraron
    function interpretar(texto) {

        const partes = String(texto)
            .replace(/(\d),(\d{3})(?!\d)/g, "$1$2")
            .split(/\s*(?:,|;|\n|\sy\s|\se\s)\s*/i)
            .filter((p) => p.trim());

        let creados = 0;

        partes.forEach((parte) => {

            const num = parte.match(/\d+(?:[.,]\d+)?/);

            if (!num) return;

            const monto = parseFloat(num[0].replace(",", "."));

            if (!(monto > 0)) return;

            const norm = sinTildes(parte);

            // Préstamo: "presté 50 a Juan"
            if (/\bprest(e|amo)\b/.test(norm)) {

                const m = parte.match(/\ba\s+([A-Za-zÁÉÍÓÚáéíóúÑñ]+)/);

                const persona = capitalizar(m ? m[1] : "Alguien");

                nuevaFilaMov("Gasto", "Préstamo", "Préstamo a " + persona, monto);

                db.deudas.push([persona, '"' + textoFecha() + '"', monto, "Pendiente"]);

                creados++;

                return;

            }

            // Reembolso: "Juan me pagó 50"
            if (/(devolvi|reembols|me pago)/.test(norm)) {

                const m = parte.match(/^\s*([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+me\b/);

                const persona = capitalizar(m ? m[1] : "Alguien");

                nuevaFilaMov("Ingreso", "Reembolso", persona, monto);

                for (let i = db.deudas.length - 1; i >= 1; i--) {

                    const d = db.deudas[i];

                    if (clave(d[0]) === clave(persona) && Number(d[2]) === monto && clave(d[3]) === "pendiente") {

                        d[3] = "Pagado";

                        break;

                    }

                }

                creados++;

                return;

            }

            const esIngreso = PALABRAS_INGRESO.test(norm);

            let desc = limpiarDescripcion(parte, num[0]);

            if (!desc) desc = /yape/.test(norm) ? "Yape" : (esIngreso ? "Ingreso" : "Gasto");

            desc = capitalizar(desc.slice(0, 100));

            nuevaFilaMov(esIngreso ? "Ingreso" : "Gasto", categoriaDe(sinTildes(desc) + " " + norm, esIngreso), desc, monto);

            creados++;

        });

        return creados;

    }

    // =========================
    // Acciones (mismas reglas que el Apps Script)
    // =========================

    function buscarMov(p) {

        const o = p.orig || {};

        const coincide = (r) => r &&
            String(r[1]).trim() === String(o.tipo || "").trim() &&
            String(r[2]).trim() === String(o.categoria || "").trim() &&
            String(r[3]).trim() === String(o.descripcion || "").trim() &&
            Number(r[4]) === Number(o.monto);

        const fila = Number(p.fila);

        if (fila >= 2 && coincide(db.movimientos[fila - 1])) return fila;

        for (let i = db.movimientos.length - 1; i >= 1; i--) {

            if (coincide(db.movimientos[i])) return i + 1;

        }

        return 0;

    }

    function agregar(p) {

        const tipo = String(p.tipo || "").trim();

        const monto = Number(p.monto);

        const descripcion = seguro(p.descripcion, 100);

        const categoria = seguro(p.categoria, 40) || "Otros";

        if (tipo !== "Gasto" && tipo !== "Ingreso") return fallo("Tipo no válido");

        if (!isFinite(monto) || monto <= 0 || monto > 10000000) return fallo("Monto no válido");

        if (!descripcion.trim()) return fallo("Falta la descripción");

        nuevaFilaMov(tipo, categoria, descripcion, monto);

        return ok();

    }

    function registrar(p) {

        const texto = String(p.mensaje || "").trim().slice(0, 500);

        if (!texto) return fallo("Mensaje vacío");

        const creados = interpretar(texto);

        if (!creados) return fallo("No encontré ningún monto en el mensaje");

        return ok();

    }

    function pagar(p) {

        const persona = String(p.persona || "").trim();

        const monto = Number(p.monto);

        const coincide = (r) => r &&
            String(r[0]).trim() === persona &&
            Number(r[2]) === monto &&
            clave(r[3]) === "pendiente";

        let fila = Number(p.fila);

        if (!(fila >= 2 && coincide(db.deudas[fila - 1]))) {

            fila = 0;

            for (let i = 1; i < db.deudas.length; i++) {

                if (coincide(db.deudas[i])) { fila = i + 1; break; }

            }

        }

        if (!fila) return fallo("Esa deuda ya no está pendiente");

        nuevaFilaMov("Ingreso", "Reembolso", persona, monto);

        db.deudas[fila - 1][3] = "Pagado";

        return ok({ persona, monto });

    }

    function editar(p) {

        const n = p.nuevo || {};

        const tipo = String(n.tipo || "").trim();

        const monto = Number(n.monto);

        const descripcion = seguro(n.descripcion, 100);

        const categoria = seguro(n.categoria, 40) || "Otros";

        if (tipo !== "Gasto" && tipo !== "Ingreso") return fallo("Tipo no válido");

        if (!isFinite(monto) || monto <= 0) return fallo("Monto no válido");

        if (!descripcion.trim()) return fallo("Falta la descripción");

        const fila = buscarMov(p);

        if (!fila) return fallo("Ese movimiento cambió. Recarga la página.");

        const r = db.movimientos[fila - 1];

        r[1] = tipo;
        r[2] = categoria;
        r[3] = descripcion;
        r[4] = monto;

        return ok();

    }

    function ajustarDeudas(tipo, cat, desc, monto) {

        const d = clave(desc);

        const c = clave(cat);

        const m = Number(monto);

        const esPrestamo = tipo === "Gasto" && /pr[eé]stamo/i.test(c + " " + d);

        const esReembolso = tipo === "Ingreso" && /reembolso|devoluci[oó]n/i.test(c + " " + d);

        if (esPrestamo) {

            for (let i = db.deudas.length - 1; i >= 1; i--) {

                const persona = clave(db.deudas[i][0]);

                if (persona && Number(db.deudas[i][2]) === m &&
                    clave(db.deudas[i][3]) === "pendiente" && d.indexOf(persona) !== -1) {

                    db.deudas.splice(i, 1);

                    return "eliminada";

                }

            }

        }

        if (esReembolso) {

            for (let i = db.deudas.length - 1; i >= 1; i--) {

                const persona = clave(db.deudas[i][0]);

                if (persona && Number(db.deudas[i][2]) === m &&
                    clave(db.deudas[i][3]) === "pagado" && d.indexOf(persona) !== -1) {

                    db.deudas[i][3] = "Pendiente";

                    return "reabierta";

                }

            }

        }

        return "";

    }

    function borrar(p) {

        const fila = buscarMov(p);

        if (!fila) return fallo("Ese movimiento cambió. Recarga la página.");

        const r = db.movimientos[fila - 1];

        db.movimientos.splice(fila - 1, 1);

        return ok({ deuda: ajustarDeudas(String(r[1]).trim(), r[2], r[3], r[4]) });

    }

    function presupuesto(p) {

        const categoria = seguro(p.categoria, 40);

        const limite = Number(p.limite);

        if (!categoria.trim()) return fallo("Falta la categoría");

        if (!isFinite(limite) || limite < 0 || limite > 10000000) return fallo("Límite no válido");

        let fila = 0;

        for (let i = 1; i < db.presupuestos.length; i++) {

            if (clave(db.presupuestos[i][0]) === clave(categoria)) { fila = i + 1; break; }

        }

        if (limite === 0) {

            if (fila) db.presupuestos.splice(fila - 1, 1);

        } else if (fila) {

            db.presupuestos[fila - 1][1] = limite;

        } else {

            db.presupuestos.push([categoria, limite]);

        }

        return ok();

    }

    function fijo(p) {

        const nombre = seguro(p.nombre, 60);

        if (!nombre.trim()) return fallo("Falta el nombre");

        let fila = 0;

        for (let i = 1; i < db.fijos.length; i++) {

            if (clave(db.fijos[i][0]) === clave(nombre)) { fila = i + 1; break; }

        }

        if (p.quitar) {

            if (fila) db.fijos.splice(fila - 1, 1);

            return ok();

        }

        const categoria = seguro(p.categoria, 40) || "Otros";

        const monto = Number(p.monto);

        const dia = Number(p.dia);

        if (!isFinite(monto) || monto <= 0 || monto > 10000000) return fallo("Monto no válido");

        if (!Number.isInteger(dia) || dia < 1 || dia > 31) return fallo("El día de cobro debe ser del 1 al 31");

        if (fila) {

            const r = db.fijos[fila - 1];

            r[0] = nombre; r[1] = categoria; r[2] = monto; r[3] = dia;

        } else {

            db.fijos.push([nombre, categoria, monto, dia, ""]);

        }

        return ok();

    }

    function pagarFijo(p) {

        const nombre = clave(p.nombre);

        let fila = 0;

        for (let i = 1; i < db.fijos.length; i++) {

            if (clave(db.fijos[i][0]) === nombre) { fila = i + 1; break; }

        }

        if (!fila) return fallo("Ese gasto fijo ya no existe");

        const r = db.fijos[fila - 1];

        const hoy = new Date();

        const ultimo = fechaDe(r[4]);

        if (ultimo && ultimo.getFullYear() === hoy.getFullYear() && ultimo.getMonth() === hoy.getMonth()) {

            return fallo("Ya lo registraste este mes");

        }

        nuevaFilaMov("Gasto", String(r[1] || "Otros"), String(r[0]), Number(r[2]));

        r[4] = textoFecha(hoy);

        return ok();

    }

    function filaMeta(nombre) {

        for (let i = 1; i < db.metas.length; i++) {

            if (clave(db.metas[i][0]) === clave(nombre)) return i + 1;

        }

        return 0;

    }

    function meta(p) {

        const nombre = seguro(p.nombre, 60);

        if (!nombre.trim()) return fallo("Falta el nombre");

        const fila = filaMeta(nombre);

        if (p.quitar) {

            if (fila) db.metas.splice(fila - 1, 1);

            return ok();

        }

        const objetivo = Number(p.objetivo);

        if (!isFinite(objetivo) || objetivo <= 0 || objetivo > 100000000) return fallo("Objetivo no válido");

        let fecha = "";

        const f = String(p.fecha || "").trim();

        if (f) {

            const m = f.match(/^(\d{4})-(\d{2})-(\d{2})$/);

            if (!m) return fallo("Fecha no válida");

            fecha = m[3] + "/" + m[2] + "/" + m[1];

        }

        if (fila) {

            const r = db.metas[fila - 1];

            r[0] = nombre; r[1] = objetivo; r[3] = fecha;

        } else {

            db.metas.push([nombre, objetivo, 0, fecha]);

        }

        return ok();

    }

    function aporte(p) {

        const monto = Number(p.monto);

        if (!isFinite(monto) || monto === 0 || Math.abs(monto) > 100000000) return fallo("Monto no válido");

        const fila = filaMeta(p.nombre);

        if (!fila) return fallo("Esa meta ya no existe");

        const r = db.metas[fila - 1];

        const nuevo = Math.round(((Number(r[2]) || 0) + monto) * 100) / 100;

        if (nuevo < 0) return fallo("No puedes retirar más de lo que has ahorrado");

        r[2] = nuevo;

        return ok({ ahorrado: nuevo });

    }

    // =========================
    // Asistente de la demo: responde preguntas básicas con tus datos de prueba
    // =========================

    function preguntar(p) {

        const pregunta = String(p.pregunta || "").trim().slice(0, 300);

        if (!pregunta) return fallo("Escribe una pregunta");

        const q = sinTildes(pregunta);

        const hoy = new Date();

        const claveMes = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1);

        const actual = claveMes(hoy);

        const previo = claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));

        const movs = db.movimientos.slice(1)
            .map((f) => ({ fecha: fechaDe(f[0]), tipo: String(f[1]), cat: String(f[2]), desc: String(f[3]), monto: Number(f[4]) || 0 }))
            .filter((m) => m.fecha);

        const esPrest = (m) => m.tipo === "Gasto" && /pr[eé]stamo/i.test(m.cat + " " + m.desc);

        const esReemb = (m) => m.tipo === "Ingreso" && /reembolso|devoluci[oó]n/i.test(m.cat + " " + m.desc);

        const gastosDe = (mes) => movs.filter((m) => m.tipo === "Gasto" && !esPrest(m) && claveMes(m.fecha) === mes);

        const suma = (l) => l.reduce((s, m) => s + m.monto, 0);

        const saldo = suma(movs.filter((m) => m.tipo === "Ingreso")) - suma(movs.filter((m) => m.tipo === "Gasto"));

        const sinDatos = "Todavía no tengo movimientos tuyos. Registra algunos arriba y vuelve a preguntarme.";

        let texto;

        if (/(gaste mas|mayor gasto|en que gaste|donde gaste)/.test(q)) {

            const gastos = gastosDe(actual);

            if (!gastos.length) {

                texto = sinDatos;

            } else {

                const mapa = {};

                gastos.forEach((m) => { mapa[m.cat] = (mapa[m.cat] || 0) + m.monto; });

                const [cat, total] = Object.entries(mapa).sort((a, b) => b[1] - a[1])[0];

                texto = `Tu mayor gasto este mes es **${cat}**: **${soles(total)}**, el ${Math.round(total / suma(gastos) * 100)}% de tus gastos.`;

            }

        } else if (/(mes pasado|comparado|\bvs\b)/.test(q)) {

            const a = suma(gastosDe(actual));

            const b = suma(gastosDe(previo));

            texto = b > 0
                ? `Este mes llevas **${soles(a)}** en gastos y el mes pasado fueron **${soles(b)}**.`
                : `Este mes llevas **${soles(a)}** en gastos. Aún no tengo datos del mes pasado para comparar (en la demo todo se registra con la fecha de hoy).`;

        } else if (/(debe|deben|deuda|prest)/.test(q)) {

            const pend = db.deudas.slice(1).filter((d) => clave(d[3]) === "pendiente");

            texto = pend.length
                ? "Te deben **" + soles(pend.reduce((s, d) => s + Number(d[2]), 0)) + "** en total: " +
                  pend.map((d) => `${d[0]} (${soles(d[2])})`).join(", ") + "."
                : "Nadie te debe plata ahora mismo. 🎉";

        } else if (/presupuesto/.test(q)) {

            const pres = db.presupuestos.slice(1);

            if (!pres.length) {

                texto = "Aún no tienes presupuestos. Crea uno en Estadísticas y te cuento cómo vas.";

            } else {

                const gastos = gastosDe(actual);

                texto = pres.map((f) => {

                    const gastado = suma(gastos.filter((m) => clave(m.cat) === clave(f[0])));

                    const resta = Number(f[1]) - gastado;

                    return `**${f[0]}**: ${soles(gastado)} de ${soles(f[1])} (${resta >= 0 ? "te quedan " + soles(resta) : "te pasaste por " + soles(-resta)})`;

                }).join("\n");

            }

        } else if (/(alcanza|comprar|comprarme)/.test(q)) {

            const m = q.match(/\d+(?:[.,]\d+)?/);

            if (!m) {

                texto = `Tu saldo actual es **${soles(saldo)}**. Dime cuánto cuesta y te digo si te alcanza.`;

            } else {

                const precio = parseFloat(m[0].replace(",", "."));

                texto = saldo >= precio
                    ? `Tu saldo es **${soles(saldo)}**, así que sí te alcanza para **${soles(precio)}**. Ya depende de si lo necesitas de verdad.`
                    : `Tu saldo es **${soles(saldo)}** y eso cuesta **${soles(precio)}**: por ahora no te alcanza.`;

            }

        } else if (/(saldo|cuanto tengo|me queda|plata tengo)/.test(q)) {

            texto = movs.length ? `Tu saldo actual es **${soles(saldo)}**.` : sinDatos;

        } else {

            texto = "En la demo respondo lo básico: tu mayor gasto, tu saldo, quién te debe, tus presupuestos y cómo vas vs el mes pasado. En tu cuenta real respondo con IA cualquier pregunta sobre tus finanzas.";

        }

        return ok({ respuesta: texto });

    }

    // =========================
    // Entrada única: igual que api() pero sin red
    // =========================

    const espera = (ms) => new Promise((res) => setTimeout(res, ms));

    async function llamar(accion, p = {}) {

        await espera(accion === "registrar" || accion === "preguntar" ? 600 : 120);

        switch (accion) {

            case "leer":
                return ok({
                    usuario: { nombre: "Demo", rol: "usuario", pagado: "" },
                    movimientos: clonar(db.movimientos),
                    deudas: clonar(db.deudas),
                    dashboard: [],
                    presupuestos: clonar(db.presupuestos),
                    fijos: clonar(db.fijos),
                    metas: clonar(db.metas)
                });

            case "registrar": return registrar(p);
            case "agregar": return agregar(p);
            case "pagar": return pagar(p);
            case "editar": return editar(p);
            case "borrar": return borrar(p);
            case "presupuesto": return presupuesto(p);
            case "fijo": return fijo(p);
            case "pagarFijo": return pagarFijo(p);
            case "meta": return meta(p);
            case "aporte": return aporte(p);
            case "preguntar": return preguntar(p);

            default: return fallo("Acción desconocida");

        }

    }

    return { reset, llamar, categorias: NOMBRES_CATEGORIAS };

})();
