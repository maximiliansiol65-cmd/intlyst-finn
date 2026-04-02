# Multi-stage Dockerfile for INTLYST API
# Build with: docker build -t intlyst-api:latest .
# Run with: docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... intlyst-api:latest

FROM python:3.9-slim as base

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements-production.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ════════════════════════════════════════════════════════════
# Production Stage
# ════════════════════════════════════════════════════════════
FROM base AS production

WORKDIR /app

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV APP_ENV=production
ENV LOG_LEVEL=INFO

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/')" || exit 1

# Expose API port
EXPOSE 8000

# Start application with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

# ════════════════════════════════════════════════════════════
# Development Stage (optional)
# ════════════════════════════════════════════════════════════
FROM base AS development

WORKDIR /app

COPY . .

ENV PYTHONUNBUFFERED=1
ENV APP_ENV=development
ENV DEBUG=True

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ════════════════════════════════════════════════════════════
# Build Instructions:
# ════════════════════════════════════════════════════════════
#
# 1. Production Build:
#    docker build --target production -t intlyst-api:latest .
#    docker run \
#      -h intlyst-api \
#      -p 8000:8000 \
#      -e ANTHROPIC_API_KEY=sk-ant-... \
#      -e JWT_SECRET=... \
#      -e STRIPE_SECRET_KEY=sk_live_... \
#      intlyst-api:latest
#
# 2. Development Build:
#    docker build --target development -t intlyst-api:dev .
#    docker run -p 8000:8000 -v $(pwd):/app intlyst-api:dev
#
# 3. With Docker Compose:
#    docker-compose up --build
#
# ════════════════════════════════════════════════════════════
# Security Best Practices:
# ════════════════════════════════════════════════════════════
#
# ✓ Non-root user (appuser) runs the process
# ✓ No pip cache to reduce image size
# ✓ Health checks enabled
# ✓ Multi-stage build for smaller production image
# ✓ Environment variables for secrets (not hardcoded)
# ✓ PYTHONUNBUFFERED for real-time logs
#
# ════════════════════════════════════════════════════════════
