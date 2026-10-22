/* Finanzas IA · service worker
   Solo sirve para las notificaciones: no guarda la app en caché.
   El aviso llega vacío; aquí se pide el texto al Apps Script con la clave de este celular. */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function leerConfig() {

    try {

        const c = await caches.open("fia-push");

        const r = await c.match("cfg");

        return r ? await r.json() : null;

    } catch (e) { return null; }

}

async function guardarConfig(cfg) {

    try { const c = await caches.open("fia-push"); await c.put("cfg", new Response(JSON.stringify(cfg))); } catch (e) {}

}

self.addEventListener("push", (e) => {

    e.waitUntil((async () => {

        let avisos = [];

        const cfg = await leerConfig();

        if (cfg && cfg.api && cfg.clave) {

            try {

                const r = await fetch(cfg.api, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({ accion: "avisoPush", clave: cfg.clave, desde: cfg.desde || 0 })
                });

                const d = await r.json();

                if (d && d.ok && Array.isArray(d.avisos)) avisos = d.avisos;

                if (avisos.length) {

                    cfg.desde = Math.max(...avisos.map((a) => a.t || 0));

                    await guardarConfig(cfg);

                }

            } catch (err) {}

        }

        // Siempre hay que mostrar algo (el iPhone lo exige)
        if (!avisos.length) avisos = [{ titulo: "Finanzas IA", cuerpo: "Llegó algo nuevo a tu buzón", url: "./#buzon" }];

        await Promise.all(avisos.map((a) => self.registration.showNotification(a.titulo || "Finanzas IA", {
            body: a.cuerpo || "",
            icon: "icono-192.png",
            badge: "icono-192.png",
            tag: "fia-" + (a.t || Date.now()),
            data: { url: a.url || "./#buzon" }
        })));

    })());

});

self.addEventListener("notificationclick", (e) => {

    e.notification.close();

    const url = new URL((e.notification.data && e.notification.data.url) || "./#buzon", self.registration.scope).href;

    e.waitUntil((async () => {

        const lista = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

        for (const c of lista) {

            if ("focus" in c) {

                await c.focus();

                c.postMessage({ tipo: "abrirBuzon" });

                return;

            }

        }

        await self.clients.openWindow(url);

    })());

});
