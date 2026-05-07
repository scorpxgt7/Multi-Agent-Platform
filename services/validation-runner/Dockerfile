FROM python:3.11-slim
WORKDIR /app
COPY services/validation-runner/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY shared /app/shared
COPY services/validation-runner /app/services/validation-runner
ENV PYTHONPATH=/app
WORKDIR /app/services/validation-runner
CMD ["python", "main.py"]
