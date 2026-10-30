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

    const clave = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

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
            fijos: [["Nombre", "Categoría", "Monto", "Día", "Último registro", "Tipo", "Cuotas", "Pagadas", "TEA %", "Saldo", "Capital"]],
            metas: [["Nombre", "Objetivo", "Ahorrado", "Fecha límite"]],
            tarjetas: [["Tarjeta", "Presupuesto", "Día de pago"]],
            porCobrar: [["ID", "Cliente", "Trabajo", "Monto", "Fecha de cobro", "Estado", "Cobrado el", "Creado"]],
            compartido: compartidoInicial()
        };

    }

    // =========================
    // CUENTA COMPARTIDA de ejemplo: la demo ya viene con Ana y algunos gastos del mes
    // =========================

    function compartidoInicial() {

        const hoy = new Date();

        const dia = (n) => { const d = new Date(hoy.getFullYear(), hoy.getMonth(), Math.max(1, hoy.getDate() - n)); return textoFecha(d); };

        const g = (id, n, categoria, descripcion, yo, ana) => ({ id, fecha: dia(n), categoria, descripcion, total: Math.round((yo + ana) * 100) / 100, registro: yo >= ana ? "demo" : "ana", aportes: { demo: yo, ana } });

        return {
            activo: {
                id: "cdemo", nombre: "Demo y Ana", yo: "demo",
                miembros: [{ usuario: "demo", nombre: "Demo" }, { usuario: "ana", nombre: "Ana" }],
                gastos: [
                    g("g1", 9, "Casa", "Alquiler", 700, 500),
                    g("g2", 6, "Súper", "Súper del mes", 180, 140),
                    g("g3", 4, "Servicios", "Luz y agua", 0, 96),
                    g("g4", 2, "Salidas", "Cine y cena", 60, 60),
                    g("g5", 0, "Súper", "Frutas y pan", 38.5, 0)
                ]
            },
            recibidas: [],
            enviada: null
        };

    }

    // Dividir una cuenta: tu parte es gasto, la de cada amigo queda como préstamo pendiente
    function dividir(p) {

        const total = Math.round(Number(p.total) * 100) / 100;

        const personas = (p.personas || []).map((x) => seguro(x, 40)).filter(Boolean);

        if (!seguro(p.descripcion, 60)) return fallo("Escribe en qué fue (ej: Cena del viernes)");

        if (!(total > 0)) return fallo("Escribe el total de la cuenta");

        if (!personas.length) return fallo("Escribe con quién la dividiste");

        const partes = personas.length + (p.incluirme !== false ? 1 : 0);

        const base = Math.floor(total / partes * 100) / 100;

        const mia = p.incluirme !== false ? Math.round((total - base * personas.length) * 100) / 100 : 0;

        const desc = seguro(p.descripcion, 60);

        if (mia > 0) nuevaFilaMov("Gasto", "Salidas", desc + " (mi parte)", mia, "");

        personas.forEach((n) => {

            nuevaFilaMov("Gasto", "Préstamo", "Préstamo a " + n + " · " + desc, base, "");

            db.deudas.push([n, '"' + textoFecha() + '"', base, "Pendiente", desc]);

        });

        return ok({ porPersona: base, miParte: mia, personas: personas.length });

    }

    function categoria(p) {

        const de = String(p.de || "").trim(), a = seguro(p.a, 40);

        if (!a) return fallo("Escribe el nombre nuevo");

        let n = 0;

        db.movimientos.forEach((r, i) => { if (i && clave(r[2]) === clave(de)) { r[2] = a; n++; } });

        db.fijos.forEach((r, i) => { if (i && clave(r[1]) === clave(de)) r[1] = a; });

        db.presupuestos.forEach((r, i) => { if (i && clave(r[0]) === clave(de)) r[0] = a; });

        return ok({ cambiados: n });

    }

    function compartido(p) {

        const a = db.compartido.activo;

        if (!a) return fallo("En la demo la cuenta compartida ya viene creada. Recarga para volver a verla.");

        const r2 = (x) => Math.round(Number(x) * 100) / 100;

        const cuadrar = (total, aportes) => {
            const ap = {}; let suma = 0; const faltan = [];
            a.miembros.forEach((m) => { const v = aportes && aportes[m.usuario] !== undefined && aportes[m.usuario] !== "" ? r2(aportes[m.usuario]) : null; if (v === null) faltan.push(m.usuario); else { ap[m.usuario] = v; suma = r2(suma + v); } });
            if (Object.values(ap).some((v) => !(v >= 0))) return { error: "Revisa los montos de cada uno" };
            total = r2(total); if (!(total > 0)) total = suma;
            if (!(total > 0)) return { error: "Escribe cuánto fue el total" };
            if (suma === 0 && faltan.length === a.miembros.length) { a.miembros.forEach((m) => { ap[m.usuario] = m.usuario === a.yo ? total : 0; }); return { total, aportes: ap }; }
            const resto = r2(total - suma);
            if (resto < -0.009) return { error: `Los aportes suman ${soles(suma)}, más que el total (${soles(total)})` };
            if (faltan.length === 1) ap[faltan[0]] = Math.max(0, resto);
            else if (Math.abs(resto) > 0.009) return { error: `Los aportes suman ${soles(suma)} y el total es ${soles(total)}` };
            return { total, aportes: ap };
        };

        const guardar = (g, id) => {
            const c = cuadrar(Number(g.total), g.aportes);
            if (c.error) return c;
            const descripcion = seguro(g.descripcion, 100);
            if (!descripcion) return { error: "Escribe en qué fue el gasto" };
            const iso = String(g.fecha || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
            const fecha = iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : (fechaDe(g.fecha) ? textoFecha(fechaDe(g.fecha)) : textoFecha());
            const cat = seguro(g.categoria, 40) || categoriaDe(sinTildes(descripcion), false);
            if (id) {
                const x = a.gastos.find((y) => y.id === id);
                if (!x) return { error: "Ese gasto ya no existe" };
                Object.assign(x, { fecha, categoria: cat, descripcion, total: c.total, aportes: c.aportes });
                return { id };
            }
            const nuevo = { id: "g" + Date.now() + Math.floor(Math.random() * 1000), fecha, categoria: cat, descripcion, total: c.total, registro: a.yo, aportes: c.aportes };
            a.gastos.push(nuevo);
            return { id: nuevo.id };
        };

        if (p.op === "gasto") { const r = guardar(p, p.id); return r.error ? fallo(r.error) : ok({ id: r.id }); }

        if (p.op === "borrar") { a.gastos = a.gastos.filter((g) => g.id !== p.id); return ok(); }

        if (p.op === "salir") return fallo("En la demo no se puede dejar de compartir 🙂");

        if (p.op === "texto") {
            // Mensajes simples: "súper 120, yo 80 ana 40", "pollo 64 a medias", "cena 90 la pagó ana"
            let t = " " + sinTildes(p.mensaje).replace(/s\/\.?\s*/g, "").replace(/,/g, " ").replace(/\s+/g, " ") + " ";
            const aportes = {};
            let iguales = false, pagoTodo = null;
            t = t.replace(/\s(a medias|mitad y mitad|entre los dos)\s/g, () => { iguales = true; return " "; });
            [["yo", "demo"], ["demo", "demo"], ["ana", "ana"]].forEach(([k, u]) => {
                t = t.replace(new RegExp("\\s" + k + "\\s+(?:puso|puse|pone|dio)?\\s*(\\d+(?:\\.\\d{1,2})?)\\s", "g"), (m0, n) => { aportes[u] = (aportes[u] || 0) + Number(n); return " "; });
            });
            t = t.replace(/\s(?:lo|la)?\s*pag(?:o|ue)\s+(yo|ana)\s/, (m0, k) => { pagoTodo = k === "ana" ? "ana" : "demo"; return " "; });
            const nums = t.match(/\d+(?:\.\d{1,2})?/g) || [];
            if (nums.length > 1) return fallo("En la demo escribe un gasto a la vez, por ejemplo: súper 120, yo 80 Ana 40");
            const total = nums.length ? Number(nums[0]) : 0;
            let desc = t.replace(/\d+(?:\.\d{1,2})?/g, " ").replace(/\b(compartido|compartida)\b/g, " ").replace(/\s+/g, " ").trim();
            if (!desc || (!total && !Object.keys(aportes).length)) return fallo("No encontré el monto. Prueba: súper 120, yo 80 Ana 40");
            if (pagoTodo && total) { aportes.demo = pagoTodo === "demo" ? total : 0; aportes.ana = pagoTodo === "ana" ? total : 0; }
            else if (iguales && total && !Object.keys(aportes).length) { aportes.demo = r2(total / 2); aportes.ana = r2(total - aportes.demo); }
            const orig = String(p.mensaje).split(/[\s,]+/);
            desc = desc.split(" ").map((w) => orig.find((o) => sinTildes(o) === w) || w).join(" ");
            const r = guardar({ descripcion: desc.charAt(0).toUpperCase() + desc.slice(1), total, aportes, fecha: "" }, "");
            return r.error ? fallo(r.error) : ok({ ids: [r.id] });
        }

        return fallo("Acción desconocida");

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

        if (esIngreso) {

            if (/\b(sueldo|salario|quincena|planilla)\b|me pagaron|me depositaron/.test(norm)) return "Sueldo";

            if (/\b(freelance|freelancer|proyecto|logo|diseno|cliente|chamba|comision)\b/.test(norm)) return "Freelance";

            if (/\b(venta|ventas|vendi)\b/.test(norm)) return "Ventas";

            return "Otros ingresos";

        }

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

    function nuevaFilaMov(tipo, categoria, descripcion, monto, medio) {

        db.movimientos.push(['"' + textoFecha() + '"', tipo, categoria, descripcion, monto, "", "Completado", medio || ""]);

        if (medio) asegurarTarjeta(medio);

    }

    function asegurarTarjeta(nombre) {

        if (!db.tarjetas.slice(1).some((t) => clave(t[0]) === clave(nombre))) db.tarjetas.push([String(nombre).trim(), 0, ""]);

    }

    // "con la BCP" / "con tarjeta Visa" / "pagué la tarjeta BCP 450"
    function tarjetaDe(parte) {

        const conocida = db.tarjetas.slice(1).map((t) => String(t[0])).find((n) => new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(parte));

        if (conocida) return conocida;

        const m = parte.match(/\bcon\s+(?:la\s+|mi\s+)?(?:tarjeta\s+)?(bcp|bbva|interbank|scotiabank|visa|mastercard|amex|diners|falabella|cmr|ripley)\b/i) ||
            parte.match(/\btarjeta\s+(?:de\s+cr[eé]dito\s+)?([A-Za-z0-9]{2,20})/i);

        if (!m) return "";

        return m[1].length <= 4 ? m[1].toUpperCase() : capitalizar(m[1].toLowerCase());

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

            // Pago de la tarjeta: no es un gasto nuevo
            // "pagué LA tarjeta / mi BBVA" sí; "pagué 99 CON la tarjeta" es una compra
            if (/\b(pague|pago|abone|abono)\s+(?:\d+(?:[.,]\d+)?\s+)?(?:a\s+)?(la|mi|el)\s+(tarjeta|visa|mastercard|bcp|bbva|interbank|scotiabank|amex|diners|cmr|ripley)\b/.test(norm)) {

                const t = tarjetaDe(parte);

                if (t) {

                    nuevaFilaMov("Gasto", "Pago de tarjeta", "Pago tarjeta " + t, monto, t);

                    creados++;

                    return;

                }

            }

            const medio = tarjetaDe(parte);

            const esIngreso = PALABRAS_INGRESO.test(norm);

            let desc = limpiarDescripcion(medio ? parte.replace(/\s*(?:con|en)?\s*(?:la\s+|mi\s+)?(?:tarjeta\s+(?:de\s+cr[eé]dito\s+)?)?(?:BCP|BBVA|Interbank|Scotiabank|Visa|Mastercard|Amex|Diners|Falabella|CMR|Ripley)\b/i, " ").replace(medio, " ") : parte, num[0]);

            if (medio && /^pagu[eé]$/i.test(String(desc || "").trim())) desc = "Compra con " + medio;

            if (!desc) desc = /yape/.test(norm) ? "Yape" : (esIngreso ? "Ingreso" : "Gasto");

            desc = capitalizar(desc.slice(0, 100));

            nuevaFilaMov(esIngreso ? "Ingreso" : "Gasto", categoriaDe(sinTildes(desc) + " " + norm, esIngreso), desc, monto, esIngreso ? "" : medio);

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

        nuevaFilaMov(tipo, categoria, descripcion, monto, tipo === "Gasto" ? seguro(p.medio, 40) : "");

        return ok();

    }

    // Modo freelance: trabajos por cobrar
    function hoyTexto() {

        const d = new Date();

        return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();

    }

    function filaCobro(id) {

        for (let i = 1; i < db.porCobrar.length; i++) if (db.porCobrar[i][0] === id) return i;

        return 0;

    }

    function porCobrar(p) {

        const i = p.id ? filaCobro(p.id) : 0;

        if (p.quitar) { if (i) db.porCobrar.splice(i, 1); return ok(); }

        const cliente = seguro(p.cliente, 50), trabajo = seguro(p.trabajo, 70), monto = Math.round(Number(p.monto) * 100) / 100;

        if (!cliente.trim()) return fallo("Escribe el cliente");

        if (!isFinite(monto) || monto <= 0) return fallo("Monto no válido");

        const f = String(p.fecha || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

        const fecha = f ? f[3] + "/" + f[2] + "/" + f[1] : "";

        if (i) { db.porCobrar[i][1] = cliente; db.porCobrar[i][2] = trabajo; db.porCobrar[i][3] = monto; db.porCobrar[i][4] = fecha; return ok({ id: p.id }); }

        const id = "C" + Date.now().toString(36).toUpperCase();

        db.porCobrar.push([id, cliente, trabajo, monto, fecha, "Pendiente", "", hoyTexto()]);

        return ok({ id });

    }

    function cobrar(p) {

        const i = filaCobro(p.id);

        if (!i) return fallo("No encontré ese trabajo");

        const r = db.porCobrar[i];

        if (r[5] === "Cobrado") return fallo("Ese trabajo ya está cobrado");

        const monto = p.monto === undefined || p.monto === "" ? r[3] : Math.round(Number(p.monto) * 100) / 100;

        if (!(monto > 0) || monto > r[3] + 0.005) return fallo("Monto no válido");

        nuevaFilaMov("Ingreso", "Freelance", (r[2] ? r[2] + " · " : "") + r[1], monto, "");

        const resta = Math.round((r[3] - monto) * 100) / 100;

        if (resta <= 0.005) { r[5] = "Cobrado"; r[6] = hoyTexto(); } else r[3] = resta;

        return ok({ resta: Math.max(0, resta) });

    }

    function tarjeta(p) {

        const nombre = seguro(p.nombre, 40);

        if (!nombre.trim()) return fallo("Falta el nombre de la tarjeta");

        let fila = 0;

        for (let i = 1; i < db.tarjetas.length; i++) {

            if (clave(db.tarjetas[i][0]) === clave(nombre)) { fila = i + 1; break; }

        }

        if (p.quitar) {

            // Igual que el backend: se van todas las filas de esa tarjeta, también las duplicadas
            db.tarjetas = db.tarjetas.filter((t, i) => i === 0 || clave(t[0]) !== clave(nombre));

            return ok();

        }

        const presupuesto = Number(p.presupuesto);

        if (!isFinite(presupuesto) || presupuesto < 0 || presupuesto > 10000000) return fallo("Presupuesto no válido");

        const trae = p.dia !== undefined && p.dia !== null && p.dia !== "";

        let dia = fila ? (db.tarjetas[fila - 1][2] || "") : "";

        if (trae) {

            const d = Number(p.dia);

            if (!Number.isInteger(d) || d < 0 || d > 31) return fallo("El día de pago debe ser del 1 al 31");

            dia = d === 0 ? "" : d;

        }

        if (fila) db.tarjetas[fila - 1] = [nombre, presupuesto, dia];

        else db.tarjetas.push([nombre, presupuesto, dia]);

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

    // Matemática de préstamos (cuota fija; TEA en %)
    const tasaMensual = (tea) => tea > 0 ? Math.pow(1 + tea / 100, 1 / 12) - 1 : 0;

    const principalCuotas = (c, n, i) => i > 0 ? c * (1 - Math.pow(1 + i, -n)) / i : c * n;

    const saldoTrasCuotas = (P, c, i, k) => i > 0 ? P * Math.pow(1 + i, k) - c * (Math.pow(1 + i, k) - 1) / i : P - c * k;

    function cuotasQueFaltan(B, c, i) {

        if (B <= 0.005) return 0;

        if (i <= 0) return Math.ceil(B / c - 1e-9);

        if (B * i >= c) return 600;

        return Math.min(600, Math.ceil(-Math.log(1 - B * i / c) / Math.log(1 + i) - 1e-9));

    }

    const tipoFijo = (v) => { const t = String(v || "").trim(); return t === "Ingreso" ? "Ingreso" : (t === "Cuota" ? "Cuota" : "Gasto"); };

    const tipoDeFila = (r) => tipoFijo(r[5]);

    function filaFijo(nombre, tipo) {

        for (let i = 1; i < db.fijos.length; i++) {

            if (clave(db.fijos[i][0]) === clave(nombre) && tipoDeFila(db.fijos[i]) === tipo) return i + 1;

        }

        return 0;

    }

    function fijo(p) {

        const nombre = seguro(p.nombre, 60);

        if (!nombre.trim()) return fallo("Falta el nombre");

        const tipo = tipoFijo(p.tipo);

        const fila = filaFijo(nombre, tipo);

        if (p.quitar) {

            if (fila) db.fijos.splice(fila - 1, 1);

            return ok();

        }

        const categoria = tipo === "Cuota" ? "Cuotas" : (seguro(p.categoria, 40) || (tipo === "Ingreso" ? "Sueldo" : "Otros"));

        const monto = Number(p.monto);

        const dia = Number(p.dia);

        if (!isFinite(monto) || monto <= 0 || monto > 10000000) return fallo("Monto no válido");

        if (!Number.isInteger(dia) || dia < 1 || dia > 31) return fallo("El día de cobro debe ser del 1 al 31");

        let cuotas = 0, pagadas = 0, tea = 0, saldo = "", capital = "";

        if (tipo === "Cuota") {

            cuotas = Number(p.cuotas);

            pagadas = Number(p.pagadas || 0);

            if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 600) return fallo("El total de cuotas debe ser de 1 a 600");

            if (!Number.isInteger(pagadas) || pagadas < 0 || pagadas > cuotas) return fallo("Las cuotas pagadas no pueden pasar del total");

            tea = Number(p.tea || 0);

            if (!isFinite(tea) || tea < 0 || tea > 500) return fallo("La tasa (TEA) debe estar entre 0 y 500");

            const im = tasaMensual(tea);

            const P = principalCuotas(monto, cuotas, im);

            capital = Math.round(P * 100) / 100;

            saldo = pagadas >= cuotas ? 0 : Math.max(0, Math.round(saldoTrasCuotas(P, monto, im, pagadas) * 100) / 100);

        }

        if (fila) {

            const r = db.fijos[fila - 1];

            r[0] = nombre; r[1] = categoria; r[2] = monto; r[3] = dia;

            if (tipo === "Cuota") { r[6] = cuotas; r[7] = pagadas; r[8] = tea > 0 ? tea : ""; r[9] = saldo; r[10] = capital; }

        } else {

            db.fijos.push([nombre, categoria, monto, dia, "", tipo === "Gasto" ? "" : tipo, tipo === "Cuota" ? cuotas : "", tipo === "Cuota" ? pagadas : "", tipo === "Cuota" && tea > 0 ? tea : "", tipo === "Cuota" ? saldo : "", tipo === "Cuota" ? capital : ""]);

        }

        return ok();

    }

    function pagarFijo(p) {

        const tipo = tipoFijo(p.tipo);

        const fila = filaFijo(p.nombre, tipo);

        if (!fila) return fallo("Ese fijo ya no existe");

        const r = db.fijos[fila - 1];

        const hoy = new Date();

        const ultimo = fechaDe(r[4]);

        if (ultimo && ultimo.getFullYear() === hoy.getFullYear() && ultimo.getMonth() === hoy.getMonth()) {

            return fallo(tipo === "Cuota" ? "Ya pagaste la cuota de este mes" : "Ya lo registraste este mes");

        }

        if (tipo === "Cuota") {

            const total = Number(r[6]) || 0, antes = Number(r[7]) || 0;

            if (total > 0 && antes >= total) return fallo("Ya terminaste de pagar este préstamo");

            const c = Number(r[2]);

            const im = tasaMensual(Number(r[8]) || 0);

            const B = (r[9] === "" || r[9] == null) ? Math.max(0, total - antes) * c : Number(r[9]);

            const debe = im > 0 ? B * (1 + im) : B;

            let nuevo = Math.max(0, im > 0 ? B * (1 + im) - c : B - c);

            if (nuevo < 0.005) nuevo = 0;

            nuevaFilaMov("Gasto", "Cuotas", "Cuota " + String(r[0]), Math.round(Math.min(c, debe) * 100) / 100);

            r[6] = antes + 1 + cuotasQueFaltan(nuevo, c, im);

            r[7] = antes + 1;

            r[9] = Math.round(nuevo * 100) / 100;

        } else {

            nuevaFilaMov(tipo, String(r[1] || (tipo === "Ingreso" ? "Sueldo" : "Otros")), String(r[0]), Number(r[2]));

        }

        r[4] = textoFecha(hoy);

        return ok();

    }

    function adelantarCuota(p) {

        const fila = filaFijo(p.nombre, "Cuota");

        if (!fila) return fallo("Ese préstamo ya no existe");

        const monto = Math.round(Number(p.monto) * 100) / 100;

        if (!isFinite(monto) || monto <= 0 || monto > 10000000) return fallo("Monto no válido");

        const r = db.fijos[fila - 1];

        const c = Number(r[2]), total = Number(r[6]) || 0, pagadas = Number(r[7]) || 0;

        const im = tasaMensual(Number(r[8]) || 0);

        const B = (r[9] === "" || r[9] == null) ? Math.max(0, total - pagadas) * c : Number(r[9]);

        if (B <= 0.005) return fallo("Ya terminaste de pagar este préstamo");

        if (monto > B + 0.005) return fallo("Solo te faltan S/ " + B.toFixed(2) + " de capital. Pon un monto menor.");

        let nuevo = Math.round((B - monto) * 100) / 100;

        if (nuevo < 0.005) nuevo = 0;

        nuevaFilaMov("Gasto", "Cuotas", "Adelanto " + String(r[0]), monto);

        r[6] = pagadas + cuotasQueFaltan(nuevo, c, im);

        r[9] = nuevo;

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
                    metas: clonar(db.metas),
                    tarjetas: clonar(db.tarjetas),
                    porCobrar: clonar(db.porCobrar),
                    compartido: clonar(db.compartido),
                    ciclo: db.ciclo ? { inicio: db.ciclo } : null
                });

            case "ciclo": {
                const limpiar = () => db.movimientos.forEach((r, i) => { if (i > 0) r[8] = ""; });
                if (p.quitar) { limpiar(); db.ciclo = null; return ok({ ciclo: null }); }
                let fila = 0;
                if (p.monto != null && p.monto !== "") {
                    const monto = Number(p.monto);
                    if (!(monto > 0)) return fallo("Escribe cuánto te pagaron");
                    nuevaFilaMov("Ingreso", "Sueldo", "Sueldo", monto, "");
                    fila = db.movimientos.length;
                } else {
                    fila = Number(p.fila);
                    const r = db.movimientos[fila - 1];
                    if (!r || String(r[1]).toLowerCase() !== "ingreso") return fallo("Elige un ingreso");
                }
                limpiar();
                db.movimientos[fila - 1][8] = "inicio";
                db.ciclo = String(db.movimientos[fila - 1][0]).replace(/"/g, "");
                return ok({ ciclo: { inicio: db.ciclo } });
            }

            case "registrar": return registrar(p);
            case "agregar": return agregar(p);
            case "pagar": return pagar(p);
            case "editar": return editar(p);
            case "borrar": return borrar(p);
            case "presupuesto": return presupuesto(p);
            case "fijo": return fijo(p);
            case "pagarFijo": return pagarFijo(p);
            case "adelantarCuota": return adelantarCuota(p);
            case "tarjeta": return tarjeta(p);
            case "porCobrar": return porCobrar(p);
            case "cobrar": return cobrar(p);
            case "meta": return meta(p);
            case "aporte": return aporte(p);
            case "preguntar": return preguntar(p);
            case "compartido": return compartido(p);
            case "dividir": return dividir(p);
            case "categoria": return categoria(p);
            case "pedirBorrado": return fallo("En la demo no hay cuenta que borrar 🙂");

            default: return fallo("Acción desconocida");

        }

    }

    return { reset, llamar, categorias: NOMBRES_CATEGORIAS };

})();
