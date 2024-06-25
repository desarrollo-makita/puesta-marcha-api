const axios = require('axios');
const logger = require('../config/logger.js');
const { connectToDatabase, closeDatabaseConnection } = require('../config/database.js');
const sql = require('mssql');
require('dotenv').config();




/**
 * 
 * Generamos proceso para Puestas en marcha.
 * @returns 
 */
async function puestaMarcha(req , res){
    try{
       
        logger.info(`Iniciamos la funcion puestaMarcha`);
        let data;
        let  orderOk=[];
        let orderFailed=[];

        //microservicio obtener-entidades-ms
        logger.info(`Ejecuta microservcio obtener-entidades-ms`); 
        const arregloEntidades = await axios.get(`http://172.16.1.206:3022/ms/obtener-entidades`);
        logger.debug(`Respuesta microservcio obtener-entidades-ms ${JSON.stringify(arregloEntidades.data)}`); 
        
        if (!arregloEntidades || arregloEntidades.data.length === 0) {
            return res.status(200).json({ mensaje: `No se encontro una lista de servicio tecnico asociado a la consulta` });
        }

        // const obtenerOrdenesPendientes = await obtenerOrdenes(arregloEntidades);
        
        //microservicio obtener-ordenes-servicio-rut-ms
        logger.info(`Ejecuta microservcio obtener-ordenes-servicio-rut-ms`); 
        const obtenerOrdenesPendientes = await axios.post(`http://172.16.1.206:3007/ms/obtener-orden-servicio-rut`, arregloEntidades.data);
        logger.debug(`Respuesta microservcio obtener-ordenes-servicio-rut-ms ${JSON.stringify(obtenerOrdenesPendientes.data)}`); 
        
        logger.info(`Resultado ${JSON.stringify(obtenerOrdenesPendientes.data)}`);
        if ( obtenerOrdenesPendientes.data.length === 0) {
            return res.status(200).json({ mensaje: `No existe data para procesar` });
        }

        //buscar precio de mano de obra consultando api de producto de telecontrol
        const precioManoObra =  await obtenerPrecio(obtenerOrdenesPendientes.data);
        logger.info(`Resultado precioManoObra : ${JSON.stringify(precioManoObra)}`);

        //Organizamos la data necesaria para crear documento nota de vent ain terna para puestas en marcha.
        const resPreparaData = await preparaData(obtenerOrdenesPendientes.data, precioManoObra );
        
        // microservicio insertar-orden-ms
        logger.info(`Ejecuta microservcio insertar-orden-ms`); 
        const resInsertarOrden = await axios.post('http://172.16.1.206:3017/ms/insertar-orden', resPreparaData );
        
        for(element of resInsertarOrden.data){
            if(element.Insertado === 0){
                orderOk.push(element.resultadoID);
            }else{
                orderFailed.push(element.resultadoID)
            } 
        }
        
        const creaDocumento = await crearNotaventaInterna(resPreparaData);
        logger.info(`Status de respuesta :  Ingresadas : ${orderOk} , No ingresadas : ${orderFailed}`);
    
        res.status(200).json({ordenesIngresadas : orderOk , ordenesRepetidas : orderFailed});
       
    }catch (error) {
        console.log("error--->" , error);
        if (error.response && error.response.data) {
            const mensajeError = error.response.data.mensaje || error.response.data.error || error.response.data || 'Error desconocido';
            res.status(error.response.status || 500).json({ error: mensajeError });
        } else {
            res.status(500).json({ error: `Error en el servidor: ${error.message} || ${error.errors}` });
        }
        
    }
}

/**
 * Se obtienen el precio referente al producto que se encuentra en la orden.
 * @returns 
 */
async function obtenerPrecio(ordenesList){
    try {
        
        logger.info(`Iniciamos la función obtenerPrecio`);
        const data = ordenesList;
        let responseList = [];
        
        for(orden of data){
            
            const url = `http://api2.telecontrol.com.br/posvenda-core/produtos/referencia/${orden.referencia}`;
            logger.info(`URL :  ${url}`);

            const response = await axios.get(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Application-Key': '588b56a33c722da5e49170a311e872d9ee967291',
                    'Access-Env': 'PRODUCTION',
                    'X-Custom-Header': 'value'
                }
            });

            responseList.push(response.data);

        }
        
        logger.info(`Fin de la función obtenerPrecio`);
        return responseList;
    
    } catch (error) {
        
        logger.error(`Error en obtenerPrecioManoObra proceso-puesta-marcha-ms: ${error.message}`);
        throw error;
        
    }finally{
        await closeDatabaseConnection();
    }
}


/**
 * Crea nota de venta interna en qubys, llama sp Crea_NotaVentaInterna_PuestaOP
 * @param {Object} req - El objeto de solicitud HTTP.
 * @param {Object} res - El objeto de respuesta HTTP.
 */
async function crearNotaventaInterna(dataDocumentoList) {
    logger.info(`Iniciamos la funcion creaDocumento nota de venta interna`);
    try {
        // Conecta a la base de datos
        await connectToDatabase('BdQMakita');
        
        for(oredenPedido of dataDocumentoList){
            const { os: Correlativo, cnpj: RutCliente , mao_de_obra: ManoObra , produto: ProductoID  } = oredenPedido;
            const request = new sql.Request();
            // Ejecuta el procedimiento almacenado con los parámetros
            result = await request.query`
            EXEC Crea_NotaVentaInterna_PuestaOP 
            @Empresa        =   'Makita', 
            @TipoDocumento  =   'NOTA DE VTA INTERNA', 
            @Correlativo    =   ${Correlativo}, 
            @RutCliente     =   ${RutCliente},
            @ManoObra       =   ${ManoObra},
            @ItemDet        =   '${process.env.ITEM_PUESTA_MARCHA}',
            @ProductoID     =   ${ProductoID}`
        }
        
        logger.info(`Fin de la funcion creaDocumento ${JSON.stringify(result)}`);
        result.mensaje = 'Proceso exitoso , se creda nota venta interna';
        return result ;
    } catch (error) {
        // Manejamos cualquier error ocurrido durante el proceso
        logger.error(`Error en crear documento nota venta interna: ${error.message}`);
       
    }finally{
        // Cierra la conexión a la base de datos
        await closeDatabaseConnection();
    }
}


async function preparaData(ordenesPendientesList, precioManoObraList) {
    try {
        logger.info(`Inicio de la función preparaData`);

        // Crear un objeto para búsqueda rápida por referencia
        const referenciaMap = {};
        precioManoObraList.forEach(prod => {
            referenciaMap[prod.referencia] = {
                mao_de_obra: prod.mao_de_obra,
                produto: prod.produto,
                descricao: prod.descricao,
                garantia: prod.garantia
                
            };
        });

        // Crear un nuevo arreglo de órdenes pendientes con la información adicional
        const updatedOsData = ordenesPendientesList.map(os => {
            const additionalData = referenciaMap[os.referencia] || {};
            return {
                ...os,
                mao_de_obra: additionalData.mao_de_obra || '0',
                produto: additionalData.produto || null,
                descricao: additionalData.descricao || null,
                garantia: additionalData.garantia || null,

            };
        });

        logger.info(`Fin de la función preparaData ${JSON.stringify(updatedOsData)}`);

        //const resListaBasicareferencia = await listaReferencia(updatedOsData);



        

        return updatedOsData;

    } catch (error) {
        logger.error(`Error en preparaData ${error.message}`);
        throw error;
    }
}


module.exports = {
    puestaMarcha
};
