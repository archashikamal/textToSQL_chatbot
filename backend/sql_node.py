'''SQL node'''

import re
import os

from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

from retriever_node import RAGState


# max_retries/timeout are set explicitly because the client's defaults (6 retries,
# no timeout) mean a non-retryable failure (invalid key, quota exceeded) can take
# over a minute of exponential-backoff retries before surfacing an error at all --
# observed directly during testing. This bounds worst-case failure latency without
# changing anything about a successful call.
LLM = ChatGoogleGenerativeAI(model=os.getenv("LLM_MODEL"),
                                temperature=0, api_key=os.getenv("LLM_API_KEY"),
                                    max_output_tokens=1024,
                                    max_retries=2,
                                    timeout=30,
                                        )



sql_agent_prompt = PromptTemplate.from_template("""
        You are a SQL generator. Based on the following context, generate a SINGLE READ-ONLY SQLite SELECT query (no semicolons, no multiple statements).
        Context:
        {context}
        
        Question:
        {question}
        
        Rules:
        - Only generate SQL SELECT statements.
        - Return only the SQL SELECT statement.                                                
        """)

def sql_generator_node(state: RAGState) -> RAGState:
    """
    Generate SQL from the retrieved documents and user question.
    Cleans LLM output, removes markdown/code fences, and ensures only SELECT statements remain.
    """
    # 1. Combine retrieved documents
    context = "\n\n".join(state.get("retrieved_docs", []))

    # 2. Format the prompt
    prompt_text = sql_agent_prompt.format(context=context, question=state["question"])

    # 3. Call the LLM
    out =  LLM.invoke(prompt_text)

    # 4. Extract text content if output is an AIMessage or ChatResult
    if hasattr(out, "content"):
        out = out.content

    # Newer Gemini models return `content` as a list of typed blocks
    # (e.g. [{"type": "text", "text": "...", "extras": {...}}]) instead of a
    # plain string. Concatenate only the text blocks; anything else in the
    # response (signatures, thinking blocks, etc.) is not part of the SQL.
    if isinstance(out, list):
        out = "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in out
        )

    out = str(out).strip()

    # 5. Remove code fences ``` or ```sql and any leading/trailing whitespace
    out = re.sub(r"```(?:sql)?\n?", "", out, flags=re.IGNORECASE).replace("```", "").strip()

    # 6. Ensure the SQL starts with SELECT (case-insensitive)
    match = re.search(r"(select\b.*)", out, flags=re.IGNORECASE | re.DOTALL)
    if match:
        out = match.group(1).strip()
    else:
        # fallback if no SELECT found
        out = ""

    # 7. Optional: remove trailing semicolon if present
    out = out.rstrip(";").strip()

    # 8. Save cleaned SQL back to state
    state["generated_sql"] = out
    return state


# print(sql_generator_node({"question": "numero do Comércio ABC S/A"}))
