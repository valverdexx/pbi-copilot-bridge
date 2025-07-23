const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Configuração dos headers para permitir CORS (Cross-Origin Resource Sharing)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Responde a requisições OPTIONS (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Garante que o método seja POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    const { question, context } = JSON.parse(event.body);
    
    console.log('📊 Dados recebidos do Power BI:', {
      question,
      rowCount: context?.rowCount || 0,
      columns: context?.columns?.length || 0
    });

    const contextMessage = prepareContextForCopilot(context, question);
    const copilotResponse = await sendToCopilot(contextMessage);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        answer: copilotResponse,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Erro na função Netlify:', error);
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

// Prepara uma string de contexto para enviar ao Copilot
function prepareContextForCopilot(context, question) {
  if (!context || !context.hasData) {
    return `Pergunta: ${question}\n\nContexto: Nenhum dado disponível no momento.`;
  }
  let contextText = `Pergunta do usuário: "${question}"\n\n`;
  contextText += `Analise os seguintes dados do Power BI:\n`;
  contextText += `- Total de registros no filtro atual: ${context.rowCount}\n`;
  contextText += `- Campos disponíveis: ${context.columns.map(c => c.name).join(', ')}\n\n`;
  if (context.sampleData && context.sampleData.length > 0) {
    contextText += `Amostra de dados (primeiros ${Math.min(5, context.sampleData.length)} registros):\n`;
    context.sampleData.slice(0, 5).forEach((row, index) => {
      contextText += `${index + 1}. ${JSON.stringify(row)}\n`;
    });
  }
  return contextText;
}

// Função para comunicar com o Copilot Studio
async function sendToCopilot(message) {
  const directLineSecret = process.env.COPILOT_SECRET;
  if (!directLineSecret) {
    throw new Error("A variável de ambiente COPILOT_SECRET não está configurada na Netlify.");
  }

  try {
    // 1. Iniciar uma nova conversa para obter um conversationId e um token
    const convResponse = await fetch('https://directline.botframework.com/v3/directline/conversations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${directLineSecret}`
      }
    });
    if (!convResponse.ok) {
      throw new Error(`Erro ao iniciar conversa: ${convResponse.status} ${convResponse.statusText}`);
    }
    const conversationData = await convResponse.json();
    const { conversationId, token } = conversationData;

    // 2. Enviar a mensagem do usuário para a conversa recém-criada
    await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
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

    // 3. Aguardar e obter a resposta do bot
    // **ALTERAÇÃO AQUI:** Aumentamos o tempo de espera para 8 segundos
    await new Promise(resolve => setTimeout(resolve, 8000)); 

    const activitiesResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!activitiesResponse.ok) {
      throw new Error(`Erro ao obter atividades: ${activitiesResponse.status} ${activitiesResponse.statusText}`);
    }

    const activitiesData = await activitiesResponse.json();
    const botMessages = activitiesData.activities.filter(
      activity => activity.type === 'message' && activity.from.id !== 'PowerBIUser'
    );

    return botMessages.length > 0 ? botMessages[botMessages.length - 1].text : 'O Copilot não respondeu a tempo.';

  } catch (error) {
    console.error('Erro na comunicação com o Copilot:', error);
    throw new Error(`Erro no Copilot: ${error.message}`);
  }
}
