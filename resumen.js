/* =========================================================
   RESUMEN EN PDF: un mes o desde el inicio.
   Usa los mismos cálculos que la pantalla (esGastoReal, esIngresoReal)
   para que los números del PDF coincidan con la app.
   jsPDF se carga solo cuando alguien descarga.
   ========================================================= */
(function () {

    const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";

    let cargando = null;

    function cargarJsPDF() {

        if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();

        if (cargando) return cargando;

        cargando = new Promise((ok, mal) => {

            const s = document.createElement("script");

            s.src = JSPDF_URL;

            s.onload = () => ok();

            s.onerror = () => { cargando = null; mal(new Error("No se pudo cargar el generador de PDF. Revisa tu conexión.")); };

            document.head.appendChild(s);

        });

        return cargando;

    }

    // ---------- Datos ----------

    function mesesConMovimientos() {

        const set = new Set(estado.movimientos.filter((m) => m.fecha).map((m) => claveMes(m.fecha)));

        return [...set].sort().reverse();

    }

    function porCategoria(gastos) {

        const mapa = new Map();

        gastos.forEach((m) => {

            const c = nombreCategoria(m.categoria) || "Otros";

            mapa.set(c, (mapa.get(c) || 0) + m.monto);

        });

        return [...mapa.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);

    }

    function calcular(periodo) {

        const conFecha = estado.movimientos.filter((m) => m.fecha);

        const enPeriodo = periodo === "todo" ? conFecha : conFecha.filter((m) => claveMes(m.fecha) === periodo);

        const gastos = enPeriodo.filter(esGastoReal);

        const ingresos = enPeriodo.filter(esIngresoReal);

        const totalG = sumar(gastos);

        const totalI = sumar(ingresos);

        // Meses del periodo (para "desde el inicio") o el mes y el anterior (para comparar)
        const claves = periodo === "todo" ? mesesConMovimientos().slice().reverse() : [periodo];

        const meses = claves.map((c) => {

            const delMes = conFecha.filter((m) => claveMes(m.fecha) === c);

            const i = sumar(delMes.filter(esIngresoReal)), g = sumar(delMes.filter(esGastoReal));

            return { clave: c, ingresos: i, gastos: g, saldo: i - g };

        });

        let anterior = null;

        if (periodo !== "todo") {

            const [y, mm] = periodo.split("-").map(Number);

            const c = claveMes(new Date(y, mm - 2, 1));

            const delMes = conFecha.filter((m) => claveMes(m.fecha) === c);

            if (delMes.length) anterior = { clave: c, gastos: sumar(delMes.filter(esGastoReal)), ingresos: sumar(delMes.filter(esIngresoReal)) };

        }

        const fechas = enPeriodo.map((m) => m.fecha.getTime());

        return {
            periodo,
            desde: fechas.length ? new Date(Math.min(...fechas)) : null,
            hasta: fechas.length ? new Date(Math.max(...fechas)) : null,
            totalG, totalI,
            saldo: totalI - totalG,
            categorias: porCategoria(gastos),
            top: gastos.slice().sort((a, b) => b.monto - a.monto).slice(0, 5),
            meses,
            anterior,
            cantidad: enPeriodo.length,
            tarjetas: (typeof infoTarjetas === "function" ? infoTarjetas() : []).filter((t) => t.deuda > 0.005 || t.presupuesto > 0),
            teDeben: estado.deudas.filter((d) => d.estado.toLowerCase() === "pendiente"),
            metas: estado.metas || []
        };

    }

    // ---------- Colores ----------

    function rgb(hex, respaldo) {

        const m = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);

        if (!m) return respaldo;

        const n = parseInt(m[1], 16);

        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];

    }

    function acento() {

        const css = getComputedStyle(document.documentElement);

        let c = rgb(css.getPropertyValue("--graf-1"), null) || rgb(css.getPropertyValue("--primary"), [124, 92, 252]);

        // Si el color es muy claro (dorado, pastel), se oscurece para que se lea sobre blanco
        const luz = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

        if (luz > 0.72) c = c.map((v) => Math.round(v * 0.62));

        return c;

    }

    const TINTA = [24, 24, 32];
    const GRIS = [110, 112, 125];
    const LINEA = [228, 229, 236];
    const FONDO = [246, 246, 250];
    const VERDE = [22, 150, 90];
    const ROJO = [214, 64, 69];

    const fmt = (n) => money(n);

    const corto = (t, max) => (t.length > max ? t.slice(0, max - 1) + "…" : t);

    const fechaLarga = (d) => d ? d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }).replace(".", "") : "";

    const mesCorto = (c) => {

        const [y, m] = c.split("-").map(Number);

        return new Date(y, m - 1, 1).toLocaleDateString("es-PE", { month: "short" }).replace(".", "") + " " + String(y).slice(2);

    };

    // jsPDF con Helvetica no tiene emojis: se limpian
    const limpio = (t) => String(t || "").replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();

    // ---------- PDF ----------

    function dibujar(d) {

        const { jsPDF } = window.jspdf;

        const doc = new jsPDF({ unit: "mm", format: "a4" });

        const A = acento();

        const W = 210, M = 16, ANCHO = W - M * 2;

        let y = 0;

        const nombre = (estado.usuario && estado.usuario.nombre) || (modoDemo ? "Demo" : "");

        const color = (c) => doc.setTextColor(c[0], c[1], c[2]);

        const relleno = (c) => doc.setFillColor(c[0], c[1], c[2]);

        const trazo = (c) => doc.setDrawColor(c[0], c[1], c[2]);

        const texto = (t, x, yy, op) => doc.text(String(t), x, yy, op);

        function fuente(tam, peso) { doc.setFont("helvetica", peso || "normal"); doc.setFontSize(tam); }

        function espacio(alto) {

            if (y + alto > 280) { doc.addPage(); y = 20; }

        }

        function titulo(t, sub) {

            espacio(22);

            y += 6;

            fuente(13, "bold"); color(TINTA); texto(t, M, y);

            if (sub) { fuente(9); color(GRIS); texto(sub, W - M, y, { align: "right" }); }

            y += 3;

            trazo(LINEA); doc.setLineWidth(0.3); doc.line(M, y, W - M, y);

            y += 7;

        }

        // --- Cabecera ---
        relleno(A); doc.rect(0, 0, W, 4, "F");

        y = 18;

        fuente(8, "bold"); color(A); doc.setCharSpace(1.2); texto("FINANZAS IA", M, y); doc.setCharSpace(0);

        fuente(8); color(GRIS); texto("Generado el " + fechaLarga(new Date()), W - M, y, { align: "right" });

        y += 11;

        const tituloDoc = d.periodo === "todo" ? "Tu resumen desde el inicio" : "Tu resumen de " + nombreMes(d.periodo).toLowerCase();

        fuente(24, "bold"); color(TINTA); texto(tituloDoc, M, y);

        y += 7;

        fuente(10); color(GRIS);

        const rango = d.desde ? `${fechaLarga(d.desde)} al ${fechaLarga(d.hasta)}` : "Sin movimientos en este periodo";

        texto(limpio([nombre, rango, d.cantidad ? d.cantidad + " movimientos" : ""].filter(Boolean).join("  ·  ")), M, y);

        y += 10;

        // --- Tres números grandes ---
        const tarjetasKPI = [
            { label: "ENTRÓ", valor: fmt(d.totalI), c: VERDE },
            { label: "SALIÓ", valor: fmt(d.totalG), c: ROJO },
            { label: d.saldo >= 0 ? "TE SOBRÓ" : "TE FALTÓ", valor: fmt(Math.abs(d.saldo)), c: d.saldo >= 0 ? A : ROJO }
        ];

        const gap = 4, wk = (ANCHO - gap * 2) / 3;

        tarjetasKPI.forEach((k, i) => {

            const x = M + i * (wk + gap);

            relleno(FONDO); doc.roundedRect(x, y, wk, 24, 3, 3, "F");

            relleno(k.c); doc.rect(x, y + 4, 1.2, 16, "F");

            fuente(7.5, "bold"); color(GRIS); doc.setCharSpace(0.8); texto(k.label, x + 6, y + 8.5); doc.setCharSpace(0);

            fuente(15, "bold"); color(TINTA); texto(k.valor, x + 6, y + 18);

        });

        y += 30;

        // Frase de cierre
        fuente(10); color(TINTA);

        let frase = "";

        if (d.totalI > 0) {

            const pct = Math.round((d.saldo / d.totalI) * 100);

            frase = d.saldo >= 0
                ? `Guardaste el ${pct}% de lo que entró.`
                : `Gastaste ${fmt(-d.saldo)} más de lo que entró.`;

        } else if (d.totalG > 0) {

            frase = "En este periodo no registraste ingresos.";

        }

        if (d.anterior && d.anterior.gastos > 0) {

            const dif = Math.round(((d.totalG - d.anterior.gastos) / d.anterior.gastos) * 100);

            const enCurso = d.periodo === claveMes(new Date());

            frase += ` ${enCurso ? "Por ahora llevas" : "Gastaste"} ${Math.abs(dif)}% ${dif >= 0 ? "más" : "menos"} que en ${nombreMes(d.anterior.clave).toLowerCase()} (${fmt(d.anterior.gastos)})${enCurso ? ", y el mes aún no termina" : ""}.`;

        }

        if (frase) { doc.text(doc.splitTextToSize(frase, ANCHO), M, y); y += 10; }

        // --- Categorías ---
        if (d.categorias.length) {

            titulo("En qué se fue tu plata", "Gastos por categoría");

            let lista = d.categorias;

            if (lista.length > 9) {

                const resto = lista.slice(8).reduce((s, c) => s + c.total, 0);

                lista = lista.slice(0, 8).concat([{ nombre: "Otras categorías", total: resto }]);

            }

            const max = lista[0].total || 1;

            const wNombre = 46, wMonto = 28, wPct = 12;

            const wBarra = ANCHO - wNombre - wMonto - wPct - 6;

            lista.forEach((c, i) => {

                espacio(9);

                fuente(9.5); color(TINTA); texto(corto(limpio(c.nombre), 26), M, y);

                relleno(FONDO); doc.roundedRect(M + wNombre, y - 3.4, wBarra, 4.2, 2, 2, "F");

                const w = Math.max(2.5, wBarra * (c.total / max));

                const tono = i === 0 ? A : A.map((v) => Math.round(v + (255 - v) * Math.min(0.55, i * 0.09)));

                relleno(tono); doc.roundedRect(M + wNombre, y - 3.4, w, 4.2, 2, 2, "F");

                fuente(9.5, "bold"); color(TINTA); texto(fmt(c.total), M + wNombre + wBarra + 4 + wMonto, y, { align: "right" });

                fuente(8.5); color(GRIS); texto(Math.round((c.total / d.totalG) * 100) + "%", W - M, y, { align: "right" });

                y += 8;

            });

        }

        // --- Mes a mes (solo desde el inicio) ---
        if (d.periodo === "todo" && d.meses.length) {

            const ult = d.meses.slice(-12);

            titulo("Mes a mes", d.meses.length > 12 ? "Últimos 12 meses" : "");

            // Gráfico de barras: ingresos vs gastos
            espacio(52);

            const alto = 36, base = y + alto;

            const max = Math.max(1, ...ult.map((m) => Math.max(m.ingresos, m.gastos)));

            const paso = ANCHO / ult.length, wb = Math.min(5.5, paso / 3.2);

            trazo(LINEA); doc.setLineWidth(0.2); doc.line(M, base, W - M, base);

            ult.forEach((m, i) => {

                const cx = M + paso * i + paso / 2;

                const hi = alto * (m.ingresos / max), hg = alto * (m.gastos / max);

                relleno(VERDE); if (hi > 0) doc.roundedRect(cx - wb - 0.6, base - hi, wb, hi, 1, 1, "F");

                relleno(ROJO); if (hg > 0) doc.roundedRect(cx + 0.6, base - hg, wb, hg, 1, 1, "F");

                fuente(7); color(GRIS); texto(mesCorto(m.clave), cx, base + 4.5, { align: "center" });

            });

            y = base + 10;

            fuente(8); relleno(VERDE); doc.rect(M, y - 2.6, 3, 3, "F"); color(GRIS); texto("Ingresos", M + 5, y);

            relleno(ROJO); doc.rect(M + 26, y - 2.6, 3, 3, "F"); texto("Gastos", M + 31, y);

            y += 8;

            // Tabla
            const cols = [M, M + 62, M + 102, W - M];

            const fila = (vals, negrita, fondo) => {

                espacio(8);

                if (fondo) { relleno(FONDO); doc.rect(M, y - 4.6, ANCHO, 7, "F"); }

                fuente(9, negrita ? "bold" : "normal");

                vals.forEach((v, i) => {

                    if (i === 3 && !negrita) color(String(v).startsWith("-") ? ROJO : VERDE); else color(i === 0 || negrita ? TINTA : GRIS);

                    texto(v, i === 0 ? cols[0] + 2 : cols[i] - (i === 3 ? 2 : 0), y, i === 0 ? {} : { align: "right" });

                });

                y += 7;

            };

            fila(["Mes", "Entró", "Salió", "Resultado"], true, true);

            d.meses.slice().reverse().forEach((m) =>
                fila([nombreMes(m.clave), fmt(m.ingresos), fmt(m.gastos), (m.saldo < 0 ? "-" : "+") + fmt(Math.abs(m.saldo))]));

            fila(["Total", fmt(d.totalI), fmt(d.totalG), (d.saldo < 0 ? "-" : "+") + fmt(Math.abs(d.saldo))], true, true);

        }

        // --- Gastos más grandes ---
        if (d.top.length) {

            titulo("Tus gastos más grandes");

            d.top.forEach((m) => {

                espacio(8);

                fuente(9.5); color(TINTA); texto(corto(limpio(m.descripcion || m.categoria), 44), M, y);

                fuente(8.5); color(GRIS); texto(corto(limpio(m.categoria), 22) + "  ·  " + fechaLarga(m.fecha), M + 96, y);

                fuente(9.5, "bold"); color(TINTA); texto(fmt(m.monto), W - M, y, { align: "right" });

                y += 7.5;

            });

        }

        // --- Situación actual: tarjetas, te deben, metas ---
        const hayActual = d.tarjetas.length || d.teDeben.length || d.metas.length;

        if (hayActual) titulo("Cómo estás hoy", "Al " + fechaLarga(new Date()));

        if (d.tarjetas.length) {

            espacio(10);

            fuente(10, "bold"); color(TINTA); texto("Tarjetas de crédito", M, y); y += 7;

            d.tarjetas.forEach((t) => {

                espacio(8);

                fuente(9.5); color(TINTA); texto(corto(limpio(t.nombre), 30), M, y);

                fuente(9); color(GRIS);

                const lim = t.presupuesto > 0 ? ` de ${fmt(t.presupuesto)} (${Math.round((t.deuda / t.presupuesto) * 100)}%)` : "";

                texto("Debes " + fmt(t.deuda) + lim + (t.pagoFecha ? "  ·  pagas el " + fechaLarga(t.pagoFecha) : ""), W - M, y, { align: "right" });

                y += 7;

            });

            y += 2;

        }

        if (d.teDeben.length) {

            espacio(10);

            const total = d.teDeben.reduce((s, x) => s + x.monto, 0);

            fuente(10, "bold"); color(TINTA); texto("Te deben", M, y);

            fuente(9, "bold"); color(VERDE); texto(fmt(total), W - M, y, { align: "right" }); y += 7;

            d.teDeben.slice(0, 10).forEach((x) => {

                espacio(7);

                fuente(9.5); color(TINTA); texto(corto(limpio(x.persona), 34), M, y);

                fuente(9); color(GRIS); texto(fmt(x.monto) + (x.fechaTexto ? "  ·  desde " + x.fechaTexto : ""), W - M, y, { align: "right" });

                y += 6.5;

            });

            y += 2;

        }

        if (d.metas.length) {

            espacio(10);

            fuente(10, "bold"); color(TINTA); texto("Metas de ahorro", M, y); y += 7;

            d.metas.forEach((m) => {

                espacio(10);

                const pct = Math.min(1, m.ahorrado / m.objetivo);

                fuente(9.5); color(TINTA); texto(corto(limpio(m.nombre), 30), M, y);

                fuente(9); color(GRIS); texto(`${fmt(m.ahorrado)} de ${fmt(m.objetivo)}  ·  ${Math.round(pct * 100)}%`, W - M, y, { align: "right" });

                y += 2.5;

                relleno(FONDO); doc.roundedRect(M, y, ANCHO, 2.4, 1.2, 1.2, "F");

                if (pct > 0) { relleno(A); doc.roundedRect(M, y, Math.max(2.4, ANCHO * pct), 2.4, 1.2, 1.2, "F"); }

                y += 8;

            });

        }

        if (!d.cantidad && !hayActual) {

            fuente(11); color(GRIS); texto("No hay movimientos en este periodo todavía.", M, y + 6);

        }

        // --- Pie de página en todas las hojas ---
        const total = doc.getNumberOfPages();

        for (let p = 1; p <= total; p++) {

            doc.setPage(p);

            trazo(LINEA); doc.setLineWidth(0.2); doc.line(M, 286, W - M, 286);

            fuente(7.5); color(GRIS);

            texto("Finanzas IA" + (modoDemo ? "  ·  datos de demostración" : ""), M, 290.5);

            texto(`${p} / ${total}`, W - M, 290.5, { align: "right" });

        }

        return doc;

    }

    // ---------- Ventana para elegir ----------

    function abrir() {

        const sel = $("resumenPeriodo");

        const meses = mesesConMovimientos();

        if (!meses.length) { mostrarToast("📄 Aún no hay movimientos para resumir"); return; }

        const elegido = estado.mes && estado.mes !== "all" ? estado.mes : meses[0];

        sel.innerHTML = `<option value="todo">Desde el inicio</option>` +
            meses.map((c) => `<option value="${c}"${c === elegido ? " selected" : ""}>${nombreMes(c)}</option>`).join("");

        $("resumenError").textContent = "";

        $("resumenOverlay").hidden = false;

        cargarJsPDF().catch(() => {}); // se va adelantando mientras eligen

    }

    function cerrar() { $("resumenOverlay").hidden = true; }

    async function descargarPDF() {

        const boton = $("resumenPDF");

        const periodo = $("resumenPeriodo").value;

        boton.disabled = true;

        boton.textContent = "⏳ Preparando...";

        try {

            await cargarJsPDF();

            const doc = dibujar(calcular(periodo));

            doc.save(`finanzas-ia-${periodo === "todo" ? "desde-el-inicio" : periodo}.pdf`);

            cerrar();

            mostrarToast("📄 Resumen descargado");

        } catch (e) {

            console.error(e);

            $("resumenError").textContent = e && e.message ? e.message : "No se pudo crear el PDF";

        } finally {

            boton.disabled = false;

            boton.textContent = "📄 Descargar PDF";

        }

    }

    // Todos los movimientos del periodo en CSV (se abre en Excel o Google Sheets)
    function descargarCSV() {

        const periodo = $("resumenPeriodo").value;

        const movs = estado.movimientos
            .filter((m) => m.fecha && (periodo === "todo" || claveMes(m.fecha) === periodo))
            .sort((a, b) => a.fecha - b.fecha);

        const celda = (v) => {

            let t = String(v == null ? "" : v);

            if (/^[=+\-@]/.test(t)) t = "'" + t;

            return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;

        };

        const dd = (d) => String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();

        const filas = [["Fecha", "Tipo", "Categoría", "Descripción", "Monto", "Tarjeta"]]
            .concat(movs.map((m) => [dd(m.fecha), m.tipo, m.categoria, m.descripcion, String(m.monto.toFixed(2)).replace(".", ","), m.medio || ""]));

        // Punto y coma + BOM: así Excel en español lo abre bien, con tildes
        const csv = "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n");

        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));

        const a = document.createElement("a");

        a.href = url;

        a.download = `finanzas-ia-movimientos-${periodo === "todo" ? "todos" : periodo}.csv`;

        document.body.appendChild(a);

        a.click();

        a.remove();

        setTimeout(() => URL.revokeObjectURL(url), 4000);

        mostrarToast(`📊 ${movs.length} movimientos descargados`);

    }

    function iniciar() {

        if (!$("btnResumen")) return;

        $("btnResumen").addEventListener("click", abrir);

        $("resumenCerrar").addEventListener("click", cerrar);

        $("resumenPDF").addEventListener("click", descargarPDF);

        $("resumenCSV").addEventListener("click", descargarCSV);

        $("resumenOverlay").addEventListener("click", (e) => { if (e.target === $("resumenOverlay")) cerrar(); });

        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("resumenOverlay").hidden) cerrar(); });

    }

    window.resumenPDF = { calcular, dibujar, cargarJsPDF };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

})();
