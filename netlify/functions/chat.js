// netlify/functions/chat.js
// VERSÃO OTIMIZADA: Respeita o limite de 10 segundos de execução da Netlify.

const fetch = require('node-fetch');

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
    const params = event.queryStringParameters || {};
    const question = decodeURIComponent(params.question || '');
    const contextData = params.context ? JSON.parse(decodeURIComponent(params.context)) : {};

    if (!question) {
        throw new Error("A pergunta não foi fornecida.");
    }

    console.log('📥 Pergunta recebida:', question);

    const contextMessage = prepareContextForCopilot(contextData, question);
    const answer = await sendToCopilot(contextMessage);
    
    console.log('✅ Resposta do Copilot enviada com sucesso.');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ answer })
    };

  } catch (error) {
    console.error('❌ Erro na função principal:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        answer: `Erro no servidor: ${error.message}`
      })
    };
  }
};

function prepareContextForCopilot(context, question) {
  // Se não houver dados, informa o bot.
  if (!context || !context.length || context.length === 0) {
    return `Pergunta do usuário: "${question}" (Contexto: Nenhum dado disponível no relatório do Power BI).`;
  }
  // Extrai os nomes das colunas da primeira linha de dados
  const columnNames = Object.keys(context[0] || {});
  return `Analise os dados do Power BI para responder à pergunta. Pergunta: "${question}". Contexto: ${context.length} registos com as colunas: ${columnNames.join(', ') || 'N/A'}.`;
}

async function sendToCopilot(message) {
  const directLineSecret = process.env.COPILOT_SECRET;
  if (!directLineSecret) {
    throw new Error("A variável de ambiente COPILOT_SECRET não foi configurada na Netlify.");
  }

  // 1. Iniciar conversa
  const convResponse = await fetch('https://directline.botframework.com/v3/directline/conversations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${directLineSecret}` }
  });
  if (!convResponse.ok) throw new Error(`Falha ao iniciar conversa: ${convResponse.statusText}`);
  
  const { conversationId, token } = await convResponse.json();

  // 2. Enviar a mensagem
  await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message', from: { id: 'PowerBI_User' }, text: message })
  });

  // 3. Aguardar resposta com polling (DENTRO DO LIMITE DE 10 SEGUNDOS)
  // 4 tentativas de 2 segundos = 8 segundos de espera total.
  for (let i = 0; i < 4; i++) { 
    await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 2 segundos

    const activitiesResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (activitiesResponse.ok) {
      const { activities } = await activitiesResponse.json();
      const botMessages = activities.filter(a => a.type === 'message' && a.from.id !== 'PowerBI_User');

      if (botMessages.length > 0) {
        return botMessages[botMessages.length - 1].text; // Retorna a última mensagem do bot
      }
    }
  }

  // Se o loop terminar sem resposta, retorna um erro claro.
  throw new Error('O assistente demorou mais de 9 segundos para responder (limite do servidor). Tente novamente.');
}
