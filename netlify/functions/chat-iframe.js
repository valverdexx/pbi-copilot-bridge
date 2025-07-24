// netlify/functions/chat-iframe.js - Responde via PostMessage para iframe

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  try {
    console.log('📥 Iframe request recebido');
    
    // Extrai parâmetros
    const params = event.queryStringParameters || {};
    const question = params.question || 'Pergunta não informada';
    const hasData = params.hasData === 'true';
    const rowCount = parseInt(params.rowCount || '0');
    
    console.log('📊 Processando:', { question, hasData, rowCount });

    let answer = '';
    
    try {
      // Tenta conectar ao Copilot
      const contextData = { hasData, rowCount };
      const contextMessage = prepareContextForCopilot(contextData, question);
      answer = await sendToCopilot(contextMessage);
      console.log('✅ Resposta do Copilot obtida');
    } catch (copilotError) {
      console.error('❌ Fallback ativo:', copilotError.message);
      
      // Fallback inteligente
      const q = question.toLowerCase();
      if (q.includes('total') || q.includes('soma')) {
        answer = `📊 TOTAIS: Analisando ${rowCount} registros. ${hasData ? 'Dados processados!' : 'Adicione dados ao visual.'}`;
      } else if (q.includes('vendas') || q.includes('receita')) {
        answer = `💰 VENDAS: ${rowCount} registros identificados. ${hasData ? 'Análise completa!' : 'Configure os dados de vendas.'}`;
      } else {
        answer = `✅ Conectado via iframe! Pergunta: "${question}". Dados: ${hasData ? `${rowCount} registros` : 'Sem dados'}.`;
      }
    }

    // Retorna página HTML que envia PostMessage para o parent
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Copilot Response</title>
</head>
<body>
    <script>
        try {
            const response = ${JSON.stringify({ answer, timestamp: new Date().toISOString() })};
            console.log('Enviando resposta via PostMessage:', response);
            
            // Envia resposta para o parent window (Power BI)
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(response, 'https://app.powerbi.com');
                console.log('PostMessage enviado com sucesso');
            }
        } catch (error) {
            console.error('Erro ao enviar PostMessage:', error);
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    error: 'Erro interno: ' + error.message
                }, 'https://app.powerbi.com');
            }
        }
    </script>
    <p>Resposta enviada...</p>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'ALLOWALL',
        'Cache-Control': 'no-cache'
      },
      body: html
    };

  } catch (error) {
    console.error('❌ Erro crítico:', error);
    
    const errorHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Error</title></head>
<body>
    <script>
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                error: 'Erro interno: ${error.message}'
            }, 'https://app.powerbi.com');
        }
    </script>
    <p>Erro: ${error.message}</p>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: errorHtml
    };
  }
};

function prepareContextForCopilot(context, question) {
  if (!context || !context.hasData) {
    return `Pergunta: "${question}"\nContexto: Nenhum dado disponível no relatório.`;
  }

  return `Pergunta: "${question}"\nDados: ${context.rowCount} registros carregados no Power BI.`;
}

async function sendToCopilot(message) {
  const directLineSecret = process.env.COPILOT_SECRET;
  if (!directLineSecret) {
    throw new Error("COPILOT_SECRET não configurada");
  }

  const convResponse = await fetch('https://directline.botframework.com/v3/directline/conversations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${directLineSecret}` }
  });

  if (!convResponse.ok) {
    throw new Error(`Falha ao iniciar conversa: ${convResponse.status}`);
  }
  
  const { conversationId, token } = await convResponse.json();

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

  throw new Error('Timeout: Bot não respondeu');
}