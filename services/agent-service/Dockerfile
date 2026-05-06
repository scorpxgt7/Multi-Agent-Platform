FROM python:3.11-slim
WORKDIR /app
COPY services/agent-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY shared /app/shared
COPY services/agent-service /app/services/agent-service
ENV PYTHONPATH=/app
WORKDIR /app/services/agent-service
EXPOSE 8102
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8102"]
