var DBCONEX = $.import("CONEX", "DBCONEX");
var Config = $.import("MercadoLibre", "AppConfig");
var LogicaMercadoLibre =$.import("MercadoLibre.Logica", "Logica");
var SLCONEX=$.import("CONEX.SLCONEX", "SLCONEX");
var UTIL = $.import("CONEX.UTIL", "UTIL");
//Metodo para actualizar precios y stock de un articulo
/* Variables Globales */
var companies = Config.appConfig.companies;
/* Variables Globales */
//GIT
// CREAR ORDENES --------------------------------------------------------------------
function CrearOrdenesV3(parametrosML, CantidadProceso) {
    try {

        // 2. ÓRDENES DESDE LOG_ECOMMERCE
        var ordersData;
        
            ordersData = LogicaMercadoLibre.SelectOrdersEcommerce({
                OBJ_BASE: "OrdenML",
                ESTADO: 0
            },CantidadProceso);
        

        var resultados = [];

        if (!ordersData || !ordersData.rows || ordersData.rows.length === 0) {
            return [{
                estado: "SIN_ORDENES",
                mensaje: "No se encontraron órdenes pendientes"
            }];
        }

        // 3. TIPO DOCUMENTO SAP
        var tipoDocSAP = ObtenerTipoDocSAP(parametrosML);
        
        if (tipoDocSAP === null) {
            return [{
                estado: "SIN_TIPO",
                mensaje: "No se definió tipo de documento SAP"
            }];
        }

        // 4. PROCESAR ÓRDENES
        for (var i = 0; i < ordersData.rows.length; i++) {

            var row = ordersData.rows[i];
            var order = null;

            try {
                order = JSON.parse(row.DOC_BASE);
            } catch (eParse) {
                LogicaMercadoLibre.UpdateOrders(row.ID_KEY, {
                    ESTADO: 9,
                    MENSAJE: "DOC_BASE inválido o vacío: " + (eParse.message || String(eParse)),
                    OBJ_ERROR: "DOC_BASE"
                });

                resultados.push({
                    order_id: row.ID_KEY,
                    estado: "ERROR",
                    mensaje: "DOC_BASE inválido o vacío",
                    sap_docEntry: null
                });

                continue;
            }

            // Variables de control FINAL
            var estadoFinal = 1; // asumimos OK
            var mensajeFinal = "Proceso completado correctamente";
            var jsonFinal = null;
            var sapDocEntry = null;
            var objeto = null;
            var DOC_ERROR= null;
            var OBJ_ERROR= 0;
            var ObjIni= tipoDocSAP;
            

            try {
                // -------- VALIDAR EXISTENCIA EN SAP --------
                var existe = LogicaMercadoLibre.ValidaDoc(
                    order.id,
                    DBCONEX,
                    companies[0].CompanyDB,
                    tipoDocSAP
                );

                if (existe !== 0) {
                    estadoFinal = 2;
                    mensajeFinal = "Documento ya existe en SAP";
                    throw new Error(mensajeFinal);
                }

                // -------- CREAR DOCUMENTO SAP --------
                var resp = LogicaMercadoLibre.CrearDocSAP(
                    parametrosML,
                    order,
                    SLCONEX,
                    tipoDocSAP
                );

                if (!resp ||
                    resp.estado === "ERROR" ||
                    !resp.SAP_Key ||
                    resp.SAP_Key <= 0
                ) 
                {
                    estadoFinal = 9;
                    mensajeFinal = "Error creando documento SAP: " + (resp ? resp.Desc : "Sin respuesta");
                    DOC_ERROR = resp ? resp.json : null; 
                    OBJ_ERROR = resp.Objeto ; 
                    // CORTA EL FLUJO AQUÍ
                    throw new Error(mensajeFinal);
                }
                

                sapDocEntry = resp.SAP_Key;

                // -------- FACTURA DESDE OV --------
                var respFactura = null;
                if (tipoDocSAP === 17 && parametrosML.docFactura === '1') {
                    respFactura = LogicaMercadoLibre.CrearFacturaSAP(
                        parametrosML,
                        order,
                        SLCONEX,
                        resp
                    );

                    if (!respFactura || respFactura.SAP_Key <= 0) {
                        estadoFinal = 9;
                        mensajeFinal = "Error creando factura SAP:"+ (respFactura ? respFactura.Desc : "Sin respuesta");
                        DOC_ERROR = respFactura ? respFactura.json : null;
                        OBJ_ERROR = '13' ;
                        sapDocEntry: null ;
                        throw new Error(mensajeFinal);
                    }
                }

                // -------- CREAR PAGO --------
                if (
                    (tipoDocSAP === 13 && parametrosML.docPago === '1') ||
                    (tipoDocSAP === 17 && parametrosML.docFactura === '1' && parametrosML.docPago === '1')
                ) {

                    var DocFactura = (tipoDocSAP === 13) ? resp : respFactura;

                    var pago = LogicaMercadoLibre.CrearPagoSAP(
                        parametrosML,
                        order,
                        SLCONEX,
                        DocFactura
                    );

                    if (!pago || pago.SAP_Key <= 0|| !pago.SAP_Key) {
                        estadoFinal = 9;
                        mensajeFinal = "Error creando pago SAP:"+ (pago ? pago.Desc + " :" + pago.message : "Sin respuesta");
                        DOC_ERROR = pago ? pago.json : null;
                        OBJ_ERROR = 24 ;
                        sapDocEntry: null ;
                        throw new Error(mensajeFinal);
                       
                    }
                    
                }

                // 👉 Si llega aquí, TODO fue OK
                jsonFinal = resp.json;

            } catch (eProceso) {

                if (!mensajeFinal) {
                    mensajeFinal = eProceso.message || "Error no controlado";
                }

                if (!jsonFinal) {
                    jsonFinal = {
                        error: eProceso.message || String(eProceso)
                    };
                }
            }

            // 🔥 ACTUALIZACIÓN FINAL ÚNICA
            LogicaMercadoLibre.UpdateOrders(order.id, {
                ESTADO: estadoFinal,
                MENSAJE: mensajeFinal,
                ID_KEYSAP: sapDocEntry,
                DOC_ERROR: DOC_ERROR ? DOC_ERROR : null,
                OBJ_ERROR : OBJ_ERROR  ? OBJ_ERROR : null
            });

            resultados.push({
                order_id: order.id,
                estado: estadoFinal === 1 ? "OK" : "ERROR",
                mensaje: mensajeFinal,
                sap_docEntry: sapDocEntry
            });
        }

        return resultados;

    } catch (e) {
        $.trace.error("JOB CrearOrdenesV3 Error: " + e.message);
        throw e;
    }
}
function CrearOrdenesV3_LOCAL(parametrosML, Data) {
    try {

        if (!Data || !Array.isArray(Data) || Data.length === 0) {
            return [{
                estado: "SIN_ORDENES",
                mensaje: "No se recibió data para procesar"
            }];
        }

        var resultados = [];

        // 🔑 TIPO DOCUMENTO SAP
        var tipoDocSAP = ObtenerTipoDocSAP(parametrosML);
        if (tipoDocSAP === null) {
            return [{
                estado: "SIN_TIPO",
                mensaje: "No se definió tipo de documento SAP"
            }];
        }

        // 🔁 PROCESO NORMAL (MISMA LÓGICA)
        for (var i = 0; i < Data.length; i++) {

            var row = Data[i];
            var order = typeof row.DOC_BASE === "string"
                ? JSON.parse(row.DOC_BASE)
                : row.DOC_BASE;

            var estadoFinal = 1;
            var mensajeFinal = "Proceso completado correctamente";
            var sapDocEntry = null;
            var DOC_ERROR = null;
            var OBJ_ERROR = 0;

            try {

                // VALIDAR EXISTENCIA
                var existe = LogicaMercadoLibre.ValidaDoc(
                    order.id,
                    DBCONEX,
                    companies[0].CompanyDB,
                    tipoDocSAP
                );

                if (existe !== 0) {
                    estadoFinal = 2;
                    mensajeFinal = "Documento ya existe en SAP";
                    throw new Error(mensajeFinal);
                }

                // CREAR DOCUMENTO
                var resp = LogicaMercadoLibre.CrearDocSAP(
                    parametrosML,
                    order,
                    SLCONEX,
                    tipoDocSAP
                );

                if (!resp || resp.estado === "ERROR" || !resp.SAP_Key) {
                    estadoFinal = 9;
                    mensajeFinal = "Error creando documento SAP : " +
                                   (resp ? resp.Desc : "Sin respuesta");
                    DOC_ERROR = resp ? resp.json : null;
                    OBJ_ERROR = tipoDocSAP;
                    throw new Error(mensajeFinal);
                }

                sapDocEntry = resp.SAP_Key;

                // FACTURA
                var respFactura = null;
                if (tipoDocSAP === 17 && parametrosML.docFactura === '1') {

                    respFactura = LogicaMercadoLibre.CrearFacturaSAP(
                        parametrosML,
                        order,
                        SLCONEX,
                        resp
                    );

                    if (
                        !respFactura 
                        || respFactura instanceof Error 
                        || typeof respFactura.SAP_Key === "undefined" 
                        || respFactura.SAP_Key <= 0)  
                    
                    {
                        estadoFinal = 9;
                        mensajeFinal = "Error creando factura SAP: " + 
                            (respFactura && respFactura.message ? respFactura.message : "respuesta inválida o SAP_Key <= 0");
                        DOC_ERROR = respFactura ? respFactura.json : null;
                        OBJ_ERROR = 13;
                        throw new Error(mensajeFinal);
                    }
                }

                // PAGO
                if (
                    (tipoDocSAP === 13 && parametrosML.docPago === '1') ||
                    (tipoDocSAP === 17 && parametrosML.docFactura === '1' && parametrosML.docPago === '1')
                ) {

                    var DocFactura = (tipoDocSAP === 13) ? resp : respFactura;

                    var pago = LogicaMercadoLibre.CrearPagoSAP(
                        parametrosML,
                        order,
                        SLCONEX,
                        DocFactura
                    );

                    if (!pago || pago.SAP_Key <= 0|| !pago.SAP_Key) {
                        estadoFinal = 9;
                        mensajeFinal = "Error creando pago SAP" + pago.Desc + " :" + pago.message;
                        DOC_ERROR = pago ? pago.json : null;
                        OBJ_ERROR = 24;
                        throw new Error(mensajeFinal);
                    }
                }

            } catch (eProceso) {
                if (!mensajeFinal) {
                    mensajeFinal = eProceso.message;
                }
            }

            // 🔥 UPDATE LOG
            LogicaMercadoLibre.UpdateOrders(order.id, {
                ESTADO: estadoFinal,
                MENSAJE: mensajeFinal,
                ID_KEYSAP: sapDocEntry,
                DOC_ERROR: DOC_ERROR,
                OBJ_ERROR: OBJ_ERROR
            });

            resultados.push({
                order_id: order.id,
                estado: estadoFinal === 1 ? "OK" : "ERROR",
                mensaje: mensajeFinal,
                sap_docEntry: sapDocEntry
            });
        }

        return resultados;

    } catch (e) {
        $.trace.error("CrearOrdenesV3_LOCAL Error: " + e.message);
        throw e;
    }
}
//------------------------------------------------------------------------------------
// OBTENER ORDENES -------------------------------------------------------------------

