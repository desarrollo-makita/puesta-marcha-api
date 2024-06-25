const sql = require('mssql');
const { connectToDatabase, closeDatabaseConnection } = require('./database.js');

async function rolbackData(data) {
    try {
        console.log("dataaaaaa: ", data);
         let result;
        // Conectarse a la base de datos 'BdQMakita'
        await connectToDatabase('Telecontrol');
       
        for(id of data){

            const request = new sql.Request(); // Nueva instancia de request en cada iteración
       
            result = await request
                .input('ID', sql.VarChar, id.resultadoID.toString())
                .execute('Telecontrol.dbo.BorrarDatosPuestaMarcha');
                

        }
        
        console.log("resultado rolbackData : " , result);
    } catch (err) {
        console.error('Error al borrar data mediante el procedimiento almacenado BorrarDatos:', err.message);
    } finally {
        await closeDatabaseConnection();
    }
}

module.exports = {
    rolbackData
};