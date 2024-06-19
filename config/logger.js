const winston = require('winston');
const moment = require('moment-timezone');
const { combine, timestamp, printf, json } = winston.format;


// Formateador personalizado para timestamp en la zona horaria de Chile
const timestampChile = winston.format((info) => {
  info.timestamp = moment().tz('America/Santiago').format('YYYY-MM-DD HH:mm:ss');
  return info;
});

const logger = winston.createLogger({
  level: 'debug',
  format: combine(
    timestampChile(),
    json(),
    printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'app.log' })
  ]
});

module.exports = logger;