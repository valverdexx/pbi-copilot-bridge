const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Headers CORS mais específicos para Power BI
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };

  // Resposta para preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: headers,
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
    const { question, context } = JSON.parse(event.body);
    console.log('📊 Pergunta recebida:', question);

    const contextMessage = prepareContextForCopilot(context, question);
    const copilotResponse = await sendToCopilot(contextMessage);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ answer: copilotResponse })
    };

  } catch (error) {
    console.error('❌ Erro:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erro interno', 
        details: error.message 
      })
    };
  }
};

function prepareContextForCopilot(context, question) {
  if (!context || !context.hasData) {
    return `Pergunta: ${question}\n\nContexto: Nenhum dado disponível.`;
  }
  
  let contextText = `Pergunta: "${question}"\n\n`;
  contextText += `Dados do Power BI:\n`;
  contextText += `- Registros: ${context.rowCount}\n`;
  contextText += `- Campos: ${context.columns.map(c => c.name).join(', ')}\n\n`;
  
  if (context.sampleData && context.sampleData.length > 0) {
    contextText += `Amostra (${Math.min(3, context.sampleData.length)} registros):\n`;
    context.sampleData.slice(0, 3).forEach((row, i) => {
      contextText += `${i + 1}. ${JSON.stringify(row)}\n`;
    });
  }
  
  return contextText;
}

async function sendToCopilot(message) {
  const directLineSecret = process.env.COPILOT_SECRET;
  if (!directLineSecret) {
    throw new Error("COPILOT_SECRET não configurada");
  }

  // Inicia conversa
  const convResponse = await fetch('https://directline.botframework.com/v3/directline/conversations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${directLineSecret}` }
  });
  
  if (!convResponse.ok) {
    throw new Error(`Erro ao iniciar conversa: ${convResponse.status}`);
  }
  
  const { conversationId, token } = await convResponse.json();

  // Envia mensagem
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

  // Polling para resposta
  for (let i = 0; i < 8; i++) {
    await new Promise(resolve => setTimeout(resolve, 2500));

    const activitiesResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (activitiesResponse.ok) {
      const activitiesData = await activitiesResponse.json();
      const botMessages = activitiesData.activities.filter(
        activity => activity.type === 'message' && activity.from.id !== 'PowerBIUser'
      );

      if (botMessages.length > 0) {
        return botMessages[botMessages.length - 1].text;
      }
    }
  }

  throw new Error('Copilot não respondeu em 20s');
}