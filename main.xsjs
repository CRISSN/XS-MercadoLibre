var SLCONEX = $.import("CONEX", "SLCONEX");
var DBCONEX = $.import("CONEX", "DBCONEX");
var Logica =$.import("MercadoLibre.Logica", "Logica");
var MetodosMercadoLibre =$.import("MercadoLibre.Metodos", "Metodos");


var Config = $.import("MercadoLibre", "AppConfig");
var respuesta = null;
/* Variables Globales */
var companies = Config.appConfig.companies;
/* Variables Globales */


function ActualizarStock()
{
     
          try
     {
        var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(companies[0].CompanyDB, Config.appConfig.IDConexionECOM);
         var  ActualizaItem = MetodosMercadoLibre.ActualizarStockV2(parametrosML) ; 
     }
     catch (e) 
     {
         throw (e);
     }
     
     
}
function ActualizarStockBatch()
{
    try
    {
        var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(
            companies[0].CompanyDB,
            Config.appConfig.IDConexionECOM
        );
        return MetodosMercadoLibre.ActualizarStockBatch(
            parametrosML,
            Config.appConfig.StockBatchSize
        );
    }
    catch (e)
    {
        throw (e);
    }
}
function ActualizarStockBatchMasivo()
{
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

        $.trace.info(
            "ActualizarStockBatchMasivo OK. Total: " +
            (resultado ? resultado.length : 0)
        );
        return resultado;
    }
    catch (e)
    {
        $.trace.error(
            "ActualizarStockBatchMasivo ERROR: " +
            (e.message || String(e))
        );
        throw e;
    }
}
function ReprocesarErroresStockBatch()
{
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

        $.trace.info(
            "ReprocesarErroresStockBatch OK. Total: " +
            (resultado ? resultado.total : 0) +
            " | Resueltos: " + (resultado ? resultado.resueltos : 0) +
            " | Errores: " + (resultado ? resultado.errores : 0)
        );
        return resultado;
    }
    catch (e)
    {
        $.trace.error(
            "ReprocesarErroresStockBatch ERROR: " +
            (e.message || String(e))
        );
        throw e;
    }
}
function CrearOrdenes() {

    var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(
        companies[0].CompanyDB,
        Config.appConfig.IDConexionECOM
    );

    try {

        var ordenes = MetodosMercadoLibre.CrearOrdenesV3(parametrosML,10);

        $.trace.info("CrearOrdenes OK. Total: " + 
                     (ordenes ? ordenes.total : 0));

        return ordenes;

    } catch (e) {

        $.trace.error("CrearOrdenes ERROR: " + 
                      (e.message || String(e)));

        throw e; // importante si quieres que el job marque error
    }
}


function ObtenerOrdenes() {

    var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(
        companies[0].CompanyDB,
        Config.appConfig.IDConexionECOM
    );

    try {

        var ordersData = MetodosMercadoLibre.ObtenerOrdenesMLPorFecha(parametrosML,'',1);

        $.trace.info("ObtenerOrdenes OK. Total: " + 
                     (ordersData ? ordersData.total : 0));

        return ordersData;

    } catch (e) {

        $.trace.error("ObtenerOrdenes ERROR: " + 
                      (e.message || String(e)));

        throw e; // importante si quieres que el job marque error
    }
}



function ReprocesarOrdenes()
{
  
    try
     {
        
         var parametrosML =MetodosMercadoLibre.ObtenerConfiguracionML(companies[0].CompanyDB, Config.appConfig.IDConexionECOM);
         var ordenes= MetodosMercadoLibre.ReprocesoV3(parametrosML,'');
     }
     catch (e) 
     {
         throw (e);
     }
    
}



function ObtenerOrdenesCicloDia() {
    var parametrosML = MetodosMercadoLibre.ObtenerConfiguracionML(companies[0].CompanyDB, Config.appConfig.IDConexionECOM);

    try {
        
        var ordersData = MetodosMercadoLibre.ObtenerOrdenesMLPorFecha(parametrosML,'2025-12-15',0);

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



/*
try

{ 
    
   //1.-STOCK 
    //ActualizarStock();
    
    //2.- PRECIO
    //ActualizarPrecio();
    
    
   //3.- 
   //ObtenerOrdenes();
   
   
   //4.- OBTENER TODAS LAS ORDENES 24 HORAS ATRAS SOLO MUESTRA
   //ObtenerOrdenesMLDIA();
   //INSERTA
   //ObtenerOrdenesCicloDia();
    
    
    //ReprocesarOrdenes();
  
   //CrearOrdenes(1);
   

 //ActualizarPublicacion();
  //ActualizarPrecio();
   
    //CrearPublicacion();
  //ObtenerPublicaciones(); 
  
    
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
    */
    
    


