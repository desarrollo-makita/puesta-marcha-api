const axios = require('axios');
const logger = require('../config/logger.js');
const { connectToDatabase, closeDatabaseConnection } = require('../config/database.js');
const sql = require('mssql');
require('dotenv').config();
const { rolbackData } = require('../config/rolbackData.js');
const moment = require('moment');





/**
 * 
 * Generamos proceso para Puestas en marcha.
 * @returns 
 */
async function puestaMarcha(req , res){
    let data;
    let orderOk=[];
    let orderFailed=[];
   try{
       
        logger.info(`Iniciamos la funcion puestaMarcha`);
       

        //microservicio obtener-entidades-ms
        logger.info(`Ejecuta microservcio obtener-entidades-ms`); 
        const arregloEntidades = await axios.get(`http://172.16.1.206:3022/ms/obtener-entidades`);
        logger.debug(`Respuesta microservcio obtener-entidades-ms ${JSON.stringify(arregloEntidades.data)}`); 
        
        if (!arregloEntidades || !arregloEntidades.data || arregloEntidades.data.length === 0) {
            logger.info(`No se registraron clientes`); 
            return res.status(200).json({ mensaje: `No se encontro una lista de servicio tecnico asociado a la consulta` });
        }else{
            
            //microservicio obtener-ordenes-servicio-rut-ms
            logger.info(`Ejecuta microservcio obtener-ordenes-servicio-rut-ms`); 
            const obtenerOrdenesPendientes = await axios.post(`http://172.16.1.206:3007/ms/obtener-orden-servicio-rut`, arregloEntidades.data);
            logger.debug(`Respuesta microservicio obtener-ordenes-servicio-rut-ms ${JSON.stringify(obtenerOrdenesPendientes.data)}`);
            
            if (!obtenerOrdenesPendientes || !obtenerOrdenesPendientes.data || obtenerOrdenesPendientes.data.length === 0) {
                return res.status(200).json({ mensaje: `No existen ordenes de puesta en marcha para procesar` });
            }

            // preparamos data para insertar orden de servicio sin documentos
            const resData = await agregarDocumento(obtenerOrdenesPendientes.data);
            
            // microservicio insertar-orden-ms
            logger.info(`Ejecuta microservcio insertar-orden-ms`); 
            const resInsertarOrden = await axios.post('http://172.16.1.206:3017/ms/insertar-orden', resData );
            console.log("12345678" , resInsertarOrden);
            for(element of resInsertarOrden.data){
                if(element.Insertado === 0){
                    orderOk.push(element);
                    
                }else{
                    orderFailed.push(element);
                } 
            }
            
            if(orderOk.length > 0){
                
               
                //microservicio insertar-documentos-ms
                logger.info(`Ejecuta microservcio insertar-documentos-ms`); 
                const responseDocumentos = await axios.post(`http://172.16.1.206:3023/ms/insertar-documentos`, resData);
                logger.debug(`Respuesta microservcio insertar-documentos-ms ${JSON.stringify(responseDocumentos.data)}`);
            
            }
            
            
            return res.status(200).json({ok : orderOk , NOOK : orderFailed , nuevo:  responseDocumentos.data });
       }
        
    }catch (error) {
        if (error.response && error.response.data) {
            const mensajeError = error.response.data.mensaje || error.response.data.error || error.response.data || 'Error desconocido';
            res.status(error.response.status || 500).json({ error: mensajeError });
        } else {
            res.status(500).json({ error: `Error en el servidor: ${error.message} || ${error.errors}` });
        }
        
    }
}

/**
 * Bug de telecontrol se cra esta funcion para adjuntar documento al objeto ordenServicio 
 * @param {*} dataList 
 * @returns {dataFormatedList} 
 */
