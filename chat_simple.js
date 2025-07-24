// netlify/functions/chat-simple.js
// Função que responde diretamente sem chamar o Copilot (para teste)

exports.handler = async (event, context) => {
  console.log('📥 Requisição recebida via proxy');
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  try {
    const { question, context: dataContext } = JSON.parse(event.body);
    
    // Simula uma resposta inteligente baseada na pergunta
    let answer = '';
    const questionLower = question.toLowerCase();
    
    if (questionLower.includes('total') || questionLower.includes('soma')) {
      answer = `📊 Baseado nos ${dataContext?.rowCount || 0} registros disponíveis, identifiquei sua pergunta sobre totais. Esta é uma resposta simulada via proxy.`;
    } else if (questionLower.includes('vendas') || questionLower.includes('receita')) {
      answer = `💰 Análise de vendas: Com os dados filtrados (${dataContext?.rowCount || 0} registros), posso ajudar com análises de receita. Proxy funcionando!`;
    } else {
      answer = `✅ Proxy funcionando! Sua pergunta: "${question}". Dados disponíveis: ${dataContext?.hasData ? 'Sim' : 'Não'} (${dataContext?.rowCount || 0} registros)`;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    };

  } catch (error) {
    console.error('❌ Erro:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erro interno', 
        details: error.message 
      })
    };
  }
};