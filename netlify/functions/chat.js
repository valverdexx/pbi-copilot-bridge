const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Permitir CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Responder OPTIONS (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  try {
    // Parse dos dados do Power BI
    const { question, context, sessionId } = JSON.parse(event.body);
    
    console.log('📊 Dados recebidos do Power BI:', {
      question,
      rowCount: context?.rowCount || 0,
      columns: context?.columns?.length || 0,
      sessionId
    });

    // Preparar contexto para o Copilot
    const contextMessage = prepareContextForCopilot(context, question);
    
    // Conectar ao Copilot Studio via Direct Line
    const copilotResponse = await sendToCopilot(contextMessage, sessionId);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        answer: copilotResponse,
        contextInfo: `Analisando ${context?.rowCount || 0} registros com ${context?.columns?.length || 0} campos`,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Erro na function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Erro interno do servidor',
        details: error.message
      })
    };
  }
};

// Prepara contexto inteligente para o Copilot
function prepareContextForCopilot(context, question) {
  if (!context || !context.hasData) {
    return `Pergunta: ${question}\n\nContexto: Nenhum dado disponível no momento.`;
  }

  let contextText = `Pergunta: ${question}\n\n`;
  contextText += `📊 CONTEXTO DOS DADOS FILTRADOS:\n`;
  contextText += `- Total de registros: ${context.rowCount}\n`;
  contextText += `- Campos disponíveis: ${context.columns.map(c => c.name).join(', ')}\n\n`;

  if (context.sampleData && context.sampleData.length > 0) {
    contextText += `📋 AMOSTRA DOS DADOS (primeiros ${Math.min(5, context.sampleData.length)} registros):\n`;
    
    context.sampleData.slice(0, 5).forEach((row, index) => {
      contextText += `${index + 1}. `;
      Object.entries(row).forEach(([key, value]) => {
        contextText += `${key}: ${value}, `;
      });
      contextText = contextText.slice(0, -2) + '\n';
    });
  }

  contextText += `\n🤖 Por favor, analise estes dados filtrados e responda à pergunta de forma clara e objetiva.`;
  
  return contextText;
}

// Conecta ao Copilot Studio
async function sendToCopilot(message, sessionId) {
  const directLineSecret = process.env.COPILOT_SECRET;
  
  if (!directLineSecret) {
    throw new Error('COPILOT_SECRET não configurado');
  }

  try {
    // Primeira chamada: obter token de conversação
    const tokenResponse = await fetch('https://directline.botframework.com/v3/directline/tokens/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${directLineSecret}`,
        'Content-Type': 'application/json'
      }
    });

    if (!tokenResponse.ok) {
      throw new Error(`Erro ao obter token: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.token;
    const conversationId = tokenData.conversationId || sessionId;

    // Segunda chamada: enviar mensagem
    const messageResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'message',
        from: { id: 'PowerBIUser' },
        text: message
      })
    });

    if (!messageResponse.ok) {
      throw new Error(`Erro ao enviar mensagem: ${messageResponse.status}`);
    }

    // Terceira chamada: obter resposta (aguardar um pouco)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const activitiesResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!activitiesResponse.ok) {
      throw new Error(`Erro ao obter atividades: ${activitiesResponse.status}`);
    }

    const activitiesData = await activitiesResponse.json();
    const botMessages = activitiesData.activities.filter(activity => 
      activity.from.id !== 'PowerBIUser' && activity.type === 'message'
    );

    if (botMessages.length > 0) {
      return botMessages[botMessages.length - 1].text || 'Resposta recebida sem texto';
    }

    return 'Copilot não respondeu dentro do tempo esperado. Tente novamente.';

  } catch (error) {
    console.error('Erro na comunicação com Copilot:', error);
    throw new Error(`Erro no Copilot: ${error.message}`);
  }
}