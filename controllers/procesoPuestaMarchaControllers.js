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

        const arregloEntidades = await obtenerEntidades();

        if (!arregloEntidades || arregloEntidades.length === 0) {
            return res.status(200).json({ mensaje: `No se encontro una lista de servicio tecnico asociado a la consulta` });
        }

        const obtenerOrdenesPendientes = await obtenerOrdenes(arregloEntidades);
        logger.info(`Resultado ${JSON.stringify(obtenerOrdenesPendientes)}`);
        if ( obtenerOrdenesPendientes.length === 0) {
            return res.status(200).json({ mensaje: `No existe data para procesar` });
        }

        //buscar precio de mano de obra consultando api de producto de telecontrol
        const precioManoObra =  await obtenerPrecio(obtenerOrdenesPendientes);
        logger.info(`Resultado precioManoObra : ${JSON.stringify(precioManoObra)}`);

        //Organizamos la data necesaria para crear documento nota de vent ain terna para puestas en marcha.
        const resPreparaData = await preparaData(obtenerOrdenesPendientes, precioManoObra );
        
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
        
        if (error.response && error.response.data) {
            const mensajeError = error.response.data.mensaje || error.response.data.error || error.response.data || 'Error desconocido';
            res.status(error.response.status || 500).json({ error: mensajeError });
        } else {
            res.status(500).json({ error: `Error en el servidor: ${error.message}` });
        }
        
    }

}

/**
 * 
 * @returns Arreglo de entidades
 */
async function obtenerEntidades(){
    try {
        
        logger.info(`Iniciamos la funcion obtenerEntidades`);
      
        await connectToDatabase('BdQMakita');
        
        const consulta = `select  Empresa, tipoEntidad , Entidad, Nombre , RazonSocial, Direccion
                          from BdQMakita.dbo.Entidad 
                          where tipoEntidad = 'Cliente' 
                          and Vigencia = 'S' 
                          and Categoria = 'Servicio Tecnico' 
                          and Empresa = 'Makita'
`;
        const result = await sql.query(consulta);
        logger.info(`Fin de la funcion obtenerEntidades`);

        return result.recordsets[0];
    } catch (error) {
        
        logger.error(`Error en obtenerEntidades: ${error.message}`);
        throw error;
        
    }finally{
        await closeDatabaseConnection();
    }
}


/**
 * Se obtienen ordenes de servicio utilizando rut de la entidad del servicio tecnico
 * @param {*} entidadesList 
 * @returns 
 */
async function obtenerOrdenes(entidadesList) {
    logger.info(`Iniciamos la función obtenerOrdenes`);

    try {
        const dateInicio = await fechaInicio();
        const dateFin = await fechaFin();
        let ordenesPendientesList = [];
        //const ordenesPendientesList2 = [{Entidad:'76890098-0' , Direccion:'SANTA ROSA1508-1510' }, {Entidad:'76279534-5',Direccion:'SANTA ROSA1508-1510'} , {Entidad:'16205650-8',Direccion:'SANTA ROSA1508-1510'},]; // se deja a modo de prueba
        for (const entidad of entidadesList) {
            try {
                entidad.Entidad = entidad.Entidad.replace(/-/g, '');
                const url = `http://backend2.telecontrol.com.br/homologation-os/ordem/cnpj/${entidad.Entidad}/dataInicio/${dateInicio}/dataFim/${dateFin}`;
                logger.info(`URL :  ${url}`);

                const response = await axios.get(url, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Application-Key': '3d137dea1d13220aa9a10ee57d69f6b30d247f28',
                        'Access-Env': 'HOMOLOGATION',
                        'X-Custom-Header': 'value'
                    }
                });

            if (response.data && response.data.os) {
                const updatedOs = response.data.os.map(os => ({
                    ...os,
                    direccion: entidad.Direccion
                  }));
                ordenesPendientesList = ordenesPendientesList.concat(updatedOs);
            }
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    logger.error(`Error ${JSON.stringify(error.response.data)}`);
                } else {
                    logger.error(`Error al procesar la entidad ${entidad.Entidad}: ${error.message}`);
                    throw error; 
                }
            }
        }

        const filtradas = ordenesPendientesList.filter(orden => orden.descricao_tipo_atendimento === "Puesta En Marcha")
                                               .map(orden => ({ ...orden, idPedido: null }));;


        logger.info(`Fin de la función obtenerOrdenes`);
        return filtradas;
    
    } catch (error) {
        logger.error(`Error general en obtenerOrdenes: ${error.message}`);
        throw error;
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
                    'Access-Application-Key': '3d137dea1d13220aa9a10ee57d69f6b30d247f28',
                    'Access-Env': 'HOMOLOGATION',
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

async function  fechaFin(){
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Los meses son 0-11
    const day = String(today.getDate()).padStart(2, '0'); // Los días son 1-31

    const formattedDate = `${year}-${month}-${day}`;
    return formattedDate;
}


async function fechaInicio(){
    const today = new Date();
    const back = new Date(today);
    back.setDate(today.getDate() - 30);

    const year = back.getFullYear();
    const month = String(back.getMonth() + 1).padStart(2, '0');
    const day = String(back.getDate()).padStart(2, '0');

    const formattedBackDate = `${year}-${month}-${day}`;

    return formattedBackDate;
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
        await connectToDatabase('DTEBdQMakita');
        
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
