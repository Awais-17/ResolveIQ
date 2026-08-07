"""Seed the KB + changelog Vertex AI Search datastores from local markdown files.

- Reads every `*.md` in `data/kb_seed/` → uploads into `resolveiq-kb`.
- Reads `data/changelog_seed/*.md` → uploads into `resolveiq-changelog`.

Idempotent: re-running the script overwrites the documents with the same id.

Usage:
    python scripts/seed_kb.py

Requires:
    gcloud auth application-default login
    python scripts/create_datastores.py   (run first)
"""
from __future__ import annotations

import os
import sys
import time
import uuid
from pathlib import Path

from google.api_core.client_options import ClientOptions
from google.cloud import discoveryengine_v1 as ds

REPO_ROOT = Path(__file__).resolve().parents[1]
PROJECT   = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION  = "global"


def _client() -> ds.DocumentService:
    return ds.DocumentServiceClient(
        client_options=ClientOptions(api_endpoint=f"{LOCATION}-discoveryengine.googleapis.com")
    )


def upsert_document(client: ds.DocumentService, datastore: str, *, doc_id: str, title: str, content: str) -> None:
    parent = f"projects/{PROJECT}/locations/{LOCATION}/collections/default_collection/dataStores/{datastore}"
    doc = ds.Document(
        id=doc_id,
        name=f"{parent}/branches/default_branch/documents/{doc_id}",
        struct_data={
            "title": title,
            "body":  content,
            "tags":  ["seeded"],
            "source": "scripts/seed_kb.py",
        },
        content={
            "mime_type": "text/plain",
            "raw_bytes": content.encode("utf-8"),
        },
    )
    try:
        client.create_document(parent=f"{parent}/branches/default_branch", document=doc, document_id=doc_id)
        print(f"  ✓ created {doc_id}")
    except Exception as exc:
        # If exists, update instead.
        if "ALREADY_EXISTS" in str(exc) or "already exists" in str(exc):
            client.update_document(document=doc, allow_missing=True)
            print(f"  ✓ updated {doc_id}")
        else:
            raise


def seed_corpus(client: ds.DocumentService, *, datastore: str, src_dir: Path) -> int:
    files = sorted(src_dir.glob("*.md"))
    for f in files:
        text = f.read_text(encoding="utf-8")
        # First non-empty non-front-matter line = title
        title = "Untitled"
        for line in text.splitlines():
            l = line.strip().lstrip("#").strip()
            if l and not l.startswith("<!--"):
                title = l
                break
        doc_id = "seed-" + f.stem
        upsert_document(client, datastore, doc_id=doc_id, title=title, content=text)
    return len(files)


def main() -> None:
    if not PROJECT:
        print("Set GOOGLE_CLOUD_PROJECT first.", file=sys.stderr); sys.exit(1)

    kb_datastore        = os.getenv("VERTEX_AI_SEARCH_KB_DATASTORE",        "resolveiq-kb")
    changelog_datastore = os.getenv("VERTEX_AI_SEARCH_CHANGELOG_DATASTORE", "resolveiq-changelog")

    client = _client()
    print(f"Seeding KB datastore {kb_datastore} from data/kb_seed/")
    n_kb = seed_corpus(client, datastore=kb_datastore,        src_dir=REPO_ROOT / "data" / "kb_seed")
    print(f"  {n_kb} KB articles processed.\n")

    print(f"Seeding changelog datastore {changelog_datastore} from data/changelog_seed/")
    n_cl = seed_corpus(client, datastore=changelog_datastore, src_dir=REPO_ROOT / "data" / "changelog_seed")
    print(f"  {n_cl} changelog files processed.")

    print("\nDone. Allow a couple of minutes for the index to refresh before querying.")


if __name__ == "__main__":
    main()
