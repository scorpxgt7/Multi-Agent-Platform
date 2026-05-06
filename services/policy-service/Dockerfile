FROM python:3.11-slim
WORKDIR /app
COPY services/policy-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY shared /app/shared
COPY services/policy-service /app/services/policy-service
ENV PYTHONPATH=/app
WORKDIR /app/services/policy-service
EXPOSE 8103
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8103"]
