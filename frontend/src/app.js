import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, BarChart3, Package, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import './App.css';

const SupplyChainChatbot = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [connectionError, setConnectionError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const initializationTimeout = useRef(null);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Check health status
  const checkHealth = async () => {
    try {
      const response = await fetch('http://localhost:8000/health');
      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Health check error:', error);
      throw error;
    }
  };

  // Get introduction message
  const getIntroduction = async () => {
    try {
      const response = await fetch('http://localhost:8000/introduction');
      if (response.ok) {
        const data = await response.json();
        return data.introduction;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Introduction error:', error);
      // Fallback message
      return `¡Hola! Soy tu Asistente de IA para Cadena de Suministro.

Puedo ayudarte con:
• Análisis de inventarios y niveles de stock  
• Evaluación del rendimiento de proveedores
• Pronósticos de demanda y planificación
• Identificación de riesgos en la cadena de suministro

**Nota**: Hay algunos problemas de conectividad. Algunas funciones pueden estar limitadas.

¿En qué puedo ayudarte?`;
    }
  };

  // Initialize chat with retry logic
  const initializeChat = async (retryCount = 0) => {
    const maxRetries = 3;
    
    try {
      setIsInitializing(true);
      setConnectionError(null);

      // Check backend health
      const healthData = await checkHealth();
      
      if (healthData.agent_ready) {
        setIsConnected(true);
        
        // Get introduction
        const intro = await getIntroduction();
        setMessages([{
          id: 1,
          type: 'bot',
          content: intro,
          timestamp: new Date()
        }]);
        
        setIsInitializing(false);
        
      } else if (healthData.error) {
        throw new Error(`Inicialización fallida: ${healthData.error}`);
      } else {
        // Agent is still initializing
        if (retryCount < maxRetries) {
          console.log(`Agent still initializing, retry ${retryCount + 1}/${maxRetries}`);
          setTimeout(() => initializeChat(retryCount + 1), 2000);
        } else {
          throw new Error('El agente está tomando más tiempo del esperado para inicializarse');
        }
      }
      
    } catch (error) {
      console.error('Initialization error:', error);
      setConnectionError(error.message);
      setIsConnected(false);
      setIsInitializing(false);
      
      // Set fallback welcome message
      setMessages([{
        id: 1,
        type: 'bot',
        content: `¡Hola! Soy tu Asistente de IA para Cadena de Suministro.

**Problema de conexión detectado**

Estoy funcionando en modo limitado. Puedes intentar:
• Verificar que el servidor backend esté ejecutándose
• Refrescar la página
• Contactar al administrador del sistema

Aún puedo ayudarte con preguntas generales sobre cadena de suministro.

Error: ${error.message}`,
        timestamp: new Date()
      }]);
    }
  };

  // Initialize on mount
  useEffect(() => {
    initializeChat();
    
    // Cleanup timeout on unmount
    return () => {
      if (initializationTimeout.current) {
        clearTimeout(initializationTimeout.current);
      }
    };
  }, []);

  // Real API call to agent
  const sendMessageToAgent = async (message) => {
    setIsLoading(true);
    
    try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      setIsLoading(false);
      return data.response;
    } catch (error) {
      setIsLoading(false);
      console.error('Error calling agent:', error);
      throw error;
    }
  };

  // Función auxiliar para parsear tablas Markdown
  const parseMarkdownTable = (lines, startIndex) => {
    const headers = [];
    const rows = [];
    let currentIndex = startIndex;

    // Parse header row
    const headerLine = lines[currentIndex].trim();
    const headerCells = headerLine.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
    headers.push(...headerCells);

    // Skip separator row
    currentIndex += 2;

    // Parse data rows
    while (currentIndex < lines.length) {
      const line = lines[currentIndex].trim();
      
      // Stop if we hit an empty line or a line that doesn't look like a table row
      if (line === '' || !line.includes('|')) {
        break;
      }

      const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
      if (cells.length > 0) {
        rows.push(cells);
      }
      
      currentIndex++;
    }

    return {
      headers,
      rows,
      endIndex: currentIndex
    };
  };

  // Formatear mensaje con soporte para tablas
  const formatMessage = (text) => {
    if (!text) return '';

    const lines = text.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (line === '') {
        i++;
        continue;
      }

      // Check if this line starts a table (contains | characters)
      if (line.includes('|') && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        
        // Check if next line is a separator row (contains | and -)
        if (nextLine.includes('|') && nextLine.includes('-')) {
          // Parse table
          const tableData = parseMarkdownTable(lines, i);
          result.push(
            <div key={result.length} className="message-table-container">
              <table className="message-table">
                <thead>
                  <tr>
                    {tableData.headers.map((header, index) => (
                      <th key={index}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          i = tableData.endIndex;
          continue;
        }
      }

      // Handle other formatting (existing code)
      if (line.startsWith('##')) {
        result.push(
          <h3 key={result.length} className="message-title">
            {line.replace(/^##\s*/, '')}
          </h3>
        );
      } else if (line.startsWith('#')) {
        result.push(
          <h4 key={result.length} className="message-subtitle">
            {line.replace(/^#\s*/, '')}
          </h4>
        );
      } else if (line.includes('**')) {
        const formattedText = line.split('**').map((part, idx) => 
          idx % 2 === 1 ? <strong key={idx}>{part}</strong> : part
        );
        result.push(
          <p key={result.length} className="message-paragraph">
            {formattedText}
          </p>
        );
      } else if (line.startsWith('-') || line.startsWith('•')) {
        result.push(
          <li key={result.length} className="message-list-item">
            {line.replace(/^[-•]\s*/, '')}
          </li>
        );
      } else {
        result.push(
          <p key={result.length} className="message-paragraph">
            {line}
          </p>
        );
      }
      
      i++;
    }

    return result;
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      id: messages.length + 1,
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');

    try {
      const response = await sendMessageToAgent(currentInput);
      
      const botMessage = {
        id: messages.length + 2,
        type: 'bot',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      let errorMessage = 'Lo siento, encontré un error procesando tu solicitud.';
      
      if (error.message.includes('503')) {
        errorMessage = 'El agente se está inicializando todavía. Por favor, espera unos segundos e inténtalo de nuevo.';
      } else if (error.message.includes('500')) {
        errorMessage = 'Error interno del servidor. Por favor, verifica que todos los servicios estén ejecutándose correctamente.';
      } else if (error.message.includes('fetch')) {
        errorMessage = 'No se puede conectar con el servidor. Verifica que el backend esté ejecutándose en http://localhost:8000';
      }
      
      const botErrorMessage = {
        id: messages.length + 2,
        type: 'bot',
        content: `⚠ **Error de conexión**\n\n${errorMessage}\n\n**Detalles técnicos**: ${error.message}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botErrorMessage]);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleRetryConnection = () => {
    setMessages([]);
    initializeChat();
  };

  const quickActions = [
    { icon: BarChart3, label: 'Análisis rápido', action: 'Dame un breve análisis de rendimiento del último mes' },
    { icon: Package, label: 'Revisar locaciones', action: 'Dame las 5 ubicaciones con mayor cantidad de entregas' },
    { icon: TrendingUp, label: 'Predicción de demanda', action: 'Haz un pronóstico de demanda para septiembre de 2025' },
    { icon: AlertCircle, label: 'Detección de riesgos', action: 'Identifica riesgos o patrones problemáticos en nuestras entregas' }
  ];

  const handleQuickAction = (action) => {
    setInputValue(action);
  };

  const getConnectionStatus = () => {
    if (isInitializing) return { text: 'Inicializando...', class: 'connecting' };
    if (connectionError) return { text: 'Error de conexión', class: 'error' };
    if (isConnected) return { text: 'Conectado', class: 'connected' };
    return { text: 'Desconectado', class: 'disconnected' };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="app">
      <div className="chat-container">
        {/* Header */}
        <div className="header">
          <div className="header-content">
            <div className="header-left">
              <div className="bot-icon">
                <Bot size={24} />
              </div>
              <div className="header-text">
                <h1>Supply Chain AI Assistant</h1>
                <p>MCP-Powered Analytics Agent</p>
              </div>
            </div>
            <div className="connection-status">
              <div className={`status-dot ${connectionStatus.class}`}></div>
              <span>{connectionStatus.text}</span>
              {connectionError && (
                <button 
                  onClick={handleRetryConnection} 
                  className="retry-button"
                  title="Reintentar conexión"
                >
                  <RefreshCw size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="quick-actions">
          <div className="quick-actions-content">
            {quickActions.map((item, index) => (
              <button
                key={index}
                onClick={() => handleQuickAction(item.action)}
                className="quick-action-btn"
                disabled={isLoading}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="messages-container">
          <div className="messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.type}`}
              >
                <div className="message-avatar">
                  {message.type === 'user' ? (
                    <User size={16} />
                  ) : (
                    <Bot size={16} />
                  )}
                </div>
                <div className="message-content">
                  <div className="message-bubble">
                    <div className="message-text">
                      {formatMessage(message.content)}
                    </div>
                  </div>
                  <p className="message-time">
                    {message.timestamp.toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>
            ))}
            
            {/* Loading indicator */}
            {isLoading && (
              <div className="message bot">
                <div className="message-avatar">
                  <Bot size={16} />
                </div>
                <div className="message-content">
                  <div className="message-bubble loading">
                    <Loader2 size={16} className="spinning" />
                    <span>Analizando datos...</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Initializing indicator */}
            {isInitializing && messages.length === 0 && (
              <div className="message bot">
                <div className="message-avatar">
                  <Bot size={16} />
                </div>
                <div className="message-content">
                  <div className="message-bubble loading">
                    <Loader2 size={16} className="spinning" />
                    <span>Inicializando agente MCP...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="input-area">
          <div className="input-container">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Pregúntame sobre entregas, ingresos, o cualquier tema de cadena de suministro..."
              className="message-input"
              rows="1"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="send-button"
            >
              <Send size={20} />
            </button>
          </div>
          <p className="input-help">
            Presiona Enter para enviar • Shift+Enter para salto de línea
          </p>
        </div>
      </div>
    </div>
  );
};

export default SupplyChainChatbot;
