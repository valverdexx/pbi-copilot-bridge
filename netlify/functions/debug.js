// netlify/functions/debug.js
// Função para verificar se as variáveis de ambiente estão configuradas

exports.handler = async (event, context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    // Verificar variáveis de ambiente
    const copilotSecret = process.env.COPILOT_SECRET;
    
    // Info de debug (sem expor a chave completa)
    const debugInfo = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      hasSecret: !!copilotSecret,
      secretLength: copilotSecret ? copilotSecret.length : 0,
      secretPreview: copilotSecret ? `${copilotSecret.substring(0, 8)}...` : 'NOT SET',
      environment: process.env.NODE_ENV || 'not set',
      queryParams: event.queryStringParameters,
      method: event.httpMethod
    };

    console.log('🔍 Debug Info:', debugInfo);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        status: 'debug_success',
        info: debugInfo
      })
    };

  } catch (error) {
    console.error('❌ Erro na função debug:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        status: 'debug_error',
        error: error.message,
        stack: error.stack
      })
    };
  }
};