"""Create the two Vertex AI Search (Discovery Engine) datastores used by ResolveIQ.

- `resolveiq-kb`         the support knowledge base
- `resolveiq-changelog` the mock recent deploys for root-cause linking

Idempotent: if a datastore with that id already exists, it is reused.

Usage:
    python scripts/create_datastores.py

Requires Application Default Credentials with Discovery Engine Editor:
    gcloud auth application-default login
"""
from __future__ import annotations

import os
import sys
import time

from google.api_core.client_options import ClientOptions
from google.cloud import discoveryengine_v1 as ds

PROJECT   = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION  = "global"

if not PROJECT:
    print("Set GOOGLE_CLOUD_PROJECT env var first.", file=sys.stderr)
    sys.exit(1)


def _client() -> ds.DataStoreService:
    return ds.DataStoreServiceClient(
        client_options=ClientOptions(api_endpoint=f"{LOCATION}-discoveryengine.googleapis.com")
    )


def ensure_datastore(client: ds.DataStoreService, datastore_id: str, *, content_config: str, display_name: str) -> str:
    """Ensure a datastore exists; return its full resource name."""
    parent = f"projects/{PROJECT}/locations/{LOCATION}/collections/default_collection"
    full = f"{parent}/dataStores/{datastore_id}"
    try:
        ds_obj = client.get_data_store(name=full)
        print(f"  ✓ existing: {full}")
        return ds_obj.name
    except Exception:
        pass    # not found — create it

    op = client.create_data_store(
        parent=parent,
        data_store_id=datastore_id,
        data_store=ds.DataStore(
            display_name=display_name,
            industry_vertical=ds.IndustryVertical.GENERIC,
            content_config=getattr(ds.DataStore.ContentConfig, content_config),
        ),
    )
    op.result(timeout=180)
    print(f"  ✓ created:  {full}")
    return full


def main() -> None:
    print(f"Resolving datastores in project {PROJECT}, location {LOCATION}")
    client = _client()
    ensure_datastore(client, "resolveiq-kb",         content_config="CONTENT_REQUIRED", display_name="ResolveIQ KB")
    ensure_datastore(client, "resolveiq-changelog",  content_config="CONTENT_REQUIRED", display_name="ResolveIQ Changelog")
    print("\nDone. Set these in your .env:")
    print("  VERTEX_AI_SEARCH_KB_DATASTORE=resolveiq-kb")
    print("  VERTEX_AI_SEARCH_CHANGELOG_DATASTORE=resolveiq-changelog")


if __name__ == "__main__":
    main()
