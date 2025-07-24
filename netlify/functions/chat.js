const fetch = require('node-fetch');

// Função principal da Netlify
exports.handler = async (event, context) => {
  // Cabeçalhos CORS para permitir acesso de qualquer origem, especialmente do Power BI Online
  const headers = {
    'Access-Control-Allow-Origin': '*', // Permite qualquer domínio
    'Access-Control-Allow-Methods': 'GET, OPTIONS', // Permite apenas os métodos GET e OPTIONS
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // O navegador envia uma requisição "pre-flight" OPTIONS para verificar a permissão do CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204, // Resposta "No Content" é apropriada para pre-flight
      headers: headers,
      body: ''
    };
  }

  // A partir de agora, só aceitamos requisições GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405, // Método não permitido
      headers,
      body: JSON.stringify({ error: 'Este endpoint aceita apenas requisições GET.' })
    };
  }

  try {
    // Extrai os dados dos parâmetros da URL (query string)
    const { question, context: contextString } = event.queryStringParameters;
    console.log('📊 Pergunta recebida via GET:', question);

    // O contexto virá como uma string JSON, então precisamos fazer o parse
    const contextData = contextString ? JSON.parse(decodeURIComponent(contextString)) : {};

    // Prepara a mensagem para o Copilot
    const contextMessage = prepareContextForCopilot(contextData, question);
    
    // Envia a mensagem para o Copilot e aguarda a resposta
    const copilotResponse = await sendToCopilot(contextMessage);

    // Retorna a resposta com sucesso
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ answer: copilotResponse })
    };

  } catch (error) {
    console.error('❌ Erro na função Netlify:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Ocorreu um erro interno no servidor.',
        details: error.message
      })
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
  contextText += `- Colunas Disponíveis: ${context.columns.map(c => c.name).join(', ')}\n\n`;

  // Inclui uma pequena amostra dos dados se disponível
  if (context.sampleData && context.sampleData.length > 0) {
    contextText += `Amostra de Dados (até 5 registros):\n`;
    context.sampleData.slice(0, 5).forEach((row, index) => {
      contextText += `${index + 1}: ${JSON.stringify(row)}\n`;
    });
  }

  return contextText;
}

// Função para se comunicar com o Bot via Direct Line
async function sendToCopilot(message) {
  const directLineSecret = process.env.COPILOT_SECRET;
  if (!directLineSecret) {
    throw new Error("A variável de ambiente COPILOT_SECRET não foi configurada na Netlify.");
  }

  // 1. Iniciar uma nova conversa com o bot
  const convResponse = await fetch('https://directline.botframework.com/v3/directline/conversations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${directLineSecret}` }
  });

  if (!convResponse.ok) {
    throw new Error(`Falha ao iniciar conversa com o Direct Line: ${convResponse.status} ${convResponse.statusText}`);
  }
  const { conversationId, token } = await convResponse.json();

  // 2. Enviar a mensagem do usuário na conversa recém-criada
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

  // 3. Aguardar e buscar a resposta do bot (Polling)
  // Tenta buscar a resposta por até 20 segundos
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 2 segundos entre as tentativas

    const activitiesResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (activitiesResponse.ok) {
      const activitiesData = await activitiesResponse.json();
      // Filtra as mensagens que são do bot e não do usuário
      const botMessages = activitiesData.activities.filter(
        activity => activity.type === 'message' && activity.from.id !== 'PowerBI_Visual_User'
      );

      if (botMessages.length > 0) {
        // Retorna o texto da última mensagem do bot
        return botMessages[botMessages.length - 1].text;
      }
    }
  }

  throw new Error('O bot não respondeu a tempo (timeout de 20 segundos).');
}
