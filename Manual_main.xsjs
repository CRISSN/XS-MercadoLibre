var SLCONEX = $.import("CONEX", "SLCONEX");
var DBCONEX = $.import("CONEX", "DBCONEX");
var Logica =$.import("MercadoLibre.Logica", "Logica");
var MetodosMercadoLibre =$.import("MercadoLibre.Metodos", "Metodos");

var Config = $.import("MercadoLibre", "AppConfig");
var respuesta = null;
/* Variables Globales */
var companies = Config.appConfig.companies;
/* Variables Globales */


function ActualizarStockV2()
{
     
          try
     {
        var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(companies[0].CompanyDB, Config.appConfig.IDConexionECOM);
         var  ActualizaItem = MetodosMercadoLibre.ActualizarStockV2(parametrosML) ; 
         
            // 👉 Devolver las órdenes al cliente
        $.response.contentType = "application/json";
        $.response.status = $.net.http.OK;

        $.response.setBody(JSON.stringify({
            ok: true,
            total: ActualizaItem.length,
            data: ActualizaItem
        }, null, 2));
         
     }

     catch (e) 
     {
          // 👉 Devolver error al cliente
        $.response.contentType = "application/json";
        $.response.status = $.net.http.INTERNAL_SERVER_ERROR;

        $.response.setBody(JSON.stringify({
            ok: false,
            error: e.message || String(e)
        }, null, 2));
    }
     }
     
function ActualizarStockBatchMasivo()
{
    var fechaInicio = new Date();

    try
    {
        var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(
            companies[0].CompanyDB,
            Config.appConfig.IDConexionECOM
        );
        var resultado = MetodosMercadoLibre.ActualizarStockBatchMasivo(
            parametrosML,
            20
        );
        var fechaTermino = new Date();
        var totalErrores = 0;

        for (var i = 0; i < resultado.length; i++) {
            if (resultado[i] && resultado[i].estado === "ERROR") {
                totalErrores++;
            }
        }

        $.response.contentType = "application/json";
        $.response.status = $.net.http.OK;
        $.response.setBody(JSON.stringify({
            ok: true,
            total: resultado.length,
            errores: totalErrores,
            horaInicio: fechaInicio.toISOString(),
            horaTermino: fechaTermino.toISOString(),
            duracionSegundos: Math.round(
                (fechaTermino.getTime() - fechaInicio.getTime()) / 1000
            ),
            data: resultado
        }, null, 2));

    }
    catch (e)
    {
        var fechaError = new Date();

        $.response.contentType = "application/json";
        $.response.status = $.net.http.INTERNAL_SERVER_ERROR;
        $.response.setBody(JSON.stringify({
            ok: false,
            error: e.message || String(e),
            horaInicio: fechaInicio.toISOString(),
            horaTermino: fechaError.toISOString(),
            duracionSegundos: Math.round(
                (fechaError.getTime() - fechaInicio.getTime()) / 1000
            )
        }, null, 2));
    }
}

function ReprocesarErroresStockBatch()
{
    var fechaInicio = new Date();

    try
    {
        var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(
            companies[0].CompanyDB,
            Config.appConfig.IDConexionECOM
        );
        var resultado = MetodosMercadoLibre.ReprocesarErroresStockBatch(
            parametrosML,
            3
        );
        var fechaTermino = new Date();

        $.response.contentType = "application/json";
        $.response.status = $.net.http.OK;
        $.response.setBody(JSON.stringify({
            ok: true,
            estado: resultado.estado,
            total: resultado.total,
            resueltos: resultado.resueltos,
            errores: resultado.errores,
            omitidosPorIntentos: resultado.omitidosPorIntentos,
            maxIntentos: resultado.maxIntentos,
            horaInicio: fechaInicio.toISOString(),
            horaTermino: fechaTermino.toISOString(),
            duracionSegundos: Math.round(
                (fechaTermino.getTime() - fechaInicio.getTime()) / 1000
            ),
            data: resultado.resultado
        }, null, 2));

    }
    catch (e)
    {
        var fechaError = new Date();

        $.response.contentType = "application/json";
        $.response.status = $.net.http.INTERNAL_SERVER_ERROR;
        $.response.setBody(JSON.stringify({
            ok: false,
            error: e.message || String(e),
            horaInicio: fechaInicio.toISOString(),
            horaTermino: fechaError.toISOString(),
            duracionSegundos: Math.round(
                (fechaError.getTime() - fechaInicio.getTime()) / 1000
            )
        }, null, 2));
    }
}

function CrearOrdenes(CantidadProceso)
{
  
    try
     {
        
         var parametrosML =MetodosMercadoLibre.ObtenerConfiguracionML(companies[0].CompanyDB, Config.appConfig.IDConexionECOM);
         var ordenes= MetodosMercadoLibre.CrearOrdenesV3(parametrosML,CantidadProceso);
     }
     catch (e) 
     {
         throw (e);
     }
    
}
function ObtenerOrdenes() {
    var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(companies[0].CompanyDB, Config.appConfig.IDConexionECOM);

    try {
         var ordersData = MetodosMercadoLibre.ObtenerOrdenesMLPorFecha(parametrosML,'',1);

        // 👉 Devolver las órdenes al cliente
        $.response.contentType = "application/json";
        $.response.status = $.net.http.OK;

        $.response.setBody(JSON.stringify({
            ok: true,
            total: ordersData.length,
            data: ordersData
        }, null, 2));

    } catch (e) {

        // 👉 Devolver error al cliente
        $.response.contentType = "application/json";
        $.response.status = $.net.http.INTERNAL_SERVER_ERROR;

        $.response.setBody(JSON.stringify({
            ok: false,
            error: e.message || String(e)
        }, null, 2));
    }
}

