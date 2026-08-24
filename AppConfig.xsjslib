var appConfig = {
    PackageDest : "CONEX",
    Log: true, //Define si el log esta activo o no.
	XShttpDest : "sb1sl",
	IDConexionECOM : "13",
    companies : [ {
		CompanyDB : "SBO_OHIGGINS", 
		UserName : "integraciones",
		//UserName : "manager",
		Password : "*Oh2025-",
		version : "v1" ,
		MedioPago: [
		    {
		      debit_card: 4  ,
		      credit_card: 4     ,
		      account_money: 4 ,
		      bank_transfer: 4 ,
		      prepaid_card: 4 ,
		      digital_currency : 4

		    }]
	} ]
};