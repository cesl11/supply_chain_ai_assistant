"""This auxiliar script defines base State class and a base Executor, one for the agent nodes shared memory, and other
for manage the graph as a chatbot."""

# //// LIBRARIES //// #
# For date handlings
from datetime import datetime
# For enviromental variables 
import os
from dotenv import load_dotenv
# For type hynting
from typing import TypedDict, Annotated
# For LangChain/LagGraph 
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph.message import add_messages


# //// VARIABLES //// #
load_dotenv()
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
CURRENT_YEAR = str(datetime.now().year)


# //// BASE AGENT STATE //// #
class AgentState(TypedDict):
    messages:Annotated[list, add_messages]

# //// BASE AGENT EXECUTOR //// #
class AgentExecutor:
    """This class handles an agent executor that maintains the state of the conversation (memory)."""
    def __init__(self, app, system_prompt: str):
        """Initialize the executor with a compiled graph and a 'system' prompt."""
        self.app = app
        self.system_prompt = system_prompt
        self.thread = []
        self.data_explored = False
        self.start_chat() 
        
    async def introduce_yourself(self):
        await self.auto_explore_data()
        
        self.thread.append(HumanMessage(content='¡Hola! Por favor preséntate, dime quién eres y qué puedes hacer.'))
        final_state = await self.app.ainvoke({'messages': self.thread})
        self.thread = final_state['messages']
        ai_response = self.thread[-1].content
        return ai_response
    
    async def auto_explore_data(self):
        """Automatically explore the dataset structure at the beginning."""
        if not self.data_explored:
            exploration_code = """
# Auto-exploración inicial de los datos reales de la empresa
print("=== ESTRUCTURA DE DATOS REALES DE LA EMPRESA ===")
print(f"Forma del dataset: {df.shape}")
print(f"Columnas disponibles: {df.columns.tolist()}")
print("\\n=== TIPOS DE DATOS ===")
print(df.dtypes)
print("\\n=== PRIMERAS 5 FILAS ===")
print(df.head())
"""
            self.thread.append(HumanMessage(content=f"Explora automáticamente los datos usando: {exploration_code}"))
            final_state = await self.app.ainvoke({'messages': self.thread})
            self.thread = final_state['messages']
            self.data_explored = True

    def start_chat(self):
        """Clean up memory and initializes the conversation thread with the system prompt.
        This allows you to start a new conversation."""
        self.thread = [SystemMessage(content=self.system_prompt)]
        self.data_explored = False

    async def chat(self, user_question: str) -> str:
        """Process the next turn in chat."""
        if not self.data_explored:
            await self.auto_explore_data()
        
        self.thread.append(HumanMessage(content=user_question))
        final_state = await self.app.ainvoke({'messages': self.thread})
        self.thread = final_state['messages']
        ai_response = self.thread[-1].content
        return ai_response
    