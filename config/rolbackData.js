const sql = require('mssql');
const { connectToDatabase, closeDatabaseConnection } = require('./database.js');
const logger = require('../config/logger.js');

async function rolbackData(data) {
    try {
       logger.info(`Iniciamos proceso de rollback`);
         let result;
        
        await connectToDatabase('Telecontrol');
        const request = new sql.Request(); // Nueva instancia de request en cada iteración
        result = await request
                .input('ID', sql.VarChar, data.toString())
                .execute('Telecontrol.dbo.BorrarDatosPuestaMarcha');
                
                logger.info(`Se elimina orden de servicio N° ${data}`);
                logger.info(`Fin del proceso rollback`);
    } catch (err) {
        console.error('Error al borrar data mediante el procedimiento almacenado BorrarDatos:', err.message);
    } finally {
        await closeDatabaseConnection();
    }
}

module.exports = {
    rolbackData
};