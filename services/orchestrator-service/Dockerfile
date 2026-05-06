FROM python:3.11-slim
WORKDIR /app
COPY services/orchestrator-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY shared /app/shared
COPY services/orchestrator-service /app/services/orchestrator-service
ENV PYTHONPATH=/app
WORKDIR /app/services/orchestrator-service
EXPOSE 8105
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8105"]
