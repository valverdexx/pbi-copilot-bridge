// Crie este arquivo como netlify/functions/test.js para testar CORS

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin',
    'Content-Type': 'application/json'
  };

  // Responde a OPTIONS (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Responde a GET para teste no navegador
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        message: 'CORS funcionando!', 
        method: event.httpMethod,
        origin: event.headers.origin || 'sem origin'
      })
    };
  }

  // Responde a POST (simulando o Power BI)
  if (event.httpMethod === 'POST') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        message: 'POST funcionando!',
        received: event.body ? JSON.parse(event.body) : null
      })
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Método não suportado' })
  };
};