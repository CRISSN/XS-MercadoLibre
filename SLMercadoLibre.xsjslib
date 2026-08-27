var SLCONEX_BASE = $.import("CONEX.SLCONEX", "SLCONEX");

var TOLERANCIA_TOTAL_DOCUMENTO = 0.01;

function obtenerDocumento(body) {
    if (typeof body !== "string") {
        return body;
    }

    try {
        return JSON.parse(body);
    } catch (e) {
        return null;
    }
}

function convertirNumero(valor) {
    if (typeof valor === "number") {
        return isFinite(valor) ? valor : null;
    }

    if (typeof valor === "string" && valor.trim() !== "") {
        var numero = Number(valor.replace(",", "."));
        return isFinite(numero) ? numero : null;
    }

    return null;
}

function esOrdenMercadoLibre(Objeto, body) {
    var ruta = String(Objeto || "").split("?")[0];
    var partes = ruta.split("/");
    var recurso = partes[partes.length - 1] || partes[partes.length - 2] || "";
    var documento = obtenerDocumento(body);

    return recurso === "Orders" &&
        documento &&
        documento.U_EXX_ECOMMERCE === "ML";
}

function crearRespuestaError(desc, body, datos) {
    datos = datos || {};

    return {
        status: datos.status || 422,
        SAP_Key: null,
        ErrorCode: "TOTAL_DOCUMENTO_ML_INVALIDO",
        Desc: desc,
        DocTotal: datos.totalCalculado === undefined
            ? null
            : datos.totalCalculado,
        TotalEsperado: datos.totalEsperado === undefined
            ? null
            : datos.totalEsperado,
        json: typeof body === "string" ? body : JSON.stringify(body)
    };
}

function previsualizarOrden(objConfig, documento) {
    var respuesta = SLCONEX_BASE.POST(
        objConfig,
        "OrdersService_Preview",
        { Document: documento }
    );

    if (!respuesta || respuesta.status !== 200) {
        return {
            ok: false,
            status: respuesta ? respuesta.status : 422,
            desc: respuesta && respuesta.Desc
                ? "No fue posible validar el total en SAP: " + respuesta.Desc
                : "No fue posible validar el total en SAP"
        };
    }

    if (!respuesta.Data) {
        return {
            ok: false,
            status: 422,
            desc: "El conector CONEX no devolvio el documento previsualizado"
        };
    }

    return {
        ok: true,
        documento: respuesta.Data
    };
}

function normalizarLineasSinDescuento(documento, documentoPreview) {
    var lineas = documento.DocumentLines || [];
    var lineasPreview = documentoPreview.DocumentLines || [];

    for (var i = 0; i < lineas.length; i++) {
        if (convertirNumero(lineas[i].PriceAfterVAT) === null) {
            continue;
        }

        var cantidad = convertirNumero(lineas[i].Quantity);
        var totalNeto = lineasPreview[i]
            ? convertirNumero(lineasPreview[i].LineTotal)
            : null;

        if (cantidad === null || cantidad <= 0 || totalNeto === null) {
            return {
                ok: false,
                desc: "SAP no devolvio los valores necesarios para normalizar la linea " + (i + 1)
            };
        }

        delete lineas[i].PriceAfterVAT;
        delete lineas[i].Price;
        lineas[i].UnitPrice = totalNeto / cantidad;
        lineas[i].DiscountPercent = 0;
    }

    return { ok: true };
}

function crearOrdenMercadoLibre(objConfig, Objeto, body) {
    var documentoOriginal = obtenerDocumento(body);
    if (!documentoOriginal || documentoOriginal.constructor.name !== "Object") {
        return crearRespuestaError(
            "La nota de venta debe enviarse como un objeto JSON",
            body,
            { status: 400 }
        );
    }

    var totalInformado = convertirNumero(documentoOriginal.DocTotal);
    var documento = JSON.parse(JSON.stringify(documentoOriginal));

    delete documento.DocTotal;
    delete documento.DocTotalFc;
    delete documento.DocTotalSys;
    delete documento.TotalDiscount;
    documento.DiscountPercent = 0;

    var lineas = documento.DocumentLines || [];
    for (var i = 0; i < lineas.length; i++) {
        if (convertirNumero(lineas[i].PriceAfterVAT) !== null) {
            // SAP debe calcular el neto efectivo antes de fijar descuento cero.
            delete lineas[i].DiscountPercent;
        }
    }

    var previewInicial = previsualizarOrden(objConfig, documento);
    if (!previewInicial.ok) {
        return crearRespuestaError(previewInicial.desc, body, previewInicial);
    }

    var totalPreviewInicial = convertirNumero(previewInicial.documento.DocTotal);
    if (totalPreviewInicial === null) {
        return crearRespuestaError(
            "SAP no devolvio DocTotal en la primera previsualizacion",
            body
        );
    }

    var totalEsperado = totalInformado === null
        ? totalPreviewInicial
        : totalInformado;

    var normalizacion = normalizarLineasSinDescuento(
        documento,
        previewInicial.documento
    );
    if (!normalizacion.ok) {
        return crearRespuestaError(normalizacion.desc, body);
    }

    var previewFinal = previsualizarOrden(objConfig, documento);
    if (!previewFinal.ok) {
        return crearRespuestaError(previewFinal.desc, body, previewFinal);
    }

    var totalCalculado = convertirNumero(previewFinal.documento.DocTotal);
    if (totalCalculado === null) {
        return crearRespuestaError(
            "SAP no devolvio DocTotal en la previsualizacion final",
            body
        );
    }

    var diferencia = totalEsperado - totalCalculado;
    if (Math.abs(diferencia) > TOLERANCIA_TOTAL_DOCUMENTO) {
        return crearRespuestaError(
            "Nota de venta descuadrada. Total esperado: " + totalEsperado +
                ", total calculado por SAP: " + totalCalculado +
                ", diferencia: " + diferencia,
            body,
            {
                totalEsperado: totalEsperado,
                totalCalculado: totalCalculado
            }
        );
    }

    var respuesta = SLCONEX_BASE.POST(objConfig, Objeto, documento);
    respuesta.TotalEsperado = totalEsperado;
    respuesta.TotalValidado = totalCalculado;

    return respuesta;
}

function LOGIN(objConfig) {
    return SLCONEX_BASE.LOGIN(objConfig);
}

function GET(objConfig, Objeto) {
    return SLCONEX_BASE.GET(objConfig, Objeto);
}

function POST(objConfig, Objeto, body) {
    if (!esOrdenMercadoLibre(Objeto, body)) {
        return SLCONEX_BASE.POST(objConfig, Objeto, body);
    }

    try {
        return crearOrdenMercadoLibre(objConfig, Objeto, body);
    } catch (e) {
        return crearRespuestaError(
            "Error preparando el total de la nota de venta ML: " + e.message,
            body
        );
    }
}

function PATCH(objConfig, Objeto, body) {
    return SLCONEX_BASE.PATCH(objConfig, Objeto, body);
}
