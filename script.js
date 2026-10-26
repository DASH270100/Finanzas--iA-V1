// Finanzas IA: el código ahora vive en js/ (nucleo, cuenta, inicio, secciones, registro, eventos).
// Este archivo solo existe para quien todavía tenga la página anterior en caché: carga los nuevos en orden.
["nucleo", "cuenta", "inicio", "secciones", "registro", "eventos"].forEach(function (n) {
    document.write('<script src="js/' + n + '.js?v=1"><\/script>');
});
