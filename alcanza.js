/* =========================================================
   ¿ME ALCANZA? Simula una compra antes de hacerla.
   Usa tus datos reales del mes: lo que entró, lo que salió,
   fijos y cuotas que faltan, ingresos fijos por cobrar y tu
   ritmo normal de gasto hasta fin de mes.
   ========================================================= */
(function () {

    const MS = 86400000;

    let modo = "contado";

    let ultimo = null; // última simulación (para "Registrar la compra")

    const r2 = (n) => Math.round(n * 100) / 100;

    const sinTildes = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

    // ---------- Cuánto te queda libre este mes ----------

    function situacionDelMes() {

        const hoy = new Date();

        const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

        const mes = claveMes(hoy);

        const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();

        const diasRestantes = diasMes - hoy.getDate();

        const delMes = estado.movimientos.filter((m) => m.fecha && claveMes(m.fecha) === mes);

        const ingresosMes = sumar(delMes.filter(esIngresoReal));

        const gastosMes = sumar(delMes.filter(esGastoReal));

        // Fijos que todavía no se registraron este mes
        const fijos = (estado.fijos || []).map((f) => ({ ...f, info: infoFijo(f) }))
            .filter((f) => f.info.estado !== "hecho" && f.info.estado !== "terminado");

        const pendientesPagar = fijos.filter((f) => f.tipo === "Gasto" || f.tipo === "Cuota");

        const pendientesCobrar = fijos.filter((f) => f.tipo === "Ingreso");

        const porPagar = pendientesPagar.reduce((s, f) => s + f.monto, 0);

        const porCobrar = pendientesCobrar.reduce((s, f) => s + f.monto, 0);

        // Ritmo normal de gasto (últimos 30 días), sin contar los fijos para no duplicarlos
        const nombresFijos = new Set((estado.fijos || []).map((f) => sinTildes(f.nombre)));

        const desde = new Date(h0.getTime() - 30 * MS);

        const variables = estado.movimientos.filter((m) => m.fecha && m.fecha >= desde && m.fecha <= hoy && esGastoReal(m) &&
            !nombresFijos.has(sinTildes(m.descripcion)) && !nombresFijos.has(sinTildes(m.categoria)));

        // Si llevas pocos días usando la app, se divide entre los días que sí hay datos
        const primera = estado.movimientos.filter((m) => m.fecha).reduce((a, m) => (!a || m.fecha < a ? m.fecha : a), null);

        const diasConDatos = primera ? Math.min(30, Math.max(1, Math.round((h0 - primera) / MS) + 1)) : 30;

        const diarioVariable = sumar(variables) / diasConDatos;

        const variableRestante = diarioVariable * diasRestantes;

        const libre = ingresosMes + porCobrar - gastosMes - porPagar - variableRestante;

        // Lo que te suele sobrar al mes (últimos 3 meses cerrados con datos)
        const cerrados = [1, 2, 3].map((k) => claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - k, 1)))
            .map((c) => {
                const ms = estado.movimientos.filter((m) => m.fecha && claveMes(m.fecha) === c);
                return ms.length ? sumar(ms.filter(esIngresoReal)) - sumar(ms.filter(esGastoReal)) : null;
            })
            .filter((v) => v !== null);

        const sobranteTipico = cerrados.length ? cerrados.reduce((a, b) => a + b, 0) / cerrados.length : null;

        const colchon = Math.max(100, 0.1 * (ingresosMes + porCobrar));

        return {
            hoy, diasRestantes, ingresosMes, gastosMes, porPagar, porCobrar, pendientesPagar, pendientesCobrar,
            diarioVariable, variableRestante, libre, sobranteTipico, colchon, mesesCerrados: cerrados.length
        };

    }

    // ---------- Simulación ----------

    function cuotaDe(precio, n, tea) {

        const i = tasaMensual(tea || 0);

        const cuota = i > 0 ? precio * i / (1 - Math.pow(1 + i, -n)) : precio / n;

        return { cuota: r2(cuota), total: r2(cuota * n), intereses: r2(cuota * n - precio), i };

    }

    function simular(p) {

        const s = situacionDelMes();

        const tarjetas = typeof infoTarjetas === "function" ? infoTarjetas() : [];

        const tarjeta = p.tarjeta ? tarjetas.find((t) => claveTarjeta(t.nombre) === claveTarjeta(p.tarjeta)) : null;

        const disponibleTarjeta = tarjeta && tarjeta.presupuesto > 0 ? r2(tarjeta.presupuesto - tarjeta.deuda) : null;

        const res = { ...p, s, tarjetaInfo: tarjeta, disponibleTarjeta };

        if (p.modo === "cuotas") {

            const c = cuotaDe(p.precio, p.n, p.tea);

            Object.assign(res, c);

            res.quedaEsteMes = r2(s.libre - c.cuota);

            res.quedaMesTipico = s.sobranteTipico !== null ? r2(s.sobranteTipico - c.cuota) : null;

            const base = res.quedaMesTipico !== null ? Math.min(res.quedaEsteMes, res.quedaMesTipico) : res.quedaEsteMes;

            res.veredicto = base >= s.colchon ? "ok" : base >= 0 ? "justo" : "no";

            res.contadoAlcanza = s.libre - p.precio >= 0;

        } else {

            res.queda = r2(s.libre - p.precio);

            res.veredicto = res.queda >= s.colchon ? "ok" : res.queda >= 0 ? "justo" : "no";

            if (res.veredicto === "no") {

                const falta = p.precio - Math.max(0, s.libre);

                if (s.sobranteTipico && s.sobranteTipico > 0) {

                    res.meses = Math.max(1, Math.ceil(falta / s.sobranteTipico));

                    const f = new Date(s.hoy.getFullYear(), s.hoy.getMonth() + res.meses, 1);

                    res.cuando = nombreMes(claveMes(f)).toLowerCase();

                }

                res.falta = r2(falta);

            }

        }

        // Si la tarjeta no tiene límite suficiente, la compra no pasa aunque el mes sí alcance
        if (disponibleTarjeta !== null && p.precio > disponibleTarjeta + 0.005) { res.sinLimite = true; res.veredicto = "no"; }

        // Para dimensionar: cuántos días de tu gasto normal es esto
        res.dias = s.diarioVariable > 0 ? Math.round(p.precio / s.diarioVariable) : null;

        // Y cuánto representa de tu meta más cercana a cumplirse
        const metas = (estado.metas || []).filter((m) => m.objetivo > m.ahorrado);

        if (metas.length) {

            const m = metas.slice().sort((a, b) => (a.objetivo - a.ahorrado) - (b.objetivo - b.ahorrado))[0];

            res.meta = { nombre: m.nombre, falta: r2(m.objetivo - m.ahorrado), pct: Math.round((p.precio / (m.objetivo - m.ahorrado)) * 100) };

        }

        return res;

    }

    // ---------- Pantalla ----------

    const ICONO = { ok: "circle-dollar-sign", justo: "lightbulb", no: "lock" };

    function titular(r) {

        const que = r.que ? esc(r.que) : "esta compra";

        if (r.sinLimite) return `Tu ${esc(r.tarjetaInfo.nombre)} no tiene límite suficiente`;

        if (r.modo === "cuotas") {

            if (r.veredicto === "ok") return `Te alcanza pagar ${que} en ${r.n} cuotas`;

            if (r.veredicto === "justo") return `Te alcanza, pero va justo`;

            return `Las cuotas te aprietan demasiado`;

        }

        if (r.veredicto === "ok") return `Sí te alcanza para ${que}`;

        if (r.veredicto === "justo") return `Te alcanza, pero quedas muy justo`;

        return `Este mes no te alcanza`;

    }

    function subtitulo(r) {

        const s = r.s;

        if (r.sinLimite) return `Te quedan ${money(Math.max(0, r.disponibleTarjeta))} disponibles y la compra es de ${money(r.precio)}. Paga parte de la deuda primero o usa otro medio de pago.`;

        if (r.modo === "cuotas") {

            const partes = [`Pagarías ${money(r.cuota)} al mes durante ${r.n} meses.`];

            if (r.quedaMesTipico !== null) partes.push(`Normalmente te sobran ${money(Math.max(0, s.sobranteTipico))} al mes; con la cuota te quedarían ${money(r.quedaMesTipico)}.`);

            else partes.push(`Este mes te quedarían ${money(r.quedaEsteMes)} libres después de la primera cuota.`);

            return partes.join(" ");

        }

        if (r.veredicto === "ok") return `A fin de mes te quedarían unos ${money(r.queda)} libres.`;

        if (r.veredicto === "justo") return `Te quedarían solo ${money(r.queda)} para cualquier imprevisto hasta fin de mes.`;

        let t = `Te faltarían unos ${money(r.falta)} este mes.`;

        if (r.meses) t += ` Con lo que te suele sobrar (${money(s.sobranteTipico)} al mes), la tendrías en ${r.meses === 1 ? "1 mes" : r.meses + " meses"}, para ${r.cuando}.`;

        else if (s.sobranteTipico !== null && s.sobranteTipico <= 0) t += " Ahora mismo no te está sobrando plata al mes: antes de esta compra conviene revisar gastos.";

        return t;

    }

    function filas(r) {

        const s = r.s;

        const f = (label, valor, clase) => `<div class="alc-fila ${clase || ""}"><span>${label}</span><b>${valor}</b></div>`;

        let h = f("Entró este mes", money(s.ingresosMes));

        if (s.porCobrar > 0) h += f(`Por cobrar (${s.pendientesCobrar.map((x) => esc(x.nombre)).join(", ")})`, "+ " + money(s.porCobrar));

        h += f("Salió este mes", "− " + money(s.gastosMes));

        if (s.porPagar > 0) h += f(`Fijos y cuotas que faltan (${s.pendientesPagar.length})`, "− " + money(s.porPagar));

        if (s.variableRestante > 0) h += f(`Tu gasto normal hasta fin de mes (${s.diasRestantes} días × ${money(s.diarioVariable)})`, "− " + money(s.variableRestante));

        h += f("Te quedaría libre sin la compra", money(s.libre), "alc-sub");

        if (r.modo === "cuotas") {

            h += f(`Primera cuota`, "− " + money(r.cuota));

            h += f("Te quedaría este mes", money(r.quedaEsteMes), "alc-total " + (r.quedaEsteMes < 0 ? "neg" : ""));

        } else {

            h += f(r.que ? esc(r.que) : "La compra", "− " + money(r.precio));

            h += f("Te quedaría a fin de mes", money(r.queda), "alc-total " + (r.queda < 0 ? "neg" : ""));

        }

        return h;

    }

    function bloqueCuotas(r) {

        if (r.modo !== "cuotas") return "";

        const sinInteres = !(r.tea > 0);

        let consejo;

        if (sinInteres) consejo = "Sin intereses, las cuotas solo reparten el pago. Conviene si pagas el total de la tarjeta cada mes; si no, igual te cobran intereses.";

        else if (r.sinLimite) consejo = `Además, en ${r.n} cuotas pagarías ${money(r.intereses)} de intereses. Si puedes, junta la plata y cómpralo al contado.`;

        else if (r.contadoAlcanza) consejo = `Te alcanza al contado: pagando de una te ahorras ${money(r.intereses)} de intereses.`;

        else consejo = `Al contado no te alcanza este mes. En cuotas sí, pero pagas ${money(r.intereses)} extra: otra opción es ahorrar unas semanas y comprarlo al contado.`;

        return `
            <div class="alc-compara">
                <div><span>Al contado</span><b>${money(r.precio)}</b></div>
                <div><span>${r.n} cuotas de ${money(r.cuota)}</span><b>${money(r.total)}</b>${r.intereses > 0.005 ? `<small>+ ${money(r.intereses)} de intereses${r.tea > 0 ? ` (TEA ${r.tea}%)` : ""}</small>` : "<small>sin intereses</small>"}</div>
            </div>
            <p class="alc-consejo">${ico("lightbulb")} ${consejo}</p>`;

    }

    function extras(r) {

        const items = [];

        if (!r.sinLimite && r.tarjetaInfo && r.tarjetaInfo.presupuesto > 0) {

            const pct = Math.round(((r.tarjetaInfo.deuda + r.precio) / r.tarjetaInfo.presupuesto) * 100);

            if (pct >= 80) items.push(`<li class="alc-alerta">${ico("credit-card")} Con esta compra tu ${esc(r.tarjetaInfo.nombre)} quedaría al ${pct}% de su límite.</li>`);

        }

        if (r.dias) items.push(`<li>${ico("calendar-days")} Es como ${r.dias === 1 ? "1 día" : r.dias + " días"} de tus gastos normales.</li>`);

        if (r.meta && r.meta.pct > 0) items.push(r.meta.pct >= 100
            ? `<li>${ico("piggy-bank")} Con esa plata completarías tu meta «${esc(r.meta.nombre)}» (te faltan ${money(r.meta.falta)}).</li>`
            : `<li>${ico("piggy-bank")} Equivale al ${r.meta.pct}% de lo que te falta para «${esc(r.meta.nombre)}».</li>`);

        if (r.s.mesesCerrados === 0) items.push(`<li>${ico("lightbulb")} Aún tienes poco historial: mientras más registres, más precisa será la cuenta.</li>`);

        return items.length ? `<ul class="alc-extras">${items.join("")}</ul>` : "";

    }

    function pintar(r) {

        ultimo = r;

        $("alcanzaResultado").innerHTML = `
            <div class="alc-veredicto ${r.veredicto}">
                <span class="alc-ico">${ico(ICONO[r.veredicto])}</span>
                <div>
                    <strong>${titular(r)}</strong>
                    <p>${subtitulo(r)}</p>
                </div>
            </div>

            ${bloqueCuotas(r)}

            ${extras(r)}

            <details class="alc-detalle">
                <summary>¿Cómo lo calculé?</summary>
                <div class="alc-filas">${filas(r)}</div>
            </details>

            <div class="alc-acciones">
                <button class="mov-btn" type="button" data-alc="registrar">${ico("receipt")} La compré: registrarla</button>
                <button class="mov-btn" type="button" data-alc="limpiar">Simular otra cosa</button>
            </div>`;

        $("alcanzaResultado").scrollIntoView({ behavior: "smooth", block: "nearest" });

    }

    // ---------- Formulario ----------

    function llenarTarjetas() {

        const sel = $("alcTarjeta");

        const actual = sel.value;

        const tarjetas = typeof infoTarjetas === "function" ? infoTarjetas() : [];

        sel.innerHTML = `<option value="">Efectivo, Yape o débito</option>` +
            tarjetas.map((t) => `<option value="${esc(t.nombre)}">Tarjeta ${esc(t.nombre)}${t.presupuesto > 0 ? ` · disponible ${money(Math.max(0, t.presupuesto - t.deuda))}` : ""}</option>`).join("");

        if ([...sel.options].some((o) => o.value === actual)) sel.value = actual;

    }

    function elegirModo(m) {

        modo = m;

        document.querySelectorAll(".alc-modo-btn").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.modo === m)));

        document.querySelector(".alc-cuotas-campos").hidden = m !== "cuotas";

    }

    function calcular(e) {

        if (e) e.preventDefault();

        const precio = Number($("alcPrecio").value);

        if (!(precio > 0)) { mostrarToast("Escribe el precio"); $("alcPrecio").focus(); return; }

        const tea = $("alcTea").value === "" ? 0 : Number($("alcTea").value);

        pintar(simular({
            que: $("alcQue").value.trim(),
            precio,
            modo,
            n: Number($("alcCuotas").value) || 6,
            tea: tea > 0 ? tea : 0,
            tarjeta: $("alcTarjeta").value
        }));

    }

    // «¿me alcanza para unas zapatillas de 450?» escrito en la barra de registro
    function desdeLaBarra(texto) {

        const t = String(texto || "").trim();

        if (!/^[¿\s]*(me\s+)?alcanza/i.test(sinTildes(t))) return false;

        const num = (t.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(",", "."))).filter((x) => x > 0);

        let que = t.replace(/[¿?]/g, "").replace(/^\s*(me\s+)?alcanza\s*(para)?\s*/i, "")
            .replace(/\d+(?:[.,]\d+)?/g, " ").replace(/\b(s\/|soles?|de|a|en|unos?|unas?|el|la|los|las)\b\.?/gi, " ")
            .replace(/\s+/g, " ").trim();

        const cuotas = t.match(/(\d+)\s*cuotas?/i);

        mostrarVista("fijos");

        llenarTarjetas();

        $("alcQue").value = que ? que.charAt(0).toUpperCase() + que.slice(1) : "";

        const precio = cuotas ? num.find((x) => x !== Number(cuotas[1])) : Math.max(...num, 0);

        $("alcPrecio").value = precio > 0 ? precio : "";

        if (cuotas) { elegirModo("cuotas"); $("alcCuotas").value = [...$("alcCuotas").options].some((o) => o.value === cuotas[1]) ? cuotas[1] : "6"; }

        else elegirModo("contado");

        $("mensaje").value = "";

        setTimeout(() => {

            $("alcanzaCard").scrollIntoView({ behavior: "smooth", block: "start" });

            if (precio > 0) calcular(); else $("alcPrecio").focus();

        }, 120);

        return true;

    }

    function registrarCompra() {

        if (!ultimo) return;

        const partes = [ultimo.que || "Compra", String(ultimo.precio)];

        if (ultimo.tarjeta) partes.push("con la " + ultimo.tarjeta);

        mostrarVista("dashboard");

        $("mensaje").value = partes.join(" ");

        $("mensaje").focus();

        mostrarToast("Revisa el texto y toca registrar ✍️");

    }

    function iniciar() {

        if (!$("alcanzaForm")) return;

        $("alcanzaForm").addEventListener("submit", calcular);

        document.querySelectorAll(".alc-modo-btn").forEach((b) => b.addEventListener("click", () => elegirModo(b.dataset.modo)));

        $("alcanzaResultado").addEventListener("click", (e) => {

            const b = e.target.closest("[data-alc]");

            if (!b) return;

            if (b.dataset.alc === "registrar") registrarCompra();

            else { $("alcanzaResultado").innerHTML = ""; $("alcanzaForm").reset(); elegirModo("contado"); $("alcQue").focus(); }

        });

        // Las tarjetas se cargan después de los datos: se refresca al abrir Planificar
        $("alcTarjeta").addEventListener("focus", llenarTarjetas);

        document.addEventListener("click", (e) => { if (e.target.closest('nav a[data-vista="fijos"]')) setTimeout(llenarTarjetas, 50); });

        llenarTarjetas();

    }

    window.meAlcanza = { simular, situacionDelMes, cuotaDe, desdeLaBarra, llenarTarjetas };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

})();
