FROM python:3.11-slim
WORKDIR /app
COPY services/memory-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY shared /app/shared
COPY services/memory-service /app/services/memory-service
ENV PYTHONPATH=/app
WORKDIR /app/services/memory-service
EXPOSE 8104
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8104"]