function ObtenerDevoluciones(fecha, claimId) {
    var fechaInicio = new Date();

    try {
        var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(
            companies[0].CompanyDB,
            Config.appConfig.IDConexionECOM
        );
        var idClaim = claimId || 0;
        var tipo = fecha ? 0 : 1;
        var resultado = MetodosMercadoLibre.ObtenerDevolucionesMLPorFecha(
            parametrosML,
            fecha || "",
            tipo,
            idClaim
        );
        var fechaTermino = new Date();

        $.response.contentType = "application/json";
        $.response.status = $.net.http.OK;
        $.response.setBody(JSON.stringify({
            ok: resultado.ok,
            total: resultado.total,
            insertadas: resultado.devolucionesInsertadas.length,
            existentes: resultado.devolucionesExistentes.length,
            invalidas: resultado.devolucionesInvalidas.length,
            resultado: resultado,
            horaInicio: fechaInicio.toISOString(),
            horaTermino: fechaTermino.toISOString(),
            duracionSegundos: Math.round(
                (fechaTermino.getTime() - fechaInicio.getTime()) / 1000
            )
        }, null, 2));
    } catch (e) {
        var fechaError = new Date();

        $.response.contentType = "application/json";
        $.response.status = $.net.http.INTERNAL_SERVER_ERROR;
        $.response.setBody(JSON.stringify({
            ok: false,
            error: e.message || String(e),
            horaInicio: fechaInicio.toISOString(),
            horaTermino: fechaError.toISOString(),
            duracionSegundos: Math.round(
                (fechaError.getTime() - fechaInicio.getTime()) / 1000
            )
        }, null, 2));
    }
}

function ReprocesarOrdenes(Tipo)
{
  
    try
     {
        
         var parametrosML =MetodosMercadoLibre.ObtenerConfiguracionML(companies[0].CompanyDB, Config.appConfig.IDConexionECOM);
         var ordenes= MetodosMercadoLibre.ReprocesoV3(parametrosML,Tipo);
     }
     catch (e) 
     {
         throw (e);
     }
    
}

function ObtenerOrdenesCicloDia() {
    var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(companies[0].CompanyDB, Config.appConfig.IDConexionECOM);

    try {
        
        var ordersData = MetodosMercadoLibre.ObtenerOrdenesMLPorFecha(parametrosML,'2026-04-29',0);

        // 👉 Devolver las órdenes al cliente
        $.response.contentType = "application/json";
        $.response.status = $.net.http.OK;

       
        $.response.setBody(JSON.stringify({
            ok: ordersData.ok,
            total: ordersData.total,
            OrdenValidas: ordersData.ordenesValidas,
            OrdenInvalidas: ordersData.ordenesInvalidas
        }, null, 2));

    } catch (e) {

        // 👉 Devolver error al cliente
        $.response.contentType = "application/json";
        $.response.status = $.net.http.INTERNAL_SERVER_ERROR;

        $.response.setBody(JSON.stringify({
            ok: false,
            error: e.message || String(e)
        }, null, 2));
    }
}

function ObtenerOrdenesMLDIA() {
    var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(companies[0].CompanyDB, Config.appConfig.IDConexionECOM);

    try {
        
         var GetToken = Logica.RefreshToken_BodyParam(parametrosML);
        if (!GetToken || GetToken.status === 400) {
            throw new Error("Error al obtener Token: " + GetToken.message);
        }

        // ============================
        // OBTENER ÓRDENES EN BLOQUES 30 MIN
        // ============================
        var ordersData = Logica.GetOrdersTodayBy30Min(
                        GetToken.access_token,
                        parametrosML.ML_SELLER_ID
                    );

        // 👉 Devolver las órdenes al cliente
        $.response.contentType = "application/json";
        $.response.status = $.net.http.OK;

        $.response.setBody(JSON.stringify({
            ok: ordersData.ok,
            total: ordersData.total,
            OrdenValidas: ordersData.ordenesValidas,
            OrdenInvalidas: ordersData.ordenesInvalidas
        }, null, 2));

    } catch (e) {

        // 👉 Devolver error al cliente
        $.response.contentType = "application/json";
        $.response.status = $.net.http.INTERNAL_SERVER_ERROR;

        $.response.setBody(JSON.stringify({
            ok: false,
            error: e.message || String(e)
        }, null, 2));
    }
}

try

{ 
    
    
    //ActualizarPrecioV2();
    //ActualizarStockV2();
    //ActualizarStockBatchMasivo();
    //ReprocesarErroresStockBatch();
    //ObtenerDevoluciones("", 0); // última hora
    ObtenerDevoluciones("2026-08-10", 0); // día completo
    //ObtenerDevoluciones("", 1234567890); // claim puntual
    
  //ObtenerOrdenesCicloDia();
  // ObtenerOrdenesMLDIA();
    
    //ReprocesarOrdenes();
  
   //CrearOrdenes(1);
   
  
    
}
catch (e) {
    if(e.name === 'SyntaxError'){
        $.response.contentType = "application/json"; 
        $.response.status = $.net.http.NOT_ACCEPTABLE;
        $.response.setBody(JSON.stringify(e.message));
    }else{
        $.response.contentType = "application/json"; 
        $.response.status = $.net.http.INTERNAL_SERVER_ERROR;
        $.response.setBody(JSON.stringify(e.message));
    }
    
}
    
    
    
