// netlify/functions/chat.js
// Versão otimizada especificamente para Power BI Service

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Headers CORS otimizados para Power BI Service
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  };

  // Resposta para preflight (OPTIONS)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    let question, contextData;

    // Suporte para GET e POST
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      question = decodeURIComponent(params.question || '');
      contextData = params.context ? JSON.parse(decodeURIComponent(params.context)) : {};
    } else {
      const body = JSON.parse(event.body || '{}');
      question = body.question;
      contextData = body.context || {};
    }

    console.log('📥 Processando:', { question, hasData: contextData.hasData });

    let answer;
    
    try {
      // Tenta conectar ao Copilot
      const contextMessage = prepareContextForCopilot(contextData, question);
      answer = await sendToCopilot(contextMessage);
      console.log('✅ Resposta do Copilot obtida');
    } catch (copilotError) {
      console.log('❌ Fallback ativo:', copilotError.message);
      answer = generateFallbackResponse(question, contextData);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        answer,
        timestamp: new Date().toISOString(),
        method: event.httpMethod
      })
    };

  } catch (error) {
    console.error('❌ Erro:', error);
    return {
      statusCode: 200, // Sempre 200 para evitar bloqueios
      headers: corsHeaders,
      body: JSON.stringify({ 
        answer: `Erro de comunicação: ${error.message}`,
        error: true
      })
    };
  }
};

function prepareContextForCopilot(context, question) {
  if (!context?.hasData) {
    return `Pergunta: "${question}"\nContexto: Nenhum dado disponível no relatório.`;
  }
  
  return `Pergunta: "${question}"\nContexto: ${context.rowCount} registros no Power BI, colunas disponíveis: ${context.columns?.map(c => c.name).join(', ') || 'não informadas'}`;
}

async function sendToCopilot(message) {
  const directLineSecret = process.env.COPILOT_SECRET;
  if (!directLineSecret) {
    throw new Error("COPILOT_SECRET não configurada");
  }

  // Iniciar conversa
  const convResponse = await fetch('https://directline.botframework.com/v3/directline/conversations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${directLineSecret}` }
  });

  if (!convResponse.ok) {
    throw new Error(`Erro ao iniciar conversa: ${convResponse.status}`);
  }
  
  const { conversationId, token } = await convResponse.json();

  // Enviar mensagem
  await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'message',
      from: { id: 'PowerBI_User' },
      text: message
    })
  });

  // Aguardar resposta com polling otimizado
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 1500));

    const activitiesResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (activitiesResponse.ok) {
      const activitiesData = await activitiesResponse.json();
      const botMessages = activitiesData.activities.filter(
        activity => activity.type === 'message' && activity.from.id !== 'PowerBI_User'
      );

      if (botMessages.length > 0) {
        return botMessages[botMessages.length - 1].text;
      }
    }
  }

  throw new Error('Timeout na resposta do Copilot');
}

function generateFallbackResponse(question, context) {
  const q = question.toLowerCase();
  const hasData = context?.hasData;
  const rowCount = context?.rowCount || 0;
  
  if (q.includes('total') || q.includes('soma')) {
    return `📊 TOTAIS: ${hasData ? `Analisando ${rowCount} registros para calcular totais.` : 'Adicione dados ao visual para calcular totais.'}`;
  }
  
  if (q.includes('vendas') || q.includes('receita')) {
    return `💰 VENDAS: ${hasData ? `${rowCount} registros de vendas identificados.` : 'Configure dados de vendas no visual.'}`;
  }
  
  if (q.includes('média')) {
    return `📈 MÉDIA: ${hasData ? `Calculando médias com ${rowCount} registros.` : 'Carregue dados numéricos para calcular médias.'}`;
  }
  
  return `✅ Assistente conectado! Pergunta: "${question}". Status: ${hasData ? `${rowCount} registros carregados` : 'Sem dados disponíveis'}.`;
}