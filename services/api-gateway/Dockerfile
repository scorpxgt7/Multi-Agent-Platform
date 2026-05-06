FROM python:3.11-slim
WORKDIR /app
COPY services/api-gateway/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY shared /app/shared
COPY services/api-gateway /app/services/api-gateway
ENV PYTHONPATH=/app
WORKDIR /app/services/api-gateway
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
