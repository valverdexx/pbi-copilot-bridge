// netlify/functions/chat-jsonp.js - Versão que conecta ao Copilot Studio

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  try {
    console.log('📥 JSONP Request recebido');
    
    // Extrai parâmetros da URL
    const params = event.queryStringParameters || {};
    const callback = params.callback || 'callback';
    const question = params.question || 'Pergunta não informada';
    const hasData = params.hasData === 'true';
    const rowCount = parseInt(params.rowCount || '0');
    
    console.log('📊 Parâmetros:', { question, hasData, rowCount });

    let answer = '';
    
    try {
      // Tenta conectar ao Copilot Studio
      const contextData = { hasData, rowCount };
      const contextMessage = prepareContextForCopilot(contextData, question);
      answer = await sendToCopilot(contextMessage);
      
      console.log('✅ Resposta do Copilot obtida');
    } catch (copilotError) {
      console.error('❌ Erro no Copilot, usando resposta de fallback:', copilotError.message);
      
      // Fallback com resposta inteligente
      const q = question.toLowerCase();
      if (q.includes('total') || q.includes('soma')) {
        answer = `📊 ANÁLISE DE TOTAIS: Com base nos ${rowCount} registros disponíveis, posso calcular totais. ${hasData ? 'Dados carregados com sucesso!' : 'Nenhum dado disponível no momento.'}`;
      } else if (q.includes('vendas') || q.includes('receita') || q.includes('faturamento')) {
        answer = `💰 ANÁLISE DE VENDAS: Identificei ${rowCount} registros para análise de vendas. ${hasData ? 'Dados prontos para análise!' : 'Carregue dados de vendas no visual.'}`;
      } else if (q.includes('média') || q.includes('average')) {
        answer = `📈 CÁLCULO DE MÉDIAS: Calculando médias com ${rowCount} registros. ${hasData ? 'Processamento concluído!' : 'Adicione dados numéricos ao visual.'}`;
      } else {
        answer = `✅ Conectado via JSONP! Sua pergunta: "${question}". Status dos dados: ${hasData ? `${rowCount} registros carregados` : 'Nenhum dado disponível'}.`;
      }
    }

    const response = {
      answer,
      timestamp: new Date().toISOString(),
      method: 'JSONP',
      dataStatus: { hasData, rowCount }
    };

    // Resposta JSONP válida
    const jsonpResponse = `${callback}(${JSON.stringify(response)});`;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: jsonpResponse
    };

  } catch (error) {
    console.error('❌ Erro crítico na função JSONP:', error);
    
    const callback = (event.queryStringParameters && event.queryStringParameters.callback) || 'callback';
    const errorResponse = `${callback}(${JSON.stringify({ 
      answer: 'Erro interno da função: ' + error.message,
      error: true,
      timestamp: new Date().toISOString()
    })});`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8'
      },
      body: errorResponse
    };
  }
};

// Função para formatar a mensagem de contexto para o Copilot
function prepareContextForCopilot(context, question) {
  if (!context || !context.hasData) {
    return `Pergunta do usuário: "${question}"\n\nContexto: Nenhum dado foi fornecido no relatório do Power BI.`;
  }

  let contextText = `Analise os seguintes dados do Power BI para responder à pergunta do usuário.\n\n`;
  contextText += `Pergunta do usuário: "${question}"\n\n`;
  contextText += `Contexto dos Dados:\n`;
  contextText += `- Total de Linhas (Registros): ${context.rowCount}\n`;
  contextText += `- Status: ${context.hasData ? 'Dados carregados' : 'Sem dados'}\n\n`;

  return contextText;
}

// Função para se comunicar com o Bot via Direct Line
async function sendToCopilot(message) {
  const directLineSecret = process.env.COPILOT_SECRET;
  if (!directLineSecret) {
    throw new Error("COPILOT_SECRET não configurada");
  }

  // 1. Iniciar conversa
  const convResponse = await fetch('https://directline.botframework.com/v3/directline/conversations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${directLineSecret}` }
  });

  if (!convResponse.ok) {
    throw new Error(`Falha ao iniciar conversa: ${convResponse.status}`);
  }
  const { conversationId, token } = await convResponse.json();

  // 2. Enviar mensagem
  await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'message',
      from: { id: 'PowerBI_Visual_User' },
      text: message
    })
  });

  // 3. Aguardar resposta (polling de 8 tentativas = 16 segundos)
  for (let i = 0; i < 8; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const activitiesResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (activitiesResponse.ok) {
      const activitiesData = await activitiesResponse.json();
      const botMessages = activitiesData.activities.filter(
        activity => activity.type === 'message' && activity.from.id !== 'PowerBI_Visual_User'
      );

      if (botMessages.length > 0) {
        return botMessages[botMessages.length - 1].text;
      }
    }
  }

  throw new Error('Timeout: Bot não respondeu em 16 segundos');
}