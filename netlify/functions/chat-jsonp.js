// src/visual.ts - VERSÃO JSONP (contorna CORS completamente)
import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualSettings } from "./settings";

export class Visual implements powerbi.extensibility.visual.IVisual {
    private target: HTMLElement;
    private settings: VisualSettings;
    private formattingSettingsService: FormattingSettingsService;
    private host: powerbi.extensibility.visual.IVisualHost;
    
    private chatContainer: HTMLElement;
    private dataContext: any = {};
    private sessionId: string;
    
    // URL da função JSONP (sem CORS)
    private netlifyEndpoint: string = 'https://copilotassistbi.netlify.app/.netlify/functions/chat-jsonp';

    constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
        this.target = options.element;
        this.host = options.host;
        this.formattingSettingsService = new FormattingSettingsService();
        
        this.sessionId = 'pbi_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        this.chatContainer = this.createSimpleChatInterface();
        this.target.appendChild(this.chatContainer);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.settings);
    }

    public update(options: powerbi.extensibility.visual.VisualUpdateOptions) {
        this.settings = this.formattingSettingsService.populateFormattingSettingsModel(VisualSettings, options.dataViews?.[0]);
        
        if (options.dataViews?.[0]) {
            this.dataContext = this.processDataView(options.dataViews[0]);
        }
    }

    // MÉTODO JSONP - Contorna CORS completamente
    private sendMessageToNetlify(message: string): Promise<string> {
        const endpoint = this.settings?.chatSettings?.directLineSecret?.value || this.netlifyEndpoint;
        
        return new Promise((resolve) => {
            console.log('📤 Usando JSONP para:', endpoint);
            
            // Gera nome único para callback
            const callbackName = 'jsonp_callback_' + Date.now();
            
            // Cria função callback global temporária
            (window as any)[callbackName] = function(data: any) {
                console.log('📥 JSONP resposta:', data);
                
                // Remove script e callback
                const script = document.getElementById('jsonp-script');
                if (script) script.remove();
                delete (window as any)[callbackName];
                
                // Resolve com a resposta
                if (data.error) {
                    resolve(`❌ Erro: ${data.error}`);
                } else {
                    resolve(data.answer || 'Resposta JSONP recebida');
                }
            };
            
            // Cria script tag para JSONP
            const script = document.createElement('script');
            script.id = 'jsonp-script';
            
            // Monta URL com parâmetros
            const params = new URLSearchParams({
                callback: callbackName,
                question: message,
                sessionId: this.sessionId,
                hasData: this.dataContext.hasData ? 'true' : 'false',
                rowCount: this.dataContext.rowCount?.toString() || '0'
            });
            
            script.src = `${endpoint}?${params.toString()}`;
            
            // Timeout para limpeza
            setTimeout(() => {
                if ((window as any)[callbackName]) {
                    delete (window as any)[callbackName];
                    const scriptEl = document.getElementById('jsonp-script');
                    if (scriptEl) scriptEl.remove();
                    resolve('❌ Timeout: Servidor não respondeu em 15s');
                }
            }, 15000);
            
            // Error handler
            script.onerror = function() {
                delete (window as any)[callbackName];
                resolve('❌ Erro ao carregar script JSONP');
            };
            
            // Adiciona script ao DOM para executar
            document.head.appendChild(script);
        });
    }

    private createSimpleChatInterface(): HTMLElement {
        const container = document.createElement('div');
        container.className = "simple-chat";
        container.innerHTML = `
            <div id="chatMessages" class="chat-messages">
                <div class="chat-message bot">
                    <div class="message-content">🚀 Testando JSONP (sem CORS)...</div>
                </div>
            </div>
            <div class="chat-input-area">
                <input type="text" id="chatInput" placeholder="Digite qualquer pergunta para testar" />
                <button id="sendButton">Enviar</button>
            </div>
        `;

        const input = container.querySelector('#chatInput') as HTMLInputElement;
        const button = container.querySelector('#sendButton') as HTMLButtonElement;
        const messages = container.querySelector('#chatMessages') as HTMLElement;

        const sendMessage = async () => {
            const message = input.value.trim();
            if (!message) return;

            this.addMessageToChat(messages, `Você: ${message}`, 'user');
            input.value = '';
            button.disabled = true;
            button.textContent = '🔄 Testando JSONP...';

            const response = await this.sendMessageToNetlify(message);
            
            const messageType = response.includes('❌') ? 'error' : 'bot';
            this.addMessageToChat(messages, response, messageType);

            button.disabled = false;
            button.textContent = 'Enviar';
            input.focus();
        };

        button.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        return container;
    }

    private addMessageToChat(container: HTMLElement, message: string, type: 'user' | 'bot' | 'error') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = message;
        
        messageDiv.appendChild(contentDiv);
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }
    
    private processDataView(dataView: powerbi.DataView): any {
        const context = { hasData: false, rowCount: 0, columns: [], sampleData: [] };
        if (!dataView?.categorical) return context;
        
        const categorical = dataView.categorical;
        if (!categorical.categories && !categorical.values) return context;
        
        context.hasData = true;
        
        const columns = [];
        if (categorical.categories) {
            columns.push(...categorical.categories.map(cat => ({ 
                name: cat.source.displayName, 
                type: 'categoria', 
                values: cat.values 
            })));
        }
        if (categorical.values) {
            columns.push(...categorical.values.map(val => ({ 
                name: val.source.displayName, 
                type: 'medida', 
                values: val.values 
            })));
        }
        
        context.columns = columns.map(c => ({ name: c.name, type: c.type }));
        const rowCount = columns[0]?.values.length || 0;
        context.rowCount = rowCount;
        
        return context;
    }
}