// netlify/functions/chat-jsonp.js - VERSÃO CORRIGIDA

exports.handler = async (event, context) => {
  try {
    console.log('📥 JSONP Request recebido');
    console.log('Query params:', event.queryStringParameters);
    
    // Extrai parâmetros da URL
    const params = event.queryStringParameters || {};
    const callback = params.callback || 'callback';
    const question = params.question || 'Pergunta não informada';
    const sessionId = params.sessionId || 'sem-sessao';
    const hasData = params.hasData === 'true';
    const rowCount = parseInt(params.rowCount || '0');
    
    console.log('📊 Parâmetros extraídos:', { question, callback, hasData, rowCount });

    // Monta resposta de teste
    const response = {
      answer: `✅ JSONP funcionando perfeitamente! Pergunta: "${question}". Dados: ${hasData ? 'Sim' : 'Não'} (${rowCount} registros).`,
      timestamp: new Date().toISOString(),
      method: 'JSONP',
      sessionId: sessionId
    };

    // Cria resposta JSONP válida
    const jsonpResponse = `${callback}(${JSON.stringify(response)});`;
    
    console.log('📤 Enviando resposta JSONP');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: jsonpResponse
    };

  } catch (error) {
    console.error('❌ Erro na função JSONP:', error);
    
    // Resposta de erro em JSONP
    const callback = (event.queryStringParameters && event.queryStringParameters.callback) || 'callback';
    const errorResponse = `${callback}(${JSON.stringify({ 
      error: 'Erro interno da função', 
      details: error.message,
      timestamp: new Date().toISOString()
    })});`;

    return {
      statusCode: 200, // JSONP sempre retorna 200
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8'
      },
      body: errorResponse
    };
  }
};