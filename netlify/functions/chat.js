// Forçando um novo deploy para sincronizar cabeçalhos de CORS
const fetch = require('node-fetch');

// Função principal da Netlify
exports.handler = async (event, context) => {
  // **CABEÇALHOS DE PERMISSÃO REFORÇADOS E SINCRONIZADOS**
  // Estes cabeçalhos correspondem exatamente à configuração robusta do netlify.toml
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Content-Type': 'application/json'
  };

  // Responde imediatamente a requisições de pre-flight (OPTIONS) do navegador
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204, // 204 No Content é a resposta padrão para pre-flight
      headers: headers,
      body: ''
    };
  }

  // Garante que o método seja POST para a execução principal
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    const { question, context } = JSON.parse(event.body);
    console.log('📊 Dados recebidos do Power BI:', { question });

    const contextMessage = prepareContextForCopilot(context, question);
    const copilotResponse = await sendToCopilot(contextMessage);
    
    return {
      statusCode: 200,
      headers, // Devolve os mesmos cabeçalhos na resposta final
      body: JSON.stringify({ answer: copilotResponse })
    };

  } catch (error) {
    console.error('❌ Erro na função Netlify:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erro interno do servidor', details: error.message })
    };
  }
};

// Prepara o contexto para o Copilot
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

// Lógica de Polling para comunicar com o Copilot
async function sendToCopilot(message) {
  const directLineSecret = process.env.COPILOT_SECRET;
  if (!directLineSecret) {
    throw new Error("A variável de ambiente COPILOT_SECRET não está configurada na Netlify.");
  }

  // 1. Inicia a conversa
  const convResponse = await fetch('https://directline.botframework.com/v3/directline/conversations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${directLineSecret}` }
  });
  if (!convResponse.ok) {
    throw new Error(`Erro ao iniciar conversa: ${convResponse.status}`);
  }
  const { conversationId, token } = await convResponse.json();

  // 2. Envia a mensagem
  await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message', from: { id: 'PowerBIUser' }, text: message })
  });

  // 3. Inicia o polling para buscar a resposta
  const maxAttempts = 10;
  const delay = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, delay));

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

  throw new Error('O Copilot não respondeu a tempo (20s).');
}
