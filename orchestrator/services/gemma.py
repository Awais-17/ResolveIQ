"""services.gemma — Gemma 2 Integration for local/cloud sentiment analysis.

For the hackathon, this demonstrates using the open-weights Gemma model 
(e.g., via HuggingFace Inference API or a local pipeline) to classify 
ticket sentiment. It falls back to a stub if no API key is provided.
"""
import os
import json
import structlog
import aiohttp
from ..config import get_settings

log = structlog.get_logger("resolveiq.gemma")
_settings = get_settings()

async def analyze_sentiment(text: str) -> str:
    """
    Uses Gemma to analyze the sentiment of a ticket.
    Returns one of: 'Frustrated', 'Urgent', 'Neutral', 'Positive'.
    """
    if not _settings.uses_real_ai:
        return "Neutral"

    # In a real scenario, this could hit a Vertex AI Model Garden Gemma endpoint
    # or Hugging Face Inference API for Gemma-2b-it.
    hf_api_key = os.getenv("HUGGINGFACE_API_KEY")
    if not hf_api_key:
        # Mocked Gemma logic for Hackathon purposes when key isn't provided
        text_lower = text.lower()
        if "urgent" in text_lower or "asap" in text_lower or "down" in text_lower:
            return "Urgent"
        if "angry" in text_lower or "unacceptable" in text_lower or "wtf" in text_lower:
            return "Frustrated"
        if "thanks" in text_lower or "great" in text_lower:
            return "Positive"
        return "Neutral"

    try:
        url = "https://api-inference.huggingface.co/models/google/gemma-2b-it"
        headers = {"Authorization": f"Bearer {hf_api_key}", "Content-Type": "application/json"}
        prompt = f"Analyze the sentiment of this customer ticket and respond with exactly one word (Frustrated, Urgent, Neutral, Positive):\nTicket: {text}\nSentiment:"
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json={"inputs": prompt, "parameters": {"max_new_tokens": 5, "temperature": 0.0}}) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    result = data[0].get("generated_text", "").replace(prompt, "").strip()
                    for s in ["Frustrated", "Urgent", "Neutral", "Positive"]:
                        if s.lower() in result.lower():
                            return s
                else:
                    log.warning("gemma.api_error", status=resp.status)
        return "Neutral"
    except Exception as err:
        log.warning("gemma.sentiment_fallback", error=str(err))
        return "Neutral"