function ObtenerOrdenesMLPorFecha(parametrosML, fechaBuscada,Tipo, ID=0) {

    var resultado = {
        ok: false,
        total: 0,
        ordenesValidas: [],
        ordenesInvalidas: []
    };

    var httpClient = new $.net.http.Client();   // 🔥 UN SOLO CLIENT

    try {

        // ============================
        // TOKEN
        // ============================
        var GetToken = LogicaMercadoLibre.RefreshToken_BodyParam(parametrosML);
        if (!GetToken || GetToken.status === 400) {
            throw new Error("Error al obtener Token: " + GetToken.message);
        }

        // ============================
        // OBTENER ÓRDENES
        // ============================
        
        if (ID===0)
        {
       
           var ordersData = LogicaMercadoLibre.GetOrdersByDateByHour(
            GetToken.access_token,
            parametrosML.ML_SELLER_ID,
            fechaBuscada,
            Tipo);
        }
        else {
             var ordersData = LogicaMercadoLibre.GetOrderIndividual(
            GetToken.access_token,
            parametrosML.ML_SELLER_ID,
            ID  );
            
        }
        
       
   
        if (!ordersData || !Array.isArray(ordersData)) {
            throw new Error("GetOrdersByDateByHour no devolvió un array.");
        }

        for (var i = 0; i < ordersData.length; i++) {

            var order = ordersData[i];

            // ============================
            // VALIDAR SHIPPING
            // ============================
            if (!order.shipping || !order.shipping.id) {
                //$.trace.warning("Order " + order.id + " sin shipping.id");
               // continue;
                 var tipoOS = "MKPLACE";
                 //tipoOS = "FLEX";
            }
            else
            {
                 // ============================
            // OBTENER DIRECCIÓN (USA MISMO CLIENT)
            // ============================
            var direccion = LogicaMercadoLibre.GetDireccion(
                httpClient,
                GetToken.access_token,
                order.shipping.id
            );

            if (!direccion || !direccion.receiver_address) {
                $.trace.warning("Dirección inválida order " + order.id);
                //continue;
               
                    
            }
            else 
            {
                var ra = direccion.receiver_address;

                  var tipoOS = "MKPLACE";
                    if (direccion.logistic_type === "self_service") 
                    {
                        tipoOS = "FLEX";
                    }
                    else if(direccion.logistic_type === "fulfillment") 
                    {
                        continue;
                    } 
                     order.Direccion = {
                    Comuna: (ra.city && ra.city.name) ? quitarTildes(ra.city.name.toUpperCase()): null,
                    Calle: ra.street_name || null,
                    Numero: ra.street_number || null,
                    Direccion: ra.address_line || null,
                    Ciudad: (ra.state && ra.state.name) ? ra.state.name : null,
                    logistic_type: tipoOS,
                    logistic_typeOrigen: direccion.logistic_type || null ,
                    base_cost:direccion.base_cost||0,
                    FechaVencimientoFinal: direccion.shipping_option.estimated_delivery_final.date||null,
                    FechaVencimientoLimit: direccion.shipping_option.estimated_delivery_limit.date||null,
                    FechaVencimientoTime: direccion.shipping_option.estimated_delivery_time.date||null,
                    Recibido:ra.receiver_name||null
                    };
            }

            }

            // ============================
            // MÉTODOS DE PAGO
            // ============================
            order.MetodoPago = {
                existe_pago: false,
                pagos: []
            };

            if (order.payments && order.payments.length > 0) {

                order.MetodoPago.existe_pago = true;

                for (var ix = 0; ix < order.payments.length; ix++) {

                    var p = order.payments[ix];

                    if (p.status === "approved") {

                        order.MetodoPago.pagos.push({
                            payment_type: p.payment_type || null,
                            status: p.status || null,
                            metodo: p.payment_type || null,
                            metodoID: p.payment_method_id || null,
                            monto: Number(p.total_paid_amount || 0),
                            installments: p.installments || 1,
                            cupon: p.coupon_amount || 0,
                            id: p.id || null,
                            card_id: p.card_id || null
                        });
                    }
                }
            }

            var validacionPago = ValidarMetodoPagoOrden(order);
            if (!validacionPago.ok) {
                order.MotivoInvalidacion = validacionPago.message;
                resultado.ordenesInvalidas.push(order);
                $.trace.warning("Order " + order.id + " no insertada: " + validacionPago.message);
                continue;
            }

            // ============================
            // BILLING INFO (USA MISMO CLIENT)
            // ============================
            var billing = LogicaMercadoLibre.GetBilling_Info(
                httpClient,
                GetToken.access_token,
                order.id
            );

            if (!billing || !billing.billing_info) {
                $.trace.warning("Billing_Info vacío order " + order.id);
                continue;
            }

            order.Billing_Info = billing.billing_info;

            // ============================
            // CLIENTE FACTURACIÓN
            // ============================
            var info = order.Billing_Info.additional_info;

            order.ClienteFacturacion = {
                rut: formatearRut(getBillingValue(info, "DOC_NUMBER")),
                razon_Social: getBillingValue(info, "BUSINESS_NAME"),
                giro: getBillingValue(info, "ECONOMIC_ACTIVITY"),
                comuna: quitarTildes(getBillingValue(info, "NEIGHBORHOOD")),
                ciudad: quitarTildes(getBillingValue(info, "CITY_NAME")),
                region: getBillingValue(info, "STATE_NAME"),
                region_code: getBillingValue(info, "STATE_CODE"),
                calle: getBillingValue(info, "STREET_NAME"),
                numero: getBillingValue(info, "STREET_NUMBER"),
                pais: getBillingValue(info, "COUNTRY_ID")
            };

            // ============================
            // INSERTAR ORDEN
            // ============================
            var InsertOrders = LogicaMercadoLibre.InsertOrders(order);

            if (InsertOrders.estado === 'EXISTE') {
                resultado.ordenesInvalidas.push(order);
                continue;
            }

            resultado.ordenesValidas.push(order);
        }

        resultado.ok = true;
        resultado.total = resultado.ordenesValidas.length + resultado.ordenesInvalidas.length;

        return resultado;

    } catch (e) {
        $.trace.error("ObtenerOrdenesMLPorFecha ERROR: " + e.message);
        throw e;

    } finally {

        httpClient.close();   // 🔥 SOLO AQUÍ SE CIERRA
 
    }
}

function validarClaimDevolucionPendiente(claim) {
    var tipoClaim = String(claim && claim.type || "").toLowerCase();
    var estadoClaim = String(claim && claim.status || "").toLowerCase();
    var etapaClaim = String(claim && claim.stage || "").toLowerCase();
    var recursoClaim = String(claim && claim.resource || "").toLowerCase();
    var esDevolucion = tipoClaim === "return" || tipoClaim === "returns";

    return {
        ok: esDevolucion &&
            estadoClaim === "opened" &&
            etapaClaim === "claim" &&
            recursoClaim === "order",
        type: claim ? claim.type : null,
        status: claim ? claim.status : null,
        stage: claim ? claim.stage : null,
        resource: claim ? claim.resource : null
    };
}

function validarClaimConDevolucion(claim) {
    var tipoClaim = String(claim && claim.type || "").toLowerCase();
    var entidades = claim && claim.related_entities &&
        Array.isArray(claim.related_entities)
        ? claim.related_entities
        : [];
    var tieneEntidadReturn = false;

    for (var i = 0; i < entidades.length; i++) {
        var entidad = String(entidades[i] || "").toLowerCase();
        if (entidad === "return" || entidad === "returns") {
            tieneEntidadReturn = true;
            break;
        }
    }

    return {
        ok: tipoClaim === "return" ||
            tipoClaim === "returns" ||
            tieneEntidadReturn,
        type: claim ? claim.type : null,
        status: claim ? claim.status : null,
        stage: claim ? claim.stage : null,
        resource: claim ? claim.resource : null,
        related_entities: entidades
    };
}

function construirDocumentoDevolucion(claim, returnData) {
    var orderId = returnData.resource_id || null;

    if (returnData.orders && returnData.orders.length > 0) {
        orderId = returnData.orders[0].order_id || orderId;
    }

    return {
        id: returnData.id,
        return_id: returnData.id,
        claim_id: claim.id,
        order_id: orderId,
        claim: claim,
        return: returnData
    };
}

function ObtenerDevolucionesMLPorFecha(parametrosML, fechaBuscada, Tipo, claimId) {
    var resultado = {
        ok: false,
        total: 0,
        devolucionesInsertadas: [],
        devolucionesExistentes: [],
        devolucionesInvalidas: [],
        devolucionesOmitidas: []
    };

    try {
        var token = LogicaMercadoLibre.RefreshToken_BodyParam(parametrosML);

        if (!token || !token.access_token) {
            throw new Error(
                "Error al obtener Token: " +
                (token && token.message ? token.message : "Respuesta sin access_token")
            );
        }

        var claims = [];

        if (claimId !== undefined && claimId !== null && String(claimId) !== "" && String(claimId) !== "0") {
            claims.push(
                LogicaMercadoLibre.GetClaimIndividual(
                    token.access_token,
                    claimId
                )
            );
        } else {
            claims = LogicaMercadoLibre.GetClaimsReturnsByDate(
                token.access_token,
                parametrosML.ML_SELLER_ID,
                fechaBuscada,
                Tipo
            );
        }

        if (!claims || !Array.isArray(claims)) {
            throw new Error("La consulta de claims de devolución no devolvió un array");
        }

        for (var i = 0; i < claims.length; i++) {
            var claim = claims[i];

            if (!claim || claim.id === undefined || claim.id === null) {
                resultado.devolucionesInvalidas.push({
                    claim: claim,
                    mensaje: "Claim sin identificador"
                });
                continue;
            }

            var validacionClaim = validarClaimDevolucionPendiente(claim);

            if (!validacionClaim.ok) {
                resultado.devolucionesOmitidas.push({
                    claim_id: String(claim.id),
                    type: validacionClaim.type,
                    status: validacionClaim.status,
                    stage: validacionClaim.stage,
                    resource: validacionClaim.resource,
                    mensaje: "Claim omitido: no corresponde a una devolución abierta y pendiente de una orden"
                });
                continue;
            }

            try {
                var returnResponse = LogicaMercadoLibre.GetReturnByClaim(
                    token.access_token,
                    claim.id
                );
                var returns = Array.isArray(returnResponse)
                    ? returnResponse
                    : [returnResponse];

                for (var r = 0; r < returns.length; r++) {
                    var returnData = returns[r];

                    if (!returnData || returnData.id === undefined || returnData.id === null) {
                        resultado.devolucionesInvalidas.push({
                            claim_id: String(claim.id),
                            claim: claim,
                            return: returnData,
                            mensaje: "La respuesta no contiene return_id"
                        });
                        continue;
                    }

                    var devolucion = construirDocumentoDevolucion(
                        claim,
                        returnData
                    );
                    var insert = LogicaMercadoLibre.InsertReturns(devolucion);

                    if (insert && insert.estado === "INSERTADO") {
                        resultado.devolucionesInsertadas.push(devolucion);
                    } else if (insert && insert.estado === "EXISTE") {
                        resultado.devolucionesExistentes.push(devolucion);
                    } else {
                        resultado.devolucionesInvalidas.push({
                            claim_id: String(claim.id),
                            return_id: String(returnData.id),
                            claim: claim,
                            return: returnData,
                            mensaje: insert && insert.message
                                ? insert.message
                                : "Error insertando devolución"
                        });
                    }
                }
            } catch (errorReturn) {
                resultado.devolucionesInvalidas.push({
                    claim_id: String(claim.id),
                    claim: claim,
                    mensaje: errorReturn.message || String(errorReturn)
                });
            }
        }

        resultado.ok = resultado.devolucionesInvalidas.length === 0;
        resultado.total =
            resultado.devolucionesInsertadas.length +
            resultado.devolucionesExistentes.length +
            resultado.devolucionesInvalidas.length;

        return resultado;
    } catch (e) {
        $.trace.error("ObtenerDevolucionesMLPorFecha ERROR: " + e.message);
        throw e;
    }
}

