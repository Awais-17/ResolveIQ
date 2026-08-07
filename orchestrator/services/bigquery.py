"""services.bigquery — Enterprise Analytics Integration.

Streams resolved tickets to BigQuery for reporting and analytics.
"""
import structlog
from ..config import get_settings

log = structlog.get_logger("resolveiq.bigquery")
_settings = get_settings()

async def stream_ticket_to_bq(ticket_data: dict) -> None:
    """
    Asynchronously streams the resolved ticket data to BigQuery.
    """
    if not _settings.uses_real_ai:
        log.info("bigquery.stub", action="stream_ticket", ticket_id=ticket_data.get("ticket_id"))
        return

    try:
        from google.cloud import bigquery
        client = bigquery.Client(project=_settings.google_project)
        dataset_id = f"{_settings.google_project}.resolveiq_analytics"
        table_id = f"{dataset_id}.tickets"
        
        # Ensure payload is BQ compatible
        row_to_insert = {
            "ticket_id": ticket_data.get("ticket_id"),
            "channel": ticket_data.get("channel"),
            "status": ticket_data.get("status"),
            "confidence": ticket_data.get("confidence", 0.0),
            "timestamp": ticket_data.get("timestamp").isoformat() if ticket_data.get("timestamp") else None
        }

        # For the hackathon, we assume the dataset/table is pre-created or we just attempt the insert
        # In a real scenario, table schema would be explicitly verified.
        errors = client.insert_rows_json(table_id, [row_to_insert])
        if errors:
            log.warning("bigquery.insert_errors", errors=errors)
        else:
            log.info("bigquery.stream_success", ticket_id=ticket_data.get("ticket_id"))
    except Exception as err:
        log.warning("bigquery.stream_fallback", error=str(err))
