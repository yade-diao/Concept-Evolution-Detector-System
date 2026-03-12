# ─────────────────────────────────────────────────────────────
# Stage 0: build the Vue frontend
# ─────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# vite.config.js: outDir = '../web/static/dist' → writes to /app/web/static/dist
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 1: build / install dependencies
# ─────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build tools needed for some scientific packages
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ─────────────────────────────────────────────────────────────
# Stage 2: lean runtime image
# ─────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copy installed packages from the builder stage
COPY --from=builder /install /usr/local

# Copy project source
COPY cedfs/       ./cedfs/
COPY web/         ./web/
COPY experiments/ ./experiments/
COPY setup.py     .

# Create the image output directory (Flask writes PNGs here at runtime)
RUN mkdir -p web/static/images

# Copy Vue production build from the frontend stage
COPY --from=frontend-builder /app/web/static/dist ./web/static/dist

# Non-root user for security
RUN adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FLASK_APP=web/app.py \
    FLASK_ENV=production

EXPOSE 8080

CMD ["python", "web/app.py"]