function ObtenerDevolucionesMLPorOrden(parametrosML, orderId) {
    var resultado = {
        ok: false,
        order_id: orderId ? String(orderId) : "",
        total: 0,
        devoluciones: [],
        omitidas: [],
        errores: []
    };

    if (!orderId || !/^\d+$/.test(String(orderId))) {
        throw new Error("Debe informar un número de orden Mercado Libre válido");
    }

    var token = LogicaMercadoLibre.RefreshToken_BodyParam(parametrosML);

    if (!token || !token.access_token) {
        throw new Error(
            "Error al obtener Token: " +
            (token && token.message ? token.message : "Respuesta sin access_token")
        );
    }

    var claims = LogicaMercadoLibre.GetClaimsReturnsByOrder(
        token.access_token,
        orderId
    );

    if (!claims || !Array.isArray(claims)) {
        throw new Error("La búsqueda por orden no devolvió una lista de claims");
    }

    for (var i = 0; i < claims.length; i++) {
        var claim = claims[i];
        var validacionClaim = validarClaimConDevolucion(claim);

        if (!validacionClaim.ok) {
            resultado.omitidas.push({
                claim_id: claim && claim.id !== undefined ? String(claim.id) : "",
                type: validacionClaim.type,
                status: validacionClaim.status,
                stage: validacionClaim.stage,
                resource: validacionClaim.resource,
                related_entities: validacionClaim.related_entities,
                mensaje: "El claim no tiene una devolución asociada"
            });
            continue;
        }

        try {
            var returnResponse = LogicaMercadoLibre.GetReturnByClaim(
                token.access_token,
                claim.id
            );
            var returns = Array.isArray(returnResponse)
                ? returnResponse
                : [returnResponse];

            for (var r = 0; r < returns.length; r++) {
                var returnData = returns[r];

                if (!returnData || returnData.id === undefined || returnData.id === null) {
                    resultado.errores.push({
                        claim_id: String(claim.id),
                        mensaje: "La respuesta no contiene return_id"
                    });
                    continue;
                }

                var devolucion = construirDocumentoDevolucion(claim, returnData);

                if (String(devolucion.order_id || "") !== String(orderId)) {
                    var perteneceOrden = false;
                    var ordersReturn = returnData.orders || [];

                    for (var o = 0; o < ordersReturn.length; o++) {
                        if (String(ordersReturn[o].order_id || "") === String(orderId)) {
                            perteneceOrden = true;
                            break;
                        }
                    }

                    if (!perteneceOrden) {
                        resultado.omitidas.push({
                            claim_id: String(claim.id),
                            return_id: String(returnData.id),
                            mensaje: "La devolución no contiene la orden consultada"
                        });
                        continue;
                    }
                }

                // En devoluciones de carrito, conservar como referencia principal
                // la orden utilizada en la consulta, aunque no sea la primera del array.
                devolucion.order_id = orderId;

                var itemResultado = {
                    devolucion: devolucion
                };

                resultado.devoluciones.push(itemResultado);
            }
        } catch (errorReturn) {
            resultado.errores.push({
                claim_id: claim && claim.id !== undefined ? String(claim.id) : "",
                mensaje: errorReturn.message || String(errorReturn)
            });
        }
    }

    resultado.total = resultado.devoluciones.length;
    resultado.ok = resultado.errores.length === 0;
    return resultado;
}

function ObtenerDevolucionesMLCuenta(parametrosML, fechaDesde, fechaHasta) {
    var resultado = {
        ok: false,
        seller_id: parametrosML && parametrosML.ML_SELLER_ID
            ? String(parametrosML.ML_SELLER_ID)
            : "",
        fecha_desde: fechaDesde || "",
        fecha_hasta: fechaHasta || "",
        total: 0,
        total_claims: 0,
        devoluciones: [],
        omitidas: [],
        errores: [],
        estados: {}
    };

    validarRangoFechasDevoluciones(fechaDesde, fechaHasta);

    var token = LogicaMercadoLibre.RefreshToken_BodyParam(parametrosML);

    if (!token || !token.access_token) {
        throw new Error(
            "Error al obtener Token: " +
            (token && token.message ? token.message : "Respuesta sin access_token")
        );
    }

    var claimsPorId = {};
    var claimsCuenta = consultarClaimsCuentaVendedora(
        token.access_token,
        parametrosML.ML_SELLER_ID,
        fechaDesde,
        fechaHasta
    );

    for (var c = 0; c < claimsCuenta.length; c++) {
        var claimCuenta = claimsCuenta[c];
        if (!claimCuenta || claimCuenta.id === undefined || claimCuenta.id === null) {
            resultado.errores.push({
                mensaje: "Claim sin identificador",
                claim: claimCuenta
            });
            continue;
        }

        claimsPorId[String(claimCuenta.id)] = claimCuenta;
    }

    for (var claimId in claimsPorId) {
        if (!Object.prototype.hasOwnProperty.call(claimsPorId, claimId)) {
            continue;
        }

        var claim = claimsPorId[claimId];
        resultado.total_claims++;
        var validacionClaim = validarClaimConDevolucion(claim);

        if (!validacionClaim.ok) {
            resultado.omitidas.push({
                claim_id: claimId,
                type: validacionClaim.type,
                status: validacionClaim.status,
                stage: validacionClaim.stage,
                resource: validacionClaim.resource,
                related_entities: validacionClaim.related_entities,
                mensaje: "El claim no tiene una devolución asociada"
            });
            continue;
        }

        try {
            var returnResponse = consultarReturnsPorClaim(
                token.access_token,
                claim.id
            );
            var returns = Array.isArray(returnResponse)
                ? returnResponse
                : [returnResponse];

            for (var r = 0; r < returns.length; r++) {
                var returnData = returns[r];

                if (!returnData || returnData.id === undefined || returnData.id === null) {
                    resultado.errores.push({
                        claim_id: claimId,
                        mensaje: "La respuesta no contiene return_id"
                    });
                    continue;
                }

                var devolucion = construirDocumentoDevolucion(claim, returnData);
                resultado.devoluciones.push({ devolucion: devolucion });

                var estado = String(returnData.status || claim.status || "sin_estado");
                resultado.estados[estado] = (resultado.estados[estado] || 0) + 1;
            }
        } catch (errorReturn) {
            resultado.errores.push({
                claim_id: claimId,
                mensaje: errorReturn.message || String(errorReturn)
            });
        }
    }

    resultado.devoluciones.sort(function (a, b) {
        var fechaA = a.devolucion && a.devolucion.return
            ? String(a.devolucion.return.last_updated || "")
            : "";
        var fechaB = b.devolucion && b.devolucion.return
            ? String(b.devolucion.return.last_updated || "")
            : "";
        return fechaA < fechaB ? 1 : (fechaA > fechaB ? -1 : 0);
    });

    resultado.total = resultado.devoluciones.length;
    resultado.ok = resultado.errores.length === 0;
    return resultado;
}

function validarRangoFechasDevoluciones(fechaDesde, fechaHasta) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaDesde || "")) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(fechaHasta || ""))) {
        throw new Error("Debe informar las fechas desde y hasta en formato YYYY-MM-DD");
    }

    var desde = crearFechaLocalDevolucion(fechaDesde);
    var hasta = crearFechaLocalDevolucion(fechaHasta);

    if (desde.getTime() > hasta.getTime()) {
        throw new Error("La fecha desde no puede ser posterior a la fecha hasta");
    }

    var dias = Math.floor((
        Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate()) -
        Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate())
    ) / 86400000) + 1;
    if (dias > 31) {
        throw new Error("El rango máximo de consulta es de 31 días");
    }
}

function construirRangoFechasDevoluciones(fechaDesde, fechaHasta) {
    var fechas = [];
    var actual = crearFechaLocalDevolucion(fechaDesde);
    var hasta = crearFechaLocalDevolucion(fechaHasta);

    while (actual.getTime() <= hasta.getTime()) {
        fechas.push(formatearFechaDevolucion(actual));
        actual.setDate(actual.getDate() + 1);
    }

    return fechas;
}

function crearFechaLocalDevolucion(valor) {
    var partes = String(valor).split("-");
    var fecha = new Date(
        Number(partes[0]),
        Number(partes[1]) - 1,
        Number(partes[2])
    );

    if (fecha.getFullYear() !== Number(partes[0]) ||
        fecha.getMonth() !== Number(partes[1]) - 1 ||
        fecha.getDate() !== Number(partes[2])) {
        throw new Error("La fecha informada no es válida: " + valor);
    }

    return fecha;
}

function formatearFechaDevolucion(fecha) {
    var mes = String(fecha.getMonth() + 1);
    var dia = String(fecha.getDate());
    return fecha.getFullYear() + "-" +
        (mes.length < 2 ? "0" + mes : mes) + "-" +
        (dia.length < 2 ? "0" + dia : dia);
}

