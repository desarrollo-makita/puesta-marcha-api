/*const { obtenerPedidos } = require('../controllers/obtenerPedidosControllers.js');
const mock = require('../config/mock.js');
const axios = require('axios');

jest.mock('axios');
jest.mock('../config/logger');

describe('obtenerPedidos', () => {
  let req;
    let res;

    beforeEach(() => {
        req = {};
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
    });

  it('se realiza el proceso exitoso 200', async () => {
    // Mockear la respuesta de obtenerPedidos
    axios.get.mockResolvedValueOnce(mock.obtenerPedidosService);

    await obtenerPedidos(req, res);
       
    // Verificar que el estado y la respuesta JSON sean correctos
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      itemList: expect.any(Array),
      pedidos: expect.any(Array),
    }));
    
  });


    it('should return 404 when no data is found', async () => {
      axios.get.mockResolvedValue({ response: [] });
      
      await obtenerPedidos(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'No se encontraron pedidos pendientes para procesar' });
     
  });
  
  it('should handle error and return 500', async () => {
    const errorMessage = 'Network Error';
    axios.get.mockRejectedValue(new Error(errorMessage));

    await obtenerPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: `Error en el servidor [obtener-pedidos-ms] :  ${errorMessage}` });
});
    


});
*/