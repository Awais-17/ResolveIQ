"""services.rag — Vertex AI Search retrievers (KB + changelog) + RAG Corpus ingestion.

Phase 4 wiring. Until real mode is enabled these wrappers raise
NotImplementedStub. The nodes layered above them short-circuit on
`_settings.uses_real_rag` and so never call them in stub mode.
"""
from __future__ import annotations

from typing import Any

import structlog

from ..config import get_settings

log = structlog.get_logger("resolveiq.rag")
_settings = get_settings()


class NotImplementedStub(RuntimeError):
    pass


# Module-level caches & local in-memory stores (used when uses_real_rag is False).
_retriever_kb: Any | None = None
_retriever_changelog: Any | None = None

_LOCAL_KB_STORE: list[dict] = []
_LOCAL_CHANGELOG_STORE: list[dict] = []


def _init_local_stores() -> None:
    """Load local markdown seed files into in-memory KB and changelog stores."""
    from pathlib import Path
    repo_root = Path(__file__).resolve().parents[2]

    if not _LOCAL_KB_STORE:
        kb_dir = repo_root / "data" / "kb_seed"
        if kb_dir.exists():
            for f in sorted(kb_dir.glob("*.md")):
                if f.name == "README.md":
                    continue
                text = f.read_text(encoding="utf-8")
                title = f.stem
                for line in text.splitlines():
                    l = line.strip().lstrip("#").strip()
                    if l and not l.startswith("<!--"):
                        title = l
                        break
                _LOCAL_KB_STORE.append({
                    "id": f"seed-{f.stem}",
                    "title": title,
                    "body": text,
                    "score": 0.85,
                })

    if not _LOCAL_CHANGELOG_STORE:
        cl_dir = repo_root / "data" / "changelog_seed"
        if cl_dir.exists():
            for f in sorted(cl_dir.glob("*.md")):
                text = f.read_text(encoding="utf-8")
                title = f.stem
                for line in text.splitlines():
                    l = line.strip().lstrip("#").strip()
                    if l:
                        title = l
                        break
                _LOCAL_CHANGELOG_STORE.append({
                    "id": f"cl-{f.stem}",
                    "title": title,
                    "body": text,
                    "score": 0.85,
                })


def _search_local(store: list[dict], query: str, top_k: int) -> list[dict]:
    """Keyword, prefix & stem overlap relevance scoring for local in-memory RAG."""
    _init_local_stores()
    if not query or not store:
        return []

    import re
    stopwords = {
        "the", "a", "an", "and", "or", "to", "of", "in", "for", "is", "are", "with",
        "on", "at", "by", "my", "we", "i", "you", "it", "this", "that", "why", "does",
        "how", "what", "do", "have", "can", "get", "give", "me", "us", "want", "like",
        "need", "offer", "sell", "contain", "any", "some"
    }
    query_tokens = set(re.findall(r"\w+", query.lower())) - stopwords
    if not query_tokens:
        return []

    scored = []
    for doc in store:
        doc_text = f"{doc.get('title', '')} {doc.get('body', '')}".lower()
        doc_tokens = set(re.findall(r"\w+", doc_text)) - stopwords

        matches = 0
        for qt in query_tokens:
            if qt in doc_tokens or qt in doc_text:
                matches += 1
            elif len(qt) > 3 and any(dt.startswith(qt[:4]) or qt.startswith(dt[:4]) for dt in doc_tokens if len(dt) > 3):
                matches += 1

        if matches > 0:
            title_text = doc.get('title', '').lower()
            title_matches = sum(1 for qt in query_tokens if qt in title_text)
            coverage = matches / len(query_tokens)
            
            if coverage >= 0.75 or (title_matches >= 1 and coverage >= 0.50):
                score = min(0.95, round(0.70 + 0.25 * coverage, 2))
            elif coverage >= 0.50:
                score = round(0.50 + 0.20 * coverage, 2)
            else:
                score = round(coverage * 0.40, 2)
                
            if score >= 0.25:
                scored.append(({**doc, "score": score}, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    results = [item[0] for item in scored[:top_k]]
    return results


def _get_retriever(datastore: str | None) -> Any:
    """Lazily build a Vertex AI Search retriever (langchain-google-community)."""
    if not _settings.uses_real_rag:
        raise NotImplementedStub("RAG retriever requested in stub mode")

    from langchain_google_community import VertexAISearchRetriever

    return VertexAISearchRetriever(
        project_id=_settings.google_project,
        location_id="global",
        data_store_id=datastore,
        get_extractive_answers=True,
        max_documents=_settings.top_k,
        max_extractive_answer_count=_settings.top_k,
    )


async def retrieve_kb(*, query: str, top_k: int | None = None) -> list[dict]:
    """Retrieve top-`k` KB chunks relevant to `query`."""
    k = top_k or _settings.top_k

    if not _settings.uses_real_rag:
        # Use local in-memory RAG
        results = _search_local(_LOCAL_KB_STORE, query, k)
        log.info("rag.local_kb_retrieved", query=query, found=len(results))
        return results

    global _retriever_kb
    if _retriever_kb is None:
        _retriever_kb = _get_retriever(_settings.kb_datastore)
    docs = await _retriever_kb.ainvoke(query)
    return [
        {
            "id": d.metadata.get("id") or d.metadata.get("doc_id") or f"kb-{i}",
            "title": d.metadata.get("title") or d.metadata.get("doc_title") or "",
            "body": d.page_content,
            "score": float(d.metadata.get("score") or 0.0),
        }
        for i, d in enumerate(docs[:k])
    ]


async def retrieve_changelog(*, query: str, top_k: int = 5) -> list[dict]:
    """Retrieve recent deploy notes relevant to an incident cluster."""
    if not _settings.uses_real_rag:
        results = _search_local(_LOCAL_CHANGELOG_STORE, query, top_k)
        if not results and _LOCAL_CHANGELOG_STORE:
            # Fallback to returning recent changelogs for incident analysis
            return _LOCAL_CHANGELOG_STORE[:top_k]
        return results

    global _retriever_changelog
    if _retriever_changelog is None:
        _retriever_changelog = _get_retriever(_settings.changelog_datastore)
    docs = await _retriever_changelog.ainvoke(query)
    return [
        {
            "id": d.metadata.get("id") or f"cl-{i}",
            "title": d.metadata.get("title") or "",
            "body": d.page_content,
            "score": float(d.metadata.get("score") or 0.0),
        }
        for i, d in enumerate(docs[:top_k])
    ]


async def index_kb_article(*, article_id: str, article) -> None:
    """Push a freshly generated KB article into the RAG index (and local store)."""
    _init_local_stores()
    doc = {
        "id": article_id,
        "title": getattr(article, "title", "New Article"),
        "body": getattr(article, "body", ""),
        "score": 0.90,
    }
    # Prepend to local KB store so newly learned articles take precedence
    _LOCAL_KB_STORE.insert(0, doc)
    log.info("rag.index_kb_article.indexed", article_id=article_id, title=doc["title"])

    if _settings.uses_real_rag:
        log.warning(
            "rag.index_kb_article.managed_push",
            article_id=article_id,
            title=article.title,
        )