function consultarClaimsCuentaVendedora(accessToken, sellerId, fechaDesde, fechaHasta) {
    if (!sellerId) {
        throw new Error("La configuración no contiene ML_SELLER_ID");
    }

    var client = new $.net.http.Client();
    var dest = $.net.http.readDestination("MercadoLibre", "meli_token");
    var claims = [];
    var offset = 0;
    var limit = 100;
    var total = 0;
    var rango = "date_created:after:" + fechaDesde +
        "T00:00:00.000Z,before:" + fechaHasta + "T23:59:59.999Z";

    try {
        do {
            var path = "/post-purchase/v1/claims/search" +
                "?players.user_id=" + encodeURIComponent(String(sellerId)) +
                "&players.role=respondent" +
                "&range=" + encodeURIComponent(rango) +
                "&sort=" + encodeURIComponent("date_created:desc") +
                "&limit=" + limit +
                "&offset=" + offset;

            var req = new $.net.http.Request($.net.http.GET, path);
            req.timeout = 30000;
            req.headers.set("Authorization", "Bearer " + accessToken);
            req.headers.set("Accept", "application/json");

            client.request(req, dest);
            var resp = client.getResponse();
            var bodyText = resp.body ? resp.body.asString() : "";

            if (resp.status !== 200) {
                throw new Error(
                    "Error ML buscando claims HTTP " + resp.status + ": " + bodyText
                );
            }

            var body = bodyText ? JSON.parse(bodyText) : {};
            var pagina = body.data && Array.isArray(body.data) ? body.data : [];
            claims = claims.concat(pagina);
            total = body.paging && body.paging.total
                ? Number(body.paging.total)
                : claims.length;
            offset += pagina.length;

            if (offset >= 9900 && offset < total) {
                throw new Error(
                    "La búsqueda supera el límite de 9.900 claims; reduzca el rango de fechas"
                );
            }
        } while (offset < total && offset > 0);

        return claims;
    } finally {
        client.close();
    }
}

function consultarReturnsPorClaim(accessToken, claimId) {
    var client = new $.net.http.Client();
    var dest = $.net.http.readDestination("MercadoLibre", "meli_token");

    try {
        var path = "/post-purchase/v2/claims/" +
            encodeURIComponent(String(claimId)) + "/returns";
        var req = new $.net.http.Request($.net.http.GET, path);
        req.timeout = 30000;
        req.headers.set("Authorization", "Bearer " + accessToken);
        req.headers.set("Accept", "application/json");

        client.request(req, dest);
        var resp = client.getResponse();
        var bodyText = resp.body ? resp.body.asString() : "";

        if (resp.status !== 200) {
            throw new Error(
                "Error ML consultando devolución del claim " + claimId +
                " HTTP " + resp.status + ": " + bodyText
            );
        }

        return bodyText ? JSON.parse(bodyText) : null;
    } finally {
        client.close();
    }
}
// rut

function ValidarMetodoPagoOrden(order) {
    var pagos = order && order.MetodoPago && order.MetodoPago.pagos ? order.MetodoPago.pagos : [];

    if (!pagos || pagos.length === 0) {
        return {
            ok: false,
            message: "La orden no tiene pagos aprobados"
        };
    }

    var mediosPagoSAP = {};
    if (companies &&
        companies.length > 0 &&
        companies[0].MedioPago &&
        companies[0].MedioPago.length > 0) {
        mediosPagoSAP = companies[0].MedioPago[0];
    }

    for (var i = 0; i < pagos.length; i++) {
        var pago = pagos[i];
        var metodo = pago.metodo || pago.payment_type;

        if (!metodo) {
            return {
                ok: false,
                message: "La orden tiene un pago sin tipo de medio de pago"
            };
        }

        if (!mediosPagoSAP.hasOwnProperty(metodo)) {
            return {
                ok: false,
                message: "Medio de pago ML no configurado: " + metodo
            };
        }
    }

    return {
        ok: true,
        message: "Pago válido"
    };
}

function formatearRut(rut) {

    if (!rut) return "";

    // Convertir a string
    rut = String(rut).trim();

    // Quitar puntos y guión
    rut = rut.replace(/\./g, "").replace(/-/g, "");

    if (rut.length < 2) return rut;

    var cuerpo = rut.slice(0, -1);
    var dv     = rut.slice(-1).toUpperCase();

    return cuerpo + "-" + dv;
}
//-------------------------------------------------------------------------------------------
//-------------------------------------------------------------------------------------------
// ACTUALIZA MERCADO LIBRE -------------------------------------------------------------------
// ACTUALIZA MERCADO LIBRE -------------------------------------------------------------------
function normalizarListaArticulos(ListaArticulos) {
    if (!ListaArticulos) {
        return [];
    }

    if (Array.isArray(ListaArticulos)) {
        return ListaArticulos;
    }

    if (ListaArticulos.rows && Array.isArray(ListaArticulos.rows)) {
        return ListaArticulos.rows;
    }

    if (ListaArticulos.data && Array.isArray(ListaArticulos.data)) {
        return ListaArticulos.data;
    }

    if (ListaArticulos.error) {
        return [];
    }

    if (typeof ListaArticulos.length === "number") {
        var filas = [];
        for (var i = 0; i < ListaArticulos.length; i++) {
            if (ListaArticulos[i] !== undefined) {
                filas.push(ListaArticulos[i]);
            }
        }
        return filas;
    }

    if (typeof ListaArticulos === "object") {
        return [ListaArticulos];
    }

    return [];
}

function ObtenerListaStock(parametros, parametrosML) {
    var httpClient = new $.net.http.Client();

    try {
        var almacen = parametros && parametros.almacen
            ? parametros.almacen
            : (parametrosML && parametrosML.almacen ? parametrosML.almacen : "");

        var parametrosSP = {
            P1: almacen
        };

        var spName = "EXX_B2C_GetItemStockv2";
        var procedimientoSolicitado = parametros && (parametros.procedimiento || parametros.procedimientoStock || parametros.spName)
            ? (parametros.procedimiento || parametros.procedimientoStock || parametros.spName)
            : "";

        if (!procedimientoSolicitado) {
            var tipoModo = parametros && (parametros.tipo || parametros.modo)
                ? String(parametros.tipo || parametros.modo).toLowerCase()
                : "";

            if (tipoModo === "masiva" || tipoModo === "full" || tipoModo === "mass" || tipoModo === "m") {
                spName = "EXX_B2C_GetItemStock_FULL";
            }
        } else {
            spName = procedimientoSolicitado;
        }

        if (parametrosML && parametrosML.procedimiento && !procedimientoSolicitado) {
            spName = parametrosML.procedimiento;
        }

        var respuestaSP = DBCONEX.CALLSPMercadoLibre(
            companies[0].CompanyDB,
            spName,
            parametrosSP
        );

        if (respuestaSP && respuestaSP.error) {
            return [{
                itemCode: "",
                idMercadoLibre: "",
                stock: "",
                estado: "ERROR",
                mensaje: String(respuestaSP.error)
            }];
        }

        var ListaArticulos = normalizarListaArticulos(respuestaSP);

        if (!ListaArticulos || ListaArticulos.length === 0) {
            return [{
                itemCode: "",
                idMercadoLibre: "",
                stock: "",
                estado: "SIN_ARTICULOS",
                mensaje: "No se encontraron artículos para actualizar."
            }];
        }

        var resultados = [];

        for (var i = 0; i < ListaArticulos.length; i++) {
            var item = ListaArticulos[i];
            var stock = parseInt(
                item.qty !== undefined && item.qty !== null
                    ? item.qty
                    : (item.stock !== undefined && item.stock !== null
                        ? item.stock
                        : item.Stock),
                10
            );

            resultados.push({
                itemCode: item.ItemCode || item.itemCode || "",
                idMercadoLibre: item.U_EXX_ID_MELI ||
                                  item.idMercadoLibre ||
                                  item.IdMercadoLibre ||
                                  "",
                stock: isNaN(stock) ? 0 : stock,
                estado: "PREVISUALIZADO",
                mensaje: ""
            });
        }

        return resultados;

    } catch (e) {
        $.trace.error("JOB Error ObetenerListaStock: " + e.message);
        throw e;

    } finally {
        httpClient.close();
    }
}
function ActualizarStockV2(parametrosML) {
    var httpClient = new $.net.http.Client();

    try {
        var parametros = {
            P1: parametrosML.almacen
        };

        var respuestaSP = DBCONEX.CALLSPMercadoLibre(
            companies[0].CompanyDB,
            "EXX_B2C_GetItemStockv2",
            parametros
        );

        if (respuestaSP && respuestaSP.error) {
            return [{
                estado: "ERROR",
                mensaje: String(respuestaSP.error)
            }];
        }

        var ListaArticulos = normalizarListaArticulos(respuestaSP);

        if (!ListaArticulos || ListaArticulos.length === 0) {
            return [{
                estado: "SIN_ARTICULOS",
                mensaje: "No se encontraron artículos para actualizar."
            }];
        }

        var GetToken = LogicaMercadoLibre.RefreshToken_BodyParam(parametrosML);

        if (!GetToken || !GetToken.access_token) {
            return [{
                estado: "ERROR",
                mensaje: "No se pudo obtener access_token de Mercado Libre"
            }];
        }

        var resultados = [];

        for (var i = 0; i < ListaArticulos.length; i++) {
            var item = ListaArticulos[i];

            var ItemCode = item.ItemCode;
            var Stock = parseInt(item.qty || 0, 10);
            
            var IdMercadoLibre = item.U_EXX_ID_MELI;

            try {
                

                var resp = LogicaMercadoLibre.ActualizaStock(
                    httpClient,
                    GetToken.access_token,
                    IdMercadoLibre,
                    Stock
                );

                if (resp && resp.ok) {
                    resultados.push({
                        itemCode: ItemCode,
                        idMercadoLibre: IdMercadoLibre,
                        stock: Stock,
                        estado: "OK",
                        mensaje: "Stock actualizado correctamente en Mercado Libre"
                    });
                } else {
                    resultados.push({
                        itemCode: ItemCode,
                        idMercadoLibre: IdMercadoLibre,
                        stock: Stock,
                        estado: "ERROR",
                        status: resp ? resp.status : null,
                        mensaje: resp ? (resp.message || resp.statusText || resp.body) : "Sin respuesta de Mercado Libre"
                    });
                }

            } catch (innerErr) {
                resultados.push({
                    itemCode: ItemCode,
                    idMercadoLibre: IdMercadoLibre,
                    stock: Stock,
                    estado: "ERROR",
                    mensaje: "Error al actualizar artículo: " + innerErr.message
                });
            }
        }

        return resultados;

    } catch (e) {
        $.trace.error("JOB Error ActualizarStockV2: " + e.message);
        throw e;

    } finally {
        httpClient.close();
    }
}

