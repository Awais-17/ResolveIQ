# ResolveIQ orchestrator — Cloud Run container image.
# Optimized for cold-start + warm-concurrency on Cloud Run.

FROM python:3.11-slim as base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install build deps for firebase-admin / google-cloud-firestore wheels.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential gcc \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cache layer).
COPY requirements.txt pyproject.toml ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy application code.
COPY . /app/orchestrator
ENV PYTHONPATH="/app:${PYTHONPATH}"

EXPOSE 8080

# Cloud Run injects PORT env var; we honour it.
CMD uvicorn orchestrator.main:app --host 0.0.0.0 --port ${PORT:-8080}
