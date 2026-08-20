# Stage 1: build the UI. Node is needed only here, never at runtime.
# Vite 8 requires Node >=20.19 or >=22.12; 22 LTS satisfies it without
# depending on which 20.x patch the tag happens to point at today.
FROM node:22-alpine AS ui
WORKDIR /ui
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: the Python service, which serves the API and the built UI.
FROM python:3.11-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    OPENSIGHT_HOST=0.0.0.0 \
    OPENSIGHT_PORT=8080 \
    OPENSIGHT_DATA_DIR=/data

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=ui /ui/dist ./web/dist

# The database lives on a mounted volume, not in the image layer: a container
# filesystem is discarded on every deploy and would take the patient history
# with it.
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8080

# run.py is the desktop launcher - it opens a browser, which has no meaning in
# a container. Serve uvicorn directly.
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
