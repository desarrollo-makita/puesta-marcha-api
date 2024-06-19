const sql = require('mssql');
require('dotenv').config();

async function connectToDatabase(databaseName) {
    const config = {
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        server: process.env.DB_SERVER,
        database: databaseName,
        options: {
            encrypt: false
        }
    };

    try {
        await sql.connect(config);
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error.message);
        throw error;
    }
}

async function closeDatabaseConnection() {
    try {
        await sql.close();
        console.log('Conexión a la base de datos cerrada');
    } catch (error) {
        console.error('Error al cerrar la conexión a la base de datos:', error.message);
        throw error;
    }
}

module.exports = { connectToDatabase, closeDatabaseConnection };