function ActualizarStockBatch(parametrosML, tamanoLote, ListaPrevisualizada) {
    var httpClient = new $.net.http.Client();

    try {
        var limiteConfigurado = parseInt(
            tamanoLote || Config.appConfig.StockBatchSize || 20,
            10
        );

        if (isNaN(limiteConfigurado) || limiteConfigurado < 1) {
            limiteConfigurado = 20;
        }

        // La API batch de Mercado Libre admite un número acotado de operaciones.
        if (limiteConfigurado > 20) {
            limiteConfigurado = 20;
        }

        var parametros = {
            P1: parametrosML.almacen
        };

        var ListaArticulos = normalizarListaArticulos(ListaPrevisualizada);

        if (!ListaArticulos || ListaArticulos.length === 0) {
            var respuestaSPBatch = DBCONEX.CALLSPMercadoLibre(
                companies[0].CompanyDB,
                "EXX_B2C_GetItemStockv2",
                parametros
            );

            if (respuestaSPBatch && respuestaSPBatch.error) {
                return [{
                    itemCode: "",
                    idMercadoLibre: "",
                    stock: "",
                    estado: "ERROR",
                    mensaje: String(respuestaSPBatch.error)
                }];
            }

            ListaArticulos = normalizarListaArticulos(respuestaSPBatch);
        }

        if (!ListaArticulos || ListaArticulos.length === 0) {
            return [{
                itemCode: "",
                idMercadoLibre: "",
                stock: "",
                estado: "SIN_ARTICULOS",
                mensaje: "No se encontraron artículos para actualizar."
            }];
        }

        var GetToken = LogicaMercadoLibre.RefreshToken_BodyParam(parametrosML);

        if (!GetToken || !GetToken.access_token) {
            return [{
                itemCode: "",
                idMercadoLibre: "",
                stock: "",
                estado: "ERROR",
                mensaje: "No se pudo obtener access_token de Mercado Libre"
            }];
        }

        var validos = [];
        var resultados = [];

        for (var i = 0; i < ListaArticulos.length; i++) {
            var item = ListaArticulos[i];
            var itemCode = item.ItemCode || item.itemCode || "";
            var idMercadoLibre = item.U_EXX_ID_MELI ||
                                  item.idMercadoLibre ||
                                  item.IdMercadoLibre ||
                                  "";
            var valorStock = item.qty !== undefined && item.qty !== null
                ? item.qty
                : (item.stock !== undefined && item.stock !== null
                    ? item.stock
                    : item.Stock);
            var stock = parseInt(valorStock, 10);

            if (!idMercadoLibre || isNaN(stock) || stock < 0) {
                var errorValidacion = {
                    itemCode: itemCode,
                    idMercadoLibre: idMercadoLibre,
                    stock: isNaN(stock) ? "" : stock,
                    estado: "ERROR",
                    mensaje: !idMercadoLibre
                        ? "El artículo no tiene ID Mercado Libre"
                        : "Stock inválido"
                };
                resultados.push(errorValidacion);
                LogicaMercadoLibre.GuardarErrorStockML(errorValidacion);
                continue;
            }

            validos.push({
                itemCode: itemCode,
                idMercadoLibre: idMercadoLibre,
                stock: stock
            });
        }

        for (var inicio = 0; inicio < validos.length; inicio += limiteConfigurado) {
            var lote = validos.slice(inicio, inicio + limiteConfigurado);
            var respuestaLote = LogicaMercadoLibre.ActualizaStockBatch(
                httpClient,
                GetToken.access_token,
                lote
            );
            var subRespuestas = respuestaLote.responses || [];

            for (var j = 0; j < lote.length; j++) {
                var articulo = lote[j];
                var subRespuesta = subRespuestas[j] || {};
                var codigo = parseInt(subRespuesta.code || subRespuesta.status || 0, 10);
                var bodyRespuesta = subRespuesta.body || {};
                var actualizado = codigo >= 200 && codigo < 300;

                if (typeof bodyRespuesta === "string") {
                    try {
                        bodyRespuesta = JSON.parse(bodyRespuesta);
                    } catch (ignore) {
                        bodyRespuesta = { message: bodyRespuesta };
                    }
                }

                var resultadoItem = {
                    itemCode: articulo.itemCode,
                    idMercadoLibre: articulo.idMercadoLibre,
                    stock: articulo.stock,
                    estado: actualizado ? "OK" : "ERROR",
                    status: codigo || respuestaLote.status || null,
                    lote: Math.floor(inicio / limiteConfigurado) + 1,
                    mensaje: actualizado
                        ? "Stock actualizado correctamente en Mercado Libre"
                        : (bodyRespuesta.message ||
                           respuestaLote.message ||
                           respuestaLote.statusText ||
                           "Error en actualización batch")
                };
                resultados.push(resultadoItem);
                if (resultadoItem.estado === "ERROR") {
                    LogicaMercadoLibre.GuardarErrorStockML(resultadoItem);
                }
            }
        }

        return resultados;

    } catch (e) {
        $.trace.error("JOB Error ActualizarStockBatch: " + e.message);
        throw e;

    } finally {
        httpClient.close();
    }
}

