// netlify/functions/chat.js
// VERSÃO DEFINITIVA: Aumenta o timeout e otimiza a comunicação.

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Cabeçalhos CORS robustos para permitir a comunicação
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Resposta para a requisição de "pre-flight" OPTIONS que o navegador envia
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204, // No Content
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    let question, contextData;

    // Unifica o tratamento para GET (usado pelo visual) e POST (para testes futuros)
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      question = decodeURIComponent(params.question || '');
      contextData = params.context ? JSON.parse(decodeURIComponent(params.context)) : {};
    } else { // POST
      const body = JSON.parse(event.body || '{}');
      question = body.question;
      contextData = body.context || {};
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
  if (!context?.hasData) {
    return `Pergunta do usuário: "${question}" (Contexto: Nenhum dado disponível no relatório do Power BI).`;
  }
  return `Analise os dados do Power BI para responder à pergunta. Pergunta: "${question}". Contexto: ${context.rowCount} registos com as colunas: ${context.columns?.map(c => c.name).join(', ') || 'N/A'}.`;
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
  if (!convResponse.ok) throw new Error(`Falha ao iniciar conversa com o Direct Line: ${convResponse.statusText}`);
  
  const { conversationId, token } = await convResponse.json();

  // 2. Enviar a mensagem
  await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message', from: { id: 'PowerBI_User' }, text: message })
  });

  // 3. Aguardar resposta com polling (MUDANÇA PRINCIPAL)
  // Aumentamos o tempo de espera total para 30 segundos (12 tentativas x 2.5s)
  for (let i = 0; i < 12; i++) { 
    await new Promise(resolve => setTimeout(resolve, 2500)); // Espera 2.5 segundos

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

  // Se o loop terminar sem resposta, retorna o erro de timeout.
  throw new Error('Timeout de 30s excedido. O assistente demorou muito para responder.');
}
