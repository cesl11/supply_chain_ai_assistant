# backend_api.py 
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio
import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langchain_mcp_adapters.tools import load_mcp_tools
from langchain_mcp_adapters.prompts import load_mcp_prompt
from langgraph.prebuilt import ToolNode
from langgraph.graph import StateGraph, END
from MCPAgentModels import AgentState, AgentExecutor
from langchain_groq import ChatGroq

# logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# enviroment variables
load_dotenv()
GROQ_API_KEY = os.getenv('GROQ_API_KEY')

# Global variables
agent_executor = None
initialization_error = None
mcp_session = None
mcp_connection = None

class MCPConnectionManager:
    """Handles MCP conection."""
    
    def __init__(self):
        self.session = None
        self.read_stream = None
        self.write_stream = None
        self.connection = None
        
    async def connect(self):
        """Establish MCP connection"""
        try:
            server_params = StdioServerParameters(command='python', args=['MCPAnalysisServer.py'])
            
            # connect stdio 
            self.connection = stdio_client(server_params)
            self.read_stream, self.write_stream = await self.connection.__aenter__()
            
            # create session
            self.session = ClientSession(read_stream=self.read_stream, write_stream=self.write_stream)
            await self.session.__aenter__()
            
            # Initialize connection
            await self.session.initialize()
            logger.info("MCP connection successful")
            
            return self.session
            
        except Exception as e:
            logger.error(f"Error connecting MCP: {e}")
            await self.disconnect()
            raise
    
    async def disconnect(self):
        """Closes MCP connection."""
        try:
            if self.session:
                await self.session.__aexit__(None, None, None)
                self.session = None
                
            if self.connection:
                await self.connection.__aexit__(None, None, None)
                self.connection = None
                
            logger.info("Connection MCP closed.")
            
        except Exception as e:
            logger.error(f"Error closing MCP connection: {e}")

# manager
mcp_manager = MCPConnectionManager()

async def initialize_agent():
    """Initialize the MCP agent with persistent session"""
    global agent_executor, initialization_error
    
    try:
        logger.info("Initializing  agent...")
        
        if not GROQ_API_KEY:
            raise ValueError("API_KEY not founded")
        
        session = await mcp_manager.connect()
        
        # Load tools, resources, and prompts
        toolkit = await load_mcp_tools(session)
        logger.info(f"Herramientas cargadas: {len(toolkit)}")
        
        try:
            data_schema_raw = await session.read_resource(uri='supply-chain-server://table_schema')
            data_schema = data_schema_raw.contents[0].text
        except Exception as e:
            logger.warning(f"Error fetching data schema: {e}")
            data_schema = "No schema available"
        
        try:
            agent_system_prompt_raw = await load_mcp_prompt(
                session=session, 
                name='Data_analyst_system_prompt', 
                arguments={'data_schema': data_schema}
            )
            agent_system_prompt = agent_system_prompt_raw[0].content
        except Exception as e:
            logger.warning(f"Error fetching system prompt: {e}")
            agent_system_prompt = """You are a helpful Supply Chain AI Assistant. 
            You can help analyze supply chain data, generate insights, and answer questions about operations.
            Be professional, helpful, and provide actionable insights."""
        
        # Create LLM with tools
        llm = ChatGroq(
            model='openai/gpt-oss-120b',
            api_key=GROQ_API_KEY,
            temperature=0.0,
            model_kwargs={'tool_choice': 'auto'}
        ).bind_tools(toolkit)
        
        logger.info("LLM initialized successfully.")
        
        # Define agent nodes
        async def call_model(state: AgentState):
            model_response = await llm.ainvoke(state['messages'])
            return {'messages': [model_response]}
        
        tool_node = ToolNode(toolkit)
        
        def should_continue(state: AgentState) -> str:
            last_message = state['messages'][-1]
            if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
                return 'continue_tools'
            return 'end'
        
        # Build graph
        graph_constructor = StateGraph(AgentState)
        graph_constructor.add_node('agent', call_model)
        graph_constructor.add_node('action', tool_node)
        graph_constructor.set_entry_point('agent')
        graph_constructor.add_conditional_edges(
            'agent',
            should_continue,
            {'continue_tools': 'action', 'end': END}
        )
        graph_constructor.add_edge('action', 'agent')
        
        app_graph = graph_constructor.compile()
        agent_executor = AgentExecutor(app=app_graph, system_prompt=agent_system_prompt)
        
        logger.info("Agent initialized successfully.")
        initialization_error = None
        return agent_executor
        
    except Exception as e:
        error_msg = f"Error initializing agent: {str(e)}"
        logger.error(error_msg)
        initialization_error = error_msg
        agent_executor = None
        await mcp_manager.disconnect() 
        raise

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager"""
    logger.info("Starting app...")
    try:
        await initialize_agent()
    except Exception as e:
        logger.error(f"Error starting app: {e}")
    
    yield
    
    logger.info("Closing aplication...")
    await mcp_manager.disconnect()

app = FastAPI(
    title="Supply Chain AI Assistant API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class ChatMessage(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str
    status: str

class HealthResponse(BaseModel):
    status: str
    agent_ready: bool
    error: Optional[str] = None

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy" if agent_executor is not None else "initializing",
        agent_ready=agent_executor is not None,
        error=initialization_error
    )

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(message: ChatMessage):
    """Chat endpoint for frontend"""
    global agent_executor
    
    if not agent_executor:
        if initialization_error:
            raise HTTPException(status_code=503, detail=f"Agent initialization failed: {initialization_error}")
        else:
            raise HTTPException(status_code=503, detail="Agent is still initializing, please try again in a few seconds")
    
    try:
        # Get response from agent
        response = await agent_executor.chat(message.message)
        
        return ChatResponse(
            response=response,
            status="success"
        )
    
    except Exception as e:
        logger.error(f"Error processing chat message: {str(e)}")

        if "ClosedResourceError" in str(e) or "closed" in str(e).lower():
            logger.warning("MCP session closed error detected, trying to reconnect...")
            try:
                await initialize_agent()
                # Retry the request
                response = await agent_executor.chat(message.message)
                return ChatResponse(
                    response=response,
                    status="success"
                )
            except Exception as reconnect_error:
                logger.error(f"Error reconnecting: {reconnect_error}")
                raise HTTPException(status_code=503, detail="MCP connection lost and reconnection failed")
        
        raise HTTPException(status_code=500, detail=f"Error processing message: {str(e)}")

@app.get("/introduction")
async def get_introduction():
    """Get agent introduction"""
    global agent_executor
    
    if not agent_executor:
        return {
            "introduction": """¡Hola! Soy tu Asistente de IA para Cadena de Suministro.

Puedo ayudarte con:
• Análisis de inventarios y niveles de stock
• Evaluación del rendimiento de proveedores  
• Pronósticos de demanda y planificación
• Identificación de riesgos en la cadena de suministro
• Optimización de procesos logísticos

**Nota**: El sistema está inicializándose. Algunas funciones avanzadas estarán disponibles en unos momentos.

¿En qué puedo ayudarte hoy?"""
        }
    
    try:
        intro = await agent_executor.introduce_yourself()
        return {"introduction": intro}
    except Exception as e:
        logger.error(f"Error getting introduction: {str(e)}")
        # Fallback message
        return {
            "introduction": """¡Hola! Soy tu Asistente de IA para Cadena de Suministro.

Estoy aquí para ayudarte a analizar datos, generar insights y responder preguntas sobre tus operaciones de cadena de suministro.

¿Cómo puedo asistirte hoy?"""
        }

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Supply Chain AI Assistant API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)