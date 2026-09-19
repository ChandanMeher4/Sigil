# Multi-stage lightweight Docker image for SIGIL Validator Nodes
FROM python:3.11-slim AS base

# Install system dependencies needed for PyMuPDF/cryptography if any
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY crypto/ ./crypto/
COPY watermark_engine/ ./watermark_engine/
COPY forensic_lab/ ./forensic_lab/
COPY validator_node/ ./validator_node/
COPY sender_tool/ ./sender_tool/
COPY recipient_client/ ./recipient_client/
COPY audit_console/ ./audit_console/
COPY admin_portal/ ./admin_portal/
COPY config/ ./config/

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "validator_node.main:app", "--host", "0.0.0.0", "--port", "8001"]
