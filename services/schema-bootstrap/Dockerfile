FROM python:3.11-slim
WORKDIR /app
COPY services/schema-bootstrap/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY shared /app/shared
COPY services/schema-bootstrap /app/services/schema-bootstrap
ENV PYTHONPATH=/app
WORKDIR /app/services/schema-bootstrap
CMD ["python", "main.py"]
