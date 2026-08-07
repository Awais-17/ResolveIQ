"""services.security — Prompt Injection & Input Guardrails.

Provides sanitization and detection of prompt injection attacks, jailbreak attempts,
and instruction-override attempts in incoming customer support queries.
"""

import re
import structlog

log = structlog.get_logger("resolveiq.security")

# Common prompt injection patterns and instruction override markers
PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior)\s+instructions",
    r"system\s*prompt",
    r"you\s+are\s+now\s+a",
    r"disregard\s+the\s+above",
    r"reveal\s+your\s+(instructions|prompt|system|secrets)",
    r"override\s+rules",
    r"jailbreak",
    r"dan\s+mode",
    r"developer\s+mode",
]

COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in PROMPT_INJECTION_PATTERNS]


class SecurityCheckResult:
    def __init__(self, is_safe: bool, reason: str | None = None, sanitized_text: str = ""):
        self.is_safe = is_safe
        self.reason = reason
        self.sanitized_text = sanitized_text


def scan_prompt_injection(text: str) -> SecurityCheckResult:
    """Scans query text for prompt injection patterns and dangerous instruction overrides.

    Returns a SecurityCheckResult indicating safety status and sanitized output.
    """
    if not text or not text.strip():
        return SecurityCheckResult(is_safe=True, sanitized_text="")

    cleaned = text.strip()

    for pattern in COMPILED_PATTERNS:
        if pattern.search(cleaned):
            log.warning("prompt_injection_detected", pattern=pattern.pattern, text_snippet=cleaned[:50])
            return SecurityCheckResult(
                is_safe=False,
                reason=f"Potential prompt injection pattern detected: '{pattern.pattern}'",
                sanitized_text="[BLOCKED: Inappropriate query format]",
            )

    # Basic boundary delimiter escaping
    sanitized = cleaned.replace("```", "'''")

    return SecurityCheckResult(is_safe=True, sanitized_text=sanitized)
