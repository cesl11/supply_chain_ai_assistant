# supply_chain_ai_assistant
_**SupplyAI**_, a business-assistance chatbot/AI agent focused on the supply chain. Its function is to help managers make decisions based on business data.

https://github.com/user-attachments/assets/779f2e30-3cd7-4bfb-bd57-621dbbb1f2f6

## Abstract
This AI agent, developed using Anthropic's **Model Context Protocol** (MCP) and the **LangGraph/LangChain** framework, uses predefined tools, prompts, and resources to work with a supply chain company's data. It can reason about user requests and execute Python code in a secure and controlled environment to respond to them, allowing it to act as an advanced data analyst capable of detecting patterns, analyzing trends, making forecasts, and answering business questions. It was designed to be a valuable tool for company executives, enabling them to make data-driven business decisions quickly and efficiently. 

## Architecture
![agent_architecture](https://github.com/user-attachments/assets/3032c57c-e3c7-47a3-9d3c-949b188e8d07)
The agent is based on an internal client-server architecture: the MCP server defines the tools the model can use (in this case, a controlled Python code execution function), the system prompt, read-only resources (the schema of the data it can analyze), and the **manner** in which it can access the data.

The client acts as a link between the application and the server through an API built on FastAPI. This is where the connection between the predefined access and analysis tools and the LangGraph agent graph structure is initialized. This results in an endpoint through which the user can interact with the agent.
