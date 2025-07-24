// netlify/functions/chat.js
// VERSÃO MELHORADA: Com logs detalhados e tratamento de erros robusto

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Log inicial da requisição
  console.log('🚀 Função iniciada:', {
    method: event.httpMethod,
    timestamp: new Date().toISOString(),
    hasParams: !!event.queryStringParameters
  });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    // 1. Verificar variável de ambiente PRIMEIRO
    const directLineSecret = process.env.COPILOT_SECRET;
    if (!directLineSecret) {
      console.error('❌ COPILOT_SECRET não configurada');
      throw new Error("COPILOT_SECRET não configurada na Netlify. Verifique as variáveis de ambiente.");
    }
    console.log('✅ COPILOT_SECRET encontrada');

    // 2. Processar parâmetros
    const params = event.queryStringParameters || {};
    console.log('📝 Parâmetros recebidos:', Object.keys(params));

    const question = decodeURIComponent(params.question || '');
    if (!question) {
      throw new Error("Parâmetro 'question' é obrigatório.");
    }
    console.log('📥 Pergunta:', question.substring(0, 100) + '...');

    let contextData = {};
    if (params.context) {
      try {
        contextData = JSON.parse(decodeURIComponent(params.context));
        console.log('📊 Contexto carregado:', Array.isArray(contextData) ? `${contextData.length} registros` : 'objeto');
      } catch (parseError) {
        console.warn('⚠️ Erro ao parsear contexto:', parseError.message);
        contextData = {};
      }
    }

    // 3. Preparar mensagem e enviar
    const contextMessage = prepareContextForCopilot(contextData, question);
    console.log('📤 Enviando para Copilot...');
    
    const answer = await sendToCopilot(contextMessage, directLineSecret);
    
    console.log('✅ Resposta recebida do Copilot');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ answer })
    };

  } catch (error) {
    console.error('❌ Erro na função principal:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        answer: `Erro no servidor: ${error.message}. Verifique os logs para mais detalhes.`
      })
    };
  }
};

function prepareContextForCopilot(context, question) {
  if (!context || !Array.isArray(context) || context.length === 0) {
    console.log('ℹ️ Nenhum contexto de dados disponível');
    return `Pergunta do usuário: "${question}" (Contexto: Nenhum dado disponível no relatório do Power BI).`;
  }
  
  const columnNames = Object.keys(context[0] || {});
  console.log('📋 Colunas disponíveis:', columnNames);
  
  return `Analise os dados do Power BI para responder à pergunta. Pergunta: "${question}". Contexto: ${context.length} registos com as colunas: ${columnNames.join(', ') || 'N/A'}.`;
}

async function sendToCopilot(message, directLineSecret) {
  console.log('🤖 Iniciando comunicação com Copilot...');
  
  try {
    // 1. Iniciar conversa
    console.log('1️⃣ Iniciando nova conversa...');
    const convResponse = await fetch('https://directline.botframework.com/v3/directline/conversations', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${directLineSecret}`,
        'Content-Type': 'application/json'
      }
    });

    if (!convResponse.ok) {
      const errorText = await convResponse.text();
      console.error('❌ Erro ao iniciar conversa:', convResponse.status, errorText);
      throw new Error(`Falha ao iniciar conversa: ${convResponse.status} ${convResponse.statusText}`);
    }
    
    const conversationData = await convResponse.json();
    const { conversationId, token } = conversationData;
    console.log('✅ Conversa iniciada:', conversationId);

    // 2. Enviar mensagem
    console.log('2️⃣ Enviando mensagem...');
    const sendResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
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

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('❌ Erro ao enviar mensagem:', sendResponse.status, errorText);
      throw new Error(`Falha ao enviar mensagem: ${sendResponse.status}`);
    }
    console.log('✅ Mensagem enviada');

    // 3. Aguardar resposta com polling otimizado
    console.log('3️⃣ Aguardando resposta...');
    const maxAttempts = 4;
    const delayMs = 2000;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`🔄 Tentativa ${attempt}/${maxAttempts}...`);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));

      try {
        const activitiesResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (activitiesResponse.ok) {
          const { activities } = await activitiesResponse.json();
          const botMessages = activities.filter(a => a.type === 'message' && a.from.id !== 'PowerBI_User');

          console.log(`📨 ${botMessages.length} mensagens do bot encontradas`);

          if (botMessages.length > 0) {
            const lastMessage = botMessages[botMessages.length - 1];
            console.log('✅ Resposta encontrada!');
            return lastMessage.text || 'Resposta recebida mas sem texto.';
          }
        } else {
          console.warn(`⚠️ Erro ao buscar atividades: ${activitiesResponse.status}`);
        }
      } catch (pollError) {
        console.warn(`⚠️ Erro na tentativa ${attempt}:`, pollError.message);
      }
    }

    // Timeout
    throw new Error('O assistente demorou mais de 8 segundos para responder. Tente novamente.');

  } catch (error) {
    console.error('❌ Erro na comunicação com Copilot:', error);
    throw error;
  }
}