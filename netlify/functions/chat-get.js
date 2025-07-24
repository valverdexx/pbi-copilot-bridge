// netlify/functions/chat-get.js
// Aceita GET para contornar todas as restrições

exports.handler = async (event, context) => {
  // Headers CORS mais permissivos
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    let question = 'Pergunta não informada';
    let hasData = false;
    let rowCount = 0;

    // Aceita tanto GET quanto POST
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      question = params.question || params.q || 'Pergunta via GET';
      hasData = params.hasData === 'true';
      rowCount = parseInt(params.rowCount || '0');
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      question = body.question || 'Pergunta via POST';
      hasData = body.context?.hasData || false;
      rowCount = body.context?.rowCount || 0;
    }

    console.log('📊 Processando:', { question, hasData, rowCount, method: event.httpMethod });

    // Resposta inteligente simulada
    let answer = '';
    const q = question.toLowerCase();
    
    if (q.includes('total') || q.includes('soma')) {
      answer = `📊 ANÁLISE DE TOTAIS: Com base nos ${rowCount} registros disponíveis, posso calcular totais. ${hasData ? 'Dados carregados com sucesso!' : 'Nenhum dado disponível no momento.'}`;
    } else if (q.includes('vendas') || q.includes('receita') || q.includes('faturamento')) {
      answer = `💰 ANÁLISE DE VENDAS: Identificei ${rowCount} registros para análise de vendas. ${hasData ? 'Dados prontos para análise!' : 'Carregue dados de vendas no visual.'}`;
    } else if (q.includes('média') || q.includes('average')) {
      answer = `📈 CÁLCULO DE MÉDIAS: Calculando médias com ${rowCount} registros. ${hasData ? 'Processamento concluído!' : 'Adicione dados numéricos ao visual.'}`;
    } else {
      answer = `✅ Comunicação estabelecida! Sua pergunta: "${question}". Status dos dados: ${hasData ? `${rowCount} registros carregados` : 'Nenhum dado disponível'}. Método: ${event.httpMethod}`;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        answer,
        method: event.httpMethod,
        timestamp: new Date().toISOString(),
        dataStatus: { hasData, rowCount }
      })
    };

  } catch (error) {
    console.error('❌ Erro:', error);
    return {
      statusCode: 200, // Sempre retorna 200 para evitar erros de rede
      headers,
      body: JSON.stringify({ 
        answer: `❌ Erro interno: ${error.message}`,
        error: true
      })
    };
  }
};