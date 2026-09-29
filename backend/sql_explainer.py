'''SQL explanation module for the optional "Explain SQL" feature.

Separate from sql_node.py's SQL-generation pipeline on purpose: this module only
turns an already-generated SQL query back into plain English, it never generates or
modifies SQL. It reuses the same LLM configuration (model/key/temperature from
.env) but its own LLM instance, so nothing here can affect SQL generation.
'''
import os

from dotenv import load_dotenv
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

# Load .env explicitly rather than relying on another module having done so
# first as an import-order side effect (as sql_node.py currently does).
load_dotenv()

# Same model/credentials as sql_node.py's LLM, configured from the same env vars.
# A separate, small-output instance keeps this feature fully decoupled from the
# generation pipeline.
# Same max_retries/timeout reasoning as sql_node.py's LLM: bounds worst-case
# failure latency for non-retryable errors (invalid key, quota exceeded).
LLM = ChatGoogleGenerativeAI(
    model=os.getenv("LLM_MODEL"),
    temperature=0,
    api_key=os.getenv("LLM_API_KEY"),
    max_output_tokens=256,
    max_retries=2,
    timeout=30,
)

explain_prompt = PromptTemplate.from_template("""
        You are a helpful data analyst. In at most 2-3 short, plain-English sentences,
        explain what the SQL query below does, in the context of the original question.
        Do not repeat the raw SQL back verbatim. Be concise.

        Question:
        {question}

        SQL:
        {sql}

        Explanation:
        """)


def _extract_text(out) -> str:
    """Extract plain text from an LLM response, whether `content` is a string or
    a list of typed blocks (as newer Gemini models return). Mirrors the same
    handling used in sql_node.py's sql_generator_node.
    """
    if hasattr(out, "content"):
        out = out.content

    if isinstance(out, list):
        out = "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in out
        )

    return str(out).strip()


def explain_sql(question: str, sql: str) -> str:
    """Generate a short, human-readable explanation of a SQL query."""
    prompt_text = explain_prompt.format(question=question, sql=sql)
    out = LLM.invoke(prompt_text)
    return _extract_text(out)