async function agregarDocumento(dataList){
    logger.info(`Iniciamos la funcion agregarDocumento`);
    let dataArchivos;
    let os_anexos = [];
    let dataFormatedList = [];
    
    try {
        
        for(element of dataList){
            try {
                // Consultamos la orden de servicio en el servicio de telecontrol
                response = await axios.get(`http://api2.telecontrol.com.br/os/ordem/os/${element.os}`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Application-Key': '588b56a33c722da5e49170a311e872d9ee967291',
                        'Access-Env': 'PRODUCTION',
                        'X-Custom-Header': 'value'
                    }
                });
                if (response && response.data && response.data.response) {
                    dataArchivos =  response.data.response;
                    if (dataArchivos.hasOwnProperty("")) {
                        
                        os_anexos = dataArchivos[""].os_anexos;
                        // Agregamos la propiedad idPedido a la orden de servicio
                        const osArrayWithIdPedido = response.data.os
                        .map(obj => ({ ...obj, arregloLink :os_anexos, idPedido: 0  }));
                        dataFormatedList.push(...osArrayWithIdPedido);
                    }
                }
                
                
            } catch (err) {
                if (err.response && err.response.status === 404) {
                    logger.info(`Orden de servicio no encontrada: ${element.os}`);
                } else {
                    throw err; // Relanza el error si no es un 404
                }
            }

        }
        
        logger.info(`Fin de la funcion agregarDocumento`);
        return dataFormatedList;

    } catch (err) {
        console.log("Error : " , err);
    }

}

/**
 * 
 * @param {*} dataDocumentoList 
 * @returns 
 */
async function crearNotaventaInterna(dataDocumentoList) {
    logger.info(`Iniciamos la funcion creaDocumento nota de venta interna`);
    
    let ingresadas =[];
    let noIngresadas =[];
    
    try {
        
        
        for (const ordenPedido of dataDocumentoList) {
            const correlativo = ordenPedido.os;
            // Conecta a la base de datos
            await connectToDatabase('DTEBdQMakita');
            try {
                const { os: Correlativo, cnpj: RutCliente, mao_de_obra: ManoObra, produto: ProductoID } = ordenPedido;
                const request = new sql.Request();

                // Eliminar espacios en blanco de los parámetros
                
                const rutCliente = RutCliente.trim();
                const manoObra = ManoObra.trim();
                const itemDet = process.env.ITEM_PUESTA_MARCHA.trim();
                const productoID = ProductoID;

                // Ejecuta el procedimiento almacenado con los parámetros
                const result = await request.query`
                    EXEC Crea_NotaVentaInterna_PuestaOP
                    @Empresa        =   'Makita', 
                    @TipoDocumento  =   'NOTA DE VTA INTERNA', 
                    @Correlativo    =   ${correlativo}, 
                    @RutCliente     =   ${rutCliente},
                    @ManoObra       =   ${manoObra},
                    @ItemDet        =   '${process.env.ITEM_PUESTA_MARCHA}',
                    @ProductoID     =   ${productoID}`;

                logger.info(`Documento creado exitosamente para correlativo ${correlativo}`);
                ingresadas.push(correlativo);
                result.mensaje = 'Proceso exitoso, se creó nota venta interna';
                console.log(result); // Puedes hacer algún manejo específico del resultado aquí

            } catch (error) {
                
                noIngresadas.push(correlativo);
                await rolbackData(correlativo);
                // Manejar el error específico de esta ejecución
                logger.error(`Error en la creación del documento: ${error.message}`);
                // Puedes decidir si quieres continuar o no con el siguiente documento
                continue; // Continúa con el siguiente documento
            }
        }

        logger.info(`Fin de la función creaDocumento`);
        return { mensaje: 'Proceso completado', ordenIngresadas : ingresadas , ordenNoIngresdas : noIngresadas };

    } catch (error) {
        // Manejar cualquier error general que ocurra fuera del bucle
        logger.error(`Error general en crear documento nota venta interna: ${error.message}`);
        throw error;
    } finally {
        // Cierra la conexión a la base de datos
        await closeDatabaseConnection();
    }
}




module.exports = {
    puestaMarcha
};