function ActualizarStockBatchMasivo(parametrosML, tamanoLote) {
    if (!parametrosML || !parametrosML.almacen) {
        throw new Error("No existe una bodega configurada para el proceso masivo");
    }

    var listaMasiva = ObtenerListaStock({
        almacen: parametrosML.almacen,
        procedimiento: "EXX_B2C_GetItemStock_FULL"
    }, parametrosML);

    if (!listaMasiva || listaMasiva.length === 0) {
        return [{
            itemCode: "",
            idMercadoLibre: "",
            stock: "",
            estado: "SIN_ARTICULOS",
            mensaje: "El SP masivo no retornó artículos para actualizar"
        }];
    }

    if (listaMasiva.length === 1 &&
        (listaMasiva[0].estado === "ERROR" ||
         listaMasiva[0].estado === "SIN_ARTICULOS")) {
        return listaMasiva;
    }

    var idConexion = String(Config.appConfig.IDConexionECOM || "")
        .replace(/'/g, "''");
    var limpiezaLog = DBCONEX.ExecuteQueryFULL(
        companies[0].CompanyDB,
        'DELETE FROM "EXX_SAP_ECOMMERCE"."EXX_ML_STOCK_LOG" ' +
        'WHERE "ID_CONEXION" = \'' + idConexion + '\''
    );

    if (!limpiezaLog || limpiezaLog.success !== true) {
        throw new Error(
            limpiezaLog && limpiezaLog.error
                ? limpiezaLog.error
                : "No fue posible limpiar el log antes del proceso masivo"
        );
    }

    return ActualizarStockBatch(
        parametrosML,
        tamanoLote || 20,
        listaMasiva
    );
}

function obtenerCampoErrorStock(fila, nombres) {
    if (!fila || !nombres) {
        return null;
    }

    for (var i = 0; i < nombres.length; i++) {
        if (fila[nombres[i]] !== undefined && fila[nombres[i]] !== null) {
            return fila[nombres[i]];
        }
    }

    return null;
}

function ReprocesarErroresStockBatch(parametrosML, maxIntentos) {
    if (!parametrosML || !parametrosML.almacen) {
        throw new Error("No existe una bodega configurada para reprocesar errores");
    }

    var limiteIntentos = parseInt(maxIntentos || 3, 10);
    if (isNaN(limiteIntentos) || limiteIntentos < 1) {
        limiteIntentos = 3;
    }

    var idConexion = String(Config.appConfig.IDConexionECOM || 2);
    var respuestaSP = DBCONEX.CALLSPMercadoLibre(
        companies[0].CompanyDB,
        "EXX_B2C_GetErrorStock",
        {
            P1: parametrosML.almacen,
            P2: idConexion
        }
    );

    if (respuestaSP && respuestaSP.error) {
        throw new Error(String(respuestaSP.error));
    }

    var erroresLog = normalizarListaArticulos(respuestaSP);
    var listaReproceso = [];
    var omitidosPorIntentos = 0;

    for (var i = 0; i < erroresLog.length; i++) {
        var intentos = parseInt(
            obtenerCampoErrorStock(erroresLog[i], ["INTENTOS", "intentos"]) || 0,
            10
        );

        if (intentos >= limiteIntentos) {
            omitidosPorIntentos++;
            continue;
        }

        listaReproceso.push({
            itemCode: obtenerCampoErrorStock(
                erroresLog[i],
                ["ITEM_CODE", "itemCode", "ItemCode"]
            ) || "",
            idMercadoLibre: obtenerCampoErrorStock(
                erroresLog[i],
                ["ID_MERCADO_LIBRE", "idMercadoLibre", "IdMercadoLibre"]
            ) || "",
            stock: obtenerCampoErrorStock(
                erroresLog[i],
                ["STOCK_ACTUAL", "stockActual", "StockActual", "stockActualizado"]
            ),
            intentosAnteriores: intentos
        });
    }

    if (!listaReproceso.length) {
        return {
            estado: "SIN_ERRORES_PENDIENTES",
            total: 0,
            resueltos: 0,
            errores: 0,
            omitidosPorIntentos: omitidosPorIntentos,
            maxIntentos: limiteIntentos,
            resultado: []
        };
    }

    var resultado = ActualizarStockBatch(
        parametrosML,
        20,
        listaReproceso
    );
    var resultadosPorClave = {};

    for (var j = 0; j < resultado.length; j++) {
        var resultadoItem = resultado[j] || {};
        var claveResultado = String(resultadoItem.itemCode || "") + "|" +
            String(resultadoItem.idMercadoLibre || "");

        if (resultadoItem.itemCode || resultadoItem.idMercadoLibre) {
            resultadosPorClave[claveResultado] = resultadoItem;
        }
    }

    var resueltos = 0;
    var errores = 0;

    for (var k = 0; k < listaReproceso.length; k++) {
        var articulo = listaReproceso[k];
        var claveArticulo = String(articulo.itemCode || "") + "|" +
            String(articulo.idMercadoLibre || "");
        var resultadoEncontrado = resultadosPorClave[claveArticulo];
        var operacionLog;
        var tipoOperacionLog;

        if (resultadoEncontrado && resultadoEncontrado.estado === "OK") {
            tipoOperacionLog = "ELIMINAR_ERROR_RESUELTO";
            operacionLog = LogicaMercadoLibre.ResolverErrorStockML(
                {
                    estado: "OK",
                    itemCode: articulo.itemCode,
                    idMercadoLibre: articulo.idMercadoLibre,
                    stock: articulo.stock
                }
            );
            resueltos++;
        } else {
            tipoOperacionLog = "INCREMENTAR_INTENTO";
            operacionLog = LogicaMercadoLibre.IncrementarIntentoErrorStockML(articulo);
            errores++;
        }

        if (!operacionLog || operacionLog.success !== true) {
            var detalleOperacionLog;

            try {
                detalleOperacionLog = JSON.stringify(operacionLog);
            } catch (errorJSON) {
                detalleOperacionLog = String(operacionLog);
            }

            throw new Error(
                "No fue posible actualizar el estado del error de stock" +
                " | Operación: " + tipoOperacionLog +
                " | Item: " + (articulo.itemCode || "") +
                " | ID ML: " + (articulo.idMercadoLibre || "") +
                " | Motivo: " + (
                    operacionLog &&
                    (operacionLog.error || operacionLog.message || operacionLog.mensaje)
                        ? (operacionLog.error || operacionLog.message || operacionLog.mensaje)
                        : "Respuesta sin success=true"
                ) +
                " | Respuesta: " + detalleOperacionLog
            );
        }
    }

    return {
        estado: "PROCESADO",
        total: listaReproceso.length,
        resueltos: resueltos,
        errores: errores,
        omitidosPorIntentos: omitidosPorIntentos,
        maxIntentos: limiteIntentos,
        resultado: resultado
    };
}

function ActualizarStockLista(parametrosML, ListaArticulos) {
    var httpClient = new $.net.http.Client();

    try {
        var GetToken = LogicaMercadoLibre.RefreshToken_BodyParam(parametrosML);

        if (!GetToken || !GetToken.access_token) {
            return [{
                itemCode: "",
                idMercadoLibre: "",
                stock: "",
                estado: "ERROR",
                mensaje: "No se pudo obtener access_token de Mercado Libre"
            }];
        }

        var resultados = [];

        for (var i = 0; i < ListaArticulos.length; i++) {
            var item = ListaArticulos[i];

            var ItemCode = item.itemCode || item.ItemCode || "";
            var IdMercadoLibre = item.idMercadoLibre ||
                                  item.IdMercadoLibre ||
                                  item.U_EXX_ID_MELI ||
                                  "";
            var valorStock = item.stock !== undefined && item.stock !== null
                ? item.stock
                : (item.Stock !== undefined && item.Stock !== null
                    ? item.Stock
                    : item.qty);
            var Stock = parseInt(valorStock, 10);

            if (!IdMercadoLibre) {
                var errorSinId = {
                    itemCode: ItemCode,
                    idMercadoLibre: "",
                    stock: Stock,
                    estado: "ERROR",
                    mensaje: "El artículo no tiene ID Mercado Libre"
                };
                resultados.push(errorSinId);
                LogicaMercadoLibre.GuardarErrorStockML(errorSinId);
                continue;
            }

            if (isNaN(Stock) || Stock < 0) {
                var errorStockInvalido = {
                    itemCode: ItemCode,
                    idMercadoLibre: IdMercadoLibre,
                    stock: Stock,
                    estado: "ERROR",
                    mensaje: "Stock inválido"
                };
                resultados.push(errorStockInvalido);
                LogicaMercadoLibre.GuardarErrorStockML(errorStockInvalido);
                continue;
            }

            try {
                var resp = LogicaMercadoLibre.ActualizaStock(
                    httpClient,
                    GetToken.access_token,
                    IdMercadoLibre,
                    Stock
                );

                if (resp && resp.ok) {
                    resultados.push({
                        itemCode: ItemCode,
                        idMercadoLibre: IdMercadoLibre,
                        stock: Stock,
                        estado: "OK",
                        mensaje: "Stock actualizado correctamente en Mercado Libre"
                    });
                } else {
                    resultados.push({
                        itemCode: ItemCode,
                        idMercadoLibre: IdMercadoLibre,
                        stock: Stock,
                        estado: "ERROR",
                        status: resp ? resp.status : null,
                        mensaje: resp ? (resp.message || resp.statusText || resp.body) : "Sin respuesta de Mercado Libre"
                    });
                }

            } catch (innerErr) {
                resultados.push({
                    itemCode: ItemCode,
                    idMercadoLibre: IdMercadoLibre,
                    stock: Stock,
                    estado: "ERROR",
                    mensaje: "Error al actualizar artículo: " + innerErr.message
                });
            }
        }

        return resultados;

    } catch (e) {
        $.trace.error("JOB Error ActualizarStockLista: " + e.message);
        throw e;

    } finally {
        httpClient.close();
    }
}

//-------------------------------------------------------------------------------------------
//-------------------------------------------------------------------------------------------
// Reproceso MERCADO LIBRE -------------------------------------------------------------------
function ReprocesoV3(parametrosML, Tipo, Data = null){
    try 
    {
        var ordersData;

        /* =================================================
           1. OBTENER ÓRDENES
        ================================================= */
        if (Tipo === 'LOCAL') {

            if (!Data || !Array.isArray(Data) || Data.length === 0) {
                return [{
                    estado: "SIN_ORDENES",
                    mensaje: "No se recibió data para reprocesar"
                }];
            }

            // Normalizar al mismo formato del SELECT
            ordersData = {
                rows: Data.map(function (item) {
                    return {
                        DOC_BASE: typeof item.DOC_BASE === "string"
                            ? item.DOC_BASE
                            : JSON.stringify(item.DOC_BASE),
                        DOC_ERROR: item.DOC_ERROR || null,
                        OBJ_ERROR: item.OBJ_ERROR || null
                    };
                })
            };

        } else {

            ordersData = LogicaMercadoLibre.SelectOrdersEcommerce({
                OBJ_BASE: "OrdenML",
                ESTADO: 9
            }, 10);
        }

        if (!ordersData || !ordersData.rows || ordersData.rows.length === 0) {
            return [{
                estado: "SIN_ORDENES",
                mensaje: "No se encontraron órdenes pendientes"
            }];
        }

        var resultados = [];

        /* =================================================
           2. PROCESAR ÓRDENES
        ================================================= */
        for (var i = 0; i < ordersData.rows.length; i++) {

            var row = ordersData.rows[i];
            var order = JSON.parse(row.DOC_BASE);

            var estadoFinal  = 1;
            var mensajeFinal = "Reproceso completado correctamente";
            var sapDocEntry  = null;
            var DOC_ERROR    = null;
            var OBJ_ERROR    = row.OBJ_ERROR;
            var Accion       = null;

            /* =================================================
               3. DETERMINAR ACCIÓN
            ================================================= */
            if (OBJ_ERROR == 17) {
                Accion = 'UpdateLog';
            } else if (OBJ_ERROR == 13) {
                Accion = 'CreaFacturaPago';
            } else if (OBJ_ERROR == 24) {
                Accion = 'CreaPago';
            }
            else if (OBJ_ERROR == '' || row.DOC_BASE != '')  
            {
                Accion = 'UpdateLog';
            } 
            else {
                estadoFinal  = 9;
                mensajeFinal = "Registro sin acción válida para reprocesar";
            }

            try {

                /* =============================================
                   4. UPDATE LOG (RESET)
                ============================================= */
                if (Accion === 'UpdateLog') {

                    LogicaMercadoLibre.UpdateOrders(order.id, {
                        ESTADO: 0,
                        MENSAJE: "Reprocesar habilitado",
                        FECHA_UPD: 'CURRENT_TIMESTAMP'
                    });

                    resultados.push({
                        order_id: order.id,
                        estado: "OK",
                        mensaje: "Orden habilitada para reprocesar"
                    });

                    continue;
                }

                /* =============================================
                   5. REPROCESO SOLO PAGO
                ============================================= */
                if (Accion === 'CreaPago') {

                    var jsonPago = JSON.parse(row.DOC_ERROR || "{}");

                    var hoy = new Date().toISOString().slice(0, 10);
                    jsonPago.DocDate = hoy;
                    jsonPago.TaxDate = hoy;

                    var respPago = LogicaMercadoLibre.ReprocesaDocSAP(
                        parametrosML,
                        jsonPago,
                        SLCONEX,
                        Accion
                    );

                    if (!respPago || respPago.estado === "ERROR" || !respPago.SAP_Key) {
                        throw new Error(respPago ? respPago.Desc : "Error reprocesando pago");
                    }

                    sapDocEntry = respPago.SAP_Key;
                }

                /* =============================================
                   6. REPROCESO FACTURA + PAGO
                ============================================= */
                if (Accion === 'CreaFacturaPago') {

                    var jsonDoc = JSON.parse(row.DOC_ERROR || "{}");

                    var respFactura = LogicaMercadoLibre.ReprocesaDocSAP(
                        parametrosML,
                        jsonDoc,
                        SLCONEX,
                        Accion
                    );

                    if (!respFactura || respFactura.estado === "ERROR" || !respFactura.SAP_Key) {
                        DOC_ERROR = respFactura ? respFactura.json : null;
                        OBJ_ERROR = 13;
                        throw new Error(respFactura ? respFactura.Desc : "Error reprocesando factura");
                    }

                    sapDocEntry = respFactura.SAP_Key;

                    var pago = LogicaMercadoLibre.CrearPagoSAP(
                        parametrosML,
                        order,
                        SLCONEX,
                        respFactura
                    );

                    if (!pago || pago.SAP_Key <= 0) {
                        DOC_ERROR = pago ? pago.json : null;
                        OBJ_ERROR = 24;
                        throw new Error(pago ? pago.Desc : "Error reprocesando pago");
                    }
                }

            } catch (eProceso) {

                estadoFinal  = 9;
                mensajeFinal = eProceso.message || "Error no controlado en reproceso";
            }

            /* =================================================
               7. UPDATE FINAL
            ================================================= */
            LogicaMercadoLibre.UpdateOrders(order.id, {
                ESTADO: estadoFinal,
                MENSAJE: mensajeFinal,
                ID_KEYSAP: sapDocEntry,
                DOC_ERROR: DOC_ERROR,
                OBJ_ERROR: OBJ_ERROR,
                FECHA_UPD: 'CURRENT_TIMESTAMP'
            });

            resultados.push({
                order_id: order.id,
                estado: estadoFinal === 1 ? "OK" : "ERROR",
                mensaje: mensajeFinal,
                sap_docEntry: sapDocEntry
            });
        }

        return resultados;

    } catch (error) {

        $.trace.error("ReprocesoV3 Error: " + error.message);

        return [{
            estado: "ERROR",
            mensaje: error.message || String(error)
        }];
    }
}
//-------------------------------------------------------------------------------------------
//-------------------------------------------------------------------------------------------

function ObtenerOrdenVista(parametrosML, ID) {

    var resultado = {
        ok: false,
        total: 0,
        ordenesValidas: [],
        ordenesInvalidas: []
    };

    var httpClient = new $.net.http.Client();   

    try {

        // ============================
        // TOKEN
        // ============================
        var GetToken = LogicaMercadoLibre.RefreshToken_BodyParam(parametrosML);
        if (!GetToken || GetToken.status === 400) {
            throw new Error("Error al obtener Token: " + GetToken.message);
        }

        // ============================
        // OBTENER ÓRDENES
        // ============================
        
       
            var ordersData = LogicaMercadoLibre.GetOrderIndividual(
            GetToken.access_token,
            parametrosML.ML_SELLER_ID,
            ID  );
            
      
        
       
   
        if (!ordersData || !Array.isArray(ordersData)) {
            throw new Error("GetOrdersByDateByHour no devolvió un array.");
        }

        for (var i = 0; i < ordersData.length; i++) {

            var order = ordersData[i];

            // ============================
            // VALIDAR SHIPPING
            // ============================
            if (!order.shipping || !order.shipping.id) 
            {
                $.trace.warning("Order " + order.id + " sin shipping.id");
                //continue;
            }
            else 
            {

            // ============================
            // OBTENER DIRECCIÓN (USA MISMO CLIENT)
            // ============================
            var direccion = LogicaMercadoLibre.GetDireccion(
                httpClient,
                GetToken.access_token,
                order.shipping.id
            );

            if (!direccion || !direccion.receiver_address) {
                $.trace.warning("Dirección inválida order " + order.id);
                continue;
            }

            var ra = direccion.receiver_address;

              var tipoOS = "MKPLACE";
                if (direccion.logistic_type === "self_service") 
                {
                    tipoOS = "FLEX";
                }
                else if(direccion.logistic_type === "fulfillment") 
                {
                    continue;
                }

            order.Direccion = {
                Comuna: (ra.city && ra.city.name) ? quitarTildes(ra.city.name.toUpperCase()): null,
                Calle: ra.street_name || null,
                Numero: ra.street_number || null,
                Direccion: ra.address_line || null,
                Ciudad: (ra.state && ra.state.name) ? ra.state.name : null,
                logistic_type: tipoOS,
                logistic_typeOrigen: direccion.logistic_type || null ,
                base_cost:direccion.base_cost||0,
                FechaVencimientoFinal: direccion.shipping_option.estimated_delivery_final.date||null,
                FechaVencimientoLimit: direccion.shipping_option.estimated_delivery_limit.date||null,
                FechaVencimientoTime: direccion.shipping_option.estimated_delivery_time.date||null,
                Recibido:ra.receiver_name||null
            };
            }

            // ============================
            // MÉTODOS DE PAGO
            // ============================
            order.MetodoPago = {
                existe_pago: false,
                pagos: []
            };

            if (order.payments && order.payments.length > 0) {

                order.MetodoPago.existe_pago = true;

                for (var ix = 0; ix < order.payments.length; ix++) {

                    var p = order.payments[ix];

                    if (p.status === "approved") {

                        order.MetodoPago.pagos.push({
                            payment_type: p.payment_type || null,
                            status: p.status || null,
                            metodo: p.payment_type || null,
                            metodoID: p.payment_method_id || null,
                            monto: Number(p.total_paid_amount || 0),
                            installments: p.installments || 1,
                            cupon: p.coupon_amount || 0,
                            id: p.id || null,
                            card_id: p.card_id || null
                        });
                    }
                }
            }

            // ============================
            // BILLING INFO (USA MISMO CLIENT)
            // ============================
            var billing = LogicaMercadoLibre.GetBilling_Info(
                httpClient,
                GetToken.access_token,
                order.id
            );

            if (!billing || !billing.billing_info) {
                $.trace.warning("Billing_Info vacío order " + order.id);
                continue;
            }

            order.Billing_Info = billing.billing_info;

            // ============================
            // CLIENTE FACTURACIÓN
            // ============================
            var info = order.Billing_Info.additional_info;

            order.ClienteFacturacion = {
                rut: formatearRut(getBillingValue(info, "DOC_NUMBER")),
                razon_Social: getBillingValue(info, "BUSINESS_NAME"),
                giro: getBillingValue(info, "ECONOMIC_ACTIVITY"),
                comuna: quitarTildes(getBillingValue(info, "NEIGHBORHOOD")),
                ciudad: quitarTildes(getBillingValue(info, "CITY_NAME")),
                region: getBillingValue(info, "STATE_NAME"),
                region_code: getBillingValue(info, "STATE_CODE"),
                calle: getBillingValue(info, "STREET_NAME"),
                numero: getBillingValue(info, "STREET_NUMBER"),
                pais: getBillingValue(info, "COUNTRY_ID")
            };

            // ============================
            // INSERTAR ORDEN
            // ============================
           

            resultado.ordenesValidas.push(order);
        }

        resultado.ok = true;
        resultado.total = resultado.ordenesValidas.length + resultado.ordenesInvalidas.length;

        return resultado;

    } catch (e) {
        $.trace.error("ObtenerOrdenesMLPorFecha ERROR: " + e.message);
        throw e;

    } finally {

        httpClient.close();   // 🔥 SOLO AQUÍ SE CIERRA
 
    }
}

function ObtenerConfiguracionMLOLD (CompanyDB,IdConexion){
    try
    {
         var query = 'SELECT * FROM "EXX_SAP_ECOMMERCE"."CONFIGURACIONES" WHERE  "ID_CONEXION" = \'' + IdConexion + '\' and "ESTADO" = 1 ';
             
          var conf = DBCONEX.ExecuteQueryFULL(CompanyDB, query);
         
         if (conf.rows.length > 0 )
            {
                var ObjetoConfiguracion={};
                
                ObjetoConfiguracion.ML_SELLER_ID = obtenerValor(conf, "ML_SELLER_ID");
                ObjetoConfiguracion.listaPrecios = obtenerValor(conf, "listaPrecios");
                ObjetoConfiguracion.socioNegocio = obtenerValor(conf, "socioNegocio");
                ObjetoConfiguracion.ML_CLIENT_ID = obtenerValor(conf, "ML_CLIENT_ID");
                ObjetoConfiguracion.token = obtenerValor(conf, "token");
                ObjetoConfiguracion.ML_CLIENT_SECRET = obtenerValor(conf, "ML_CLIENT_SECRET");
                ObjetoConfiguracion.almacen = obtenerValor(conf, "almacen");
                ObjetoConfiguracion.docFactura = obtenerValor(conf, "docFactura");
                ObjetoConfiguracion.docOrdenVenta = obtenerValor(conf, "docOrdenVenta");
                ObjetoConfiguracion.docPago = obtenerValor(conf, "docPago");
                ObjetoConfiguracion.ML_CREDIT_CARD = obtenerValor(conf, "ML_CREDIT_CARD");
                ObjetoConfiguracion.ML_DESPACHO = obtenerValor(conf, "ML_DESPACHO");
                ObjetoConfiguracion.docSerieFactura = obtenerValor(conf, "docSerieFactura");
                ObjetoConfiguracion.docSerieBoleta = obtenerValor(conf, "docSerieBoleta");
                ObjetoConfiguracion.docArtDespacho = obtenerValor(conf, "docArtDespacho");
                                                      
               
                return ObjetoConfiguracion;
            }
            else
            {
                 return null;
            }
    
        
    }
catch(e){
        return e;
    }
    
}
function ObtenerConfiguracionML(CompanyDB, IdConexion) {
    try {
        var query = 'SELECT * FROM "EXX_SAP_ECOMMERCE"."CONFIGURACIONES"' +
                    ' WHERE "ID_CONEXION" = \'' + IdConexion + '\' AND "ESTADO" = 1';

        var conf = DBCONEX.ExecuteQueryFULL(CompanyDB, query);

        if (conf.rows.length > 0) {
            var ObjetoConfiguracion = {};

            ObjetoConfiguracion.ML_SELLER_ID      = obtenerValor(conf, "ML_SELLER_ID");
            ObjetoConfiguracion.listaPrecios       = obtenerValor(conf, "listaPrecios");
            ObjetoConfiguracion.socioNegocio       = obtenerValor(conf, "socioNegocio");
            ObjetoConfiguracion.ML_CLIENT_ID       = obtenerValor(conf, "ML_CLIENT_ID");
            ObjetoConfiguracion.token              = obtenerValor(conf, "token");
            ObjetoConfiguracion.ML_CLIENT_SECRET   = obtenerValor(conf, "ML_CLIENT_SECRET");
            ObjetoConfiguracion.almacen            = obtenerValor(conf, "almacen");
            ObjetoConfiguracion.docFactura         = obtenerValor(conf, "docFactura");
            ObjetoConfiguracion.docOrdenVenta      = obtenerValor(conf, "docOrdenVenta");
            ObjetoConfiguracion.docPago            = obtenerValor(conf, "docPago");
            ObjetoConfiguracion.ML_CREDIT_CARD     = obtenerValor(conf, "ML_CREDIT_CARD");
            ObjetoConfiguracion.ML_DESPACHO        = obtenerValor(conf, "ML_DESPACHO");
            ObjetoConfiguracion.docSerieFactura    = obtenerValor(conf, "docSerieFactura");
            ObjetoConfiguracion.docSerieBoleta     = obtenerValor(conf, "docSerieBoleta");
            ObjetoConfiguracion.docArtDespacho     = obtenerValor(conf, "docArtDespacho");

            // Query dirección del socio de negocio
            var cardCode = (ObjetoConfiguracion.socioNegocio || "").trim();

            if (cardCode) {
                var queryCRD1 = 'SELECT "Address","Street","City","County","State"' +
                                ' FROM "' + CompanyDB + '".CRD1' +
                                ' WHERE "CardCode"= \'' + cardCode + '\' and "Address"= \'Facturacion\'';

                var resCRD1 = DBCONEX.ExecuteQueryFULL(CompanyDB, queryCRD1);

                if (resCRD1.rows.length > 0) {
                    ObjetoConfiguracion.Address = resCRD1.rows[0].Address;
                    ObjetoConfiguracion.Street  = resCRD1.rows[0].Street;
                    ObjetoConfiguracion.City    = resCRD1.rows[0].City;
                    ObjetoConfiguracion.County  = resCRD1.rows[0].County;
                    ObjetoConfiguracion.State   = resCRD1.rows[0].State;
                }
            }

            return ObjetoConfiguracion;

        } else {
            return null;
        }

    } catch (e) {
        return e;
    }
}

function GuardarConfiguracionML(CompanyDB, IdConexion, data) {
    try {
        data = data || {};

        var camposPermitidos = [
            "ML_SELLER_ID",
            "ML_CLIENT_ID",
            "token",
            "ML_CLIENT_SECRET",
            "listaPrecios",
            "socioNegocio",
            "almacen",
            "docFactura",
            "docOrdenVenta",
            "docPago",
            "ML_CREDIT_CARD",
            "ML_DESPACHO",
            "docSerieFactura",
            "docSerieBoleta",
            "docArtDespacho"
        ];

        var resultado = [];
        var totalActualizados = 0;

        for (var i = 0; i < camposPermitidos.length; i++) {
            var campo = camposPermitidos[i];

            if (!data.hasOwnProperty(campo)) {
                continue;
            }

            var valor = data[campo];
            if (valor === null || valor === undefined) {
                valor = "";
            }

            valor = String(valor).replace(/'/g, "''");

            var query =
                'UPDATE "EXX_SAP_ECOMMERCE"."CONFIGURACIONES" ' +
                'SET "VALOR" = \'' + valor + '\' ' +
                'WHERE "ID_CONEXION" = \'' + IdConexion + '\' ' +
                'AND "CONFIGURACION" = \'' + campo + '\' ' +
                'AND "ESTADO" = 1';

            var resp = DBCONEX.ExecuteQueryFULL(CompanyDB, query);

            if (!resp || resp.success !== true) {
                return {
                    ok: false,
                    error: "Error al actualizar " + campo,
                    detail: resp && resp.error ? resp.error : null
                };
            }

            totalActualizados += resp.rowsAffected || 0;
            resultado.push({
                campo: campo,
                rowsAffected: resp.rowsAffected || 0
            });
        }

        return {
            ok: true,
            rowsAffected: totalActualizados,
            detalle: resultado
        };

    } catch (e) {
        return {
            ok: false,
            error: e.message || e.toString()
        };
    }
}

function ObtenerEstadoJobs(CompanyDB) {

    try {

        var jobsEsperados = [
            "MercadoLibre::JobActualizarStock",
            "MercadoLibre::JobCargaOrdenes",
            "MercadoLibre::JobCrearOrdenes"
        ];

        var query =
            'SELECT * FROM "_SYS_XS"."JOB_SCHEDULES"';

        var data = DBCONEX.ExecuteQueryFULL(CompanyDB, query);

        var resultado = [];

        for (var i = 0; i < jobsEsperados.length; i++) {

            var nombreJob = jobsEsperados[i];
            var encontrado = false;
            var activo = "NO";
            var estado = "NO_ENCONTRADO";
            var detalle = "No aparece en JOB_SCHEDULES";

            if (data && data.rows && data.rows.length > 0) {

                for (var j = 0; j < data.rows.length; j++) {

                    var row = data.rows[j];
                    var textoFila = JSON.stringify(row);

                    if (textoFila.indexOf(nombreJob) >= 0) {

                        encontrado = true;
                        estado = "ENCONTRADO";
                        detalle = "Job encontrado en scheduler";

                        if (
                            textoFila.indexOf("ACTIVE") >= 0 ||
                            textoFila.indexOf("ENABLED") >= 0 ||
                            textoFila.indexOf("true") >= 0 ||
                            textoFila.indexOf("TRUE") >= 0
                        ) {
                            activo = "SI";
                        } else {
                            activo = "REVISAR";
                        }

                        break;
                    }
                }
            }

            resultado.push({
                nombre: nombreJob,
                estado: estado,
                activo: activo,
                jobActivo: "REVISAR_XS_ADMIN",
                scheduleActivo: activo,
                detalle: detalle
            });
        }

        return resultado;

    } catch (e) {

        return [{
            nombre: "CONSULTA_JOBS",
            estado: "ERROR",
            activo: "NO",
            detalle: e.message
        }];
    }
}

function obtenerValor(conf, nombreCampo) {
    
    if (!conf || !conf.rows) return null;
    
    for (var i = 0; i < conf.rows.length; i++) {
        var fila = conf.rows[i];
        if (fila.CONFIGURACION === nombreCampo) {
            return fila.VALOR;
        }
    }
    return null; // si no existe
}
function ObtenerTipoDocSAP(parametrosML) {
    var ov = parametrosML.docOrdenVenta === '1';
    var fa = parametrosML.docFactura === '1';

    if (ov && fa) {
        return 17; // Orden de Venta primero
    } else if (fa && !ov) {
        return 13; // Solo Factura
    } else if (ov && !fa) {
        return 17; // Solo OV
    }
    return null;
}
function RegistrarErroresEcommerce(resultados) {
    var dbLogs = "EXX_SAP_ECOMMERCE";

    for (var j = 0; j < resultados.length; j++) {
        var r = resultados[j];

        if (
            r.estado === "ERROR" ||
            r.estado === "SIN_TIPO" ||
            r.estado === "SIN_ORDENES" ||
            r.estado === "YA_EXISTE"
        ) {
            var mensajeEx = (r.mensaje || "Error");
            mensajeEx = mensajeEx.replace(/'/g, "''");

            var datosJSON = "";
            if (r.json) {
                try {
                    datosJSON = JSON.stringify(r.json);
                } catch (e) {
                    datosJSON = String(r.json);
                }
                datosJSON = datosJSON.replace(/'/g, "''");
            }

            var tipoSaf = (r.tipo !== undefined && r.tipo !== null) ? String(r.tipo) : "0";

            var queryErr = `
                INSERT INTO "${dbLogs}"."EXCEPCIONES" (
                    "CODIGO_EX",
                    "MENSAJE_EX",
                    "FECHA_EX",
                    "ID_OBJETO",
                    "ESTADO",
                    "CODIGO_REGISTRO",
                    "ID_CONEXION",
                    "DATOS"
                )
                VALUES (
                    -1,
                    '${mensajeEx}',
                    CURRENT_TIMESTAMP,
                    '${tipoSaf}',
                    0,
                    '${r.order_id || ""}',
                    13,
                    '${datosJSON}'
                )
            `;

            DBCONEX.ExecuteQueryFULL(dbLogs, queryErr);
        }
    }
}
function RegistrarErroresEcommerce_LogEcommerce(resultados) {
    try {

        if (!resultados || resultados.length === 0) {
            return;
        }

        for (var i = 0; i < resultados.length; i++) {

            var r = resultados[i];
            var idKey = r.order_id || r.ID_KEY;

            if (!idKey) {
                continue;
            }

            // ---------------------------
            // MAPEO DE ESTADOS
            // ---------------------------
            var estadoNum = 9; // ERROR por defecto

            switch (r.estado) {
                case "YA_EXISTE":
                    estadoNum = 2;
                    break;
                case "SIN_TIPO":
                    estadoNum = 4;
                    break;
                case "SIN_ORDENES":
                    estadoNum = 3;
                    break;
                case "TIPO_DESPACHO":
                    estadoNum = 8;
                    break;
                case "ERROR":
                default:
                    estadoNum = 9;
                    break;
            }

            // ---------------------------
            // MENSAJE
            // ---------------------------
            var mensaje = (r.mensaje || "Error no especificado");
            mensaje = String(mensaje).replace(/'/g, "''");

            // ---------------------------
            // JSON (OPCIONAL)
            // ---------------------------
            var jsonData = "";
            if (r.json) {
                try {
                    jsonData = JSON.stringify(r.json);
                } catch (e) {
                    jsonData = String(r.json);
                }
                jsonData = jsonData.replace(/'/g, "''");
            }

            // ---------------------------
            // SQL UPDATE
            // ---------------------------
            var sql =
                'UPDATE "EXX_SAP_ECOMMERCE"."LOG_ECOMMERCE" SET ' +
                    '"ESTADO" = ' + estadoNum + ', ' +
                    '"MENSAJE" = \'' + mensaje + '\', ' +
                    (jsonData ? '"XML_JSON" = \'' + jsonData + '\', ' : '') +
                    '"FECHA" = CURRENT_TIMESTAMP ' +
                'WHERE "ID_CONEXION" = \'' + Config.appConfig.IDConexionECOM + '\' ' +
                'AND "OBJETO" = \'OrdenML\' ' +
                'AND "ID_KEY" = \'' + idKey + '\'';

            DBCONEX.ExecuteQueryFULL(companies[0].CompanyDB, sql);
        }

    } catch (e) {
        $.trace.error("RegistrarErroresEcommerce_LogEcommerce error: " + e.message);
        throw e;
    }
}
function getBillingValue(additionalInfo, type) {
    if (!additionalInfo || !additionalInfo.length) return null;

    for (var i = 0; i < additionalInfo.length; i++) {
        if (additionalInfo[i].type === type) {
            return additionalInfo[i].value;
        }
    }
    return null;
}
function GetAllPublicacionesML(parametrosML) {

    var client = new $.net.http.Client();
    var publicaciones = [];
    var publicacionesActivas = [];
    var limit = 50;
    var scrollId = null;

    try {

        //  TOKEN
        var GetToken = LogicaMercadoLibre.RefreshToken_BodyParam(parametrosML);

        if (!GetToken || !GetToken.access_token) {
            throw new Error("No se pudo obtener access_token");
        }

        var dest = $.net.http.readDestination("MercadoLibre", "meli_token");

        //  TRAER TODOS LOS IDS (SCAN)
        while (true) {

            var path =
                "/users/" + parametrosML.ML_SELLER_ID + "/items/search" +
                "?search_type=scan" +
                "&limit=" + limit;

            if (scrollId) {
                path += "&scroll_id=" + encodeURIComponent(scrollId);
            }

            var req = new $.net.http.Request($.net.http.GET, path);
            req.timeout = 30000;
            req.headers.set("Authorization", "Bearer " + GetToken.access_token);
            req.headers.set("Accept", "application/json");

            client.request(req, dest);
            var resp = client.getResponse();

            if (resp.status !== 200) {
                throw new Error(
                    "Error ML publicaciones HTTP " +
                    resp.status + ": " + resp.body.asString()
                );
            }

            var data = JSON.parse(resp.body.asString());

            if (!data.results || data.results.length === 0) {
                break;
            }

            publicaciones = publicaciones.concat(data.results);
            scrollId = data.scroll_id;

            // protección XS
            if (publicaciones.length > 20000) {
                break;
            }
        }

        //  DETALLE + FILTRO SOLO ACTIVAS
        for (var i = 0; i < publicaciones.length; i++) {

            var itemId = publicaciones[i];

            var detalleResp = LogicaMercadoLibre.GetPublicacion(
                GetToken.access_token,
                itemId
            );

            if (!detalleResp || detalleResp.length === 0 || !detalleResp[0].body) {
                continue;
            }

            var item = detalleResp[0].body;

            // FILTRO REAL
            if (item.status !== "active") {
                continue;
            }
            var sku = item.seller_sku || GetSellerSKUFromAttributes(item.attributes);

            publicacionesActivas.push({
                IdMercadoLibre: item.id,
                Sku: sku || null,
                Titulo: item.title,
                Precio: item.price,
                Cantidad: item.available_quantity,
                UrlMercadoLibre: item.permalink,
                Moneda: item.currency_id,
                Categoria: item.category_id,
                TipoPublicacion: item.listing_type_id
            });
           // break;
        }

        return {
            estado: "OK",
            total: publicacionesActivas.length,
            items: publicacionesActivas
        };

    } catch (e) {
        return {
            estado: "ERROR",
            message: e.message || String(e),
            items: []
        };
    } finally {
        client.close(); //  FUNDAMENTAL
    }
}
function GetSellerSKUFromAttributes(attributes) {
    if (!attributes || !attributes.length) {
        return null;
    }

    for (var i = 0; i < attributes.length; i++) {
        if (attributes[i].id === "SELLER_SKU") {
            return attributes[i].value_name || null;
        }
    }
    return null;
}
function quitarTildes(texto) {

    if (!texto) {
        return texto;
    }

    texto = texto.replace(/[áàäâ]/g, "a");
    texto = texto.replace(/[ÁÀÄÂ]/g, "A");

    texto = texto.replace(/[éèëê]/g, "e");
    texto = texto.replace(/[ÉÈËÊ]/g, "E");

    texto = texto.replace(/[íìïî]/g, "i");
    texto = texto.replace(/[ÍÌÏÎ]/g, "I");

    texto = texto.replace(/[óòöô]/g, "o");
    texto = texto.replace(/[ÓÒÖÔ]/g, "O");

    texto = texto.replace(/[úùüû]/g, "u");
    texto = texto.replace(/[ÚÙÜÛ]/g, "U");

    texto = texto.replace(/ñ/g, "n");
    texto = texto.replace(/Ñ/g, "N");

    return texto;
}
