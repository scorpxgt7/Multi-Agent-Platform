FROM python:3.11-slim
WORKDIR /app
COPY services/skill-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY shared /app/shared
COPY services/skill-service /app/services/skill-service
ENV PYTHONPATH=/app
WORKDIR /app/services/skill-service
EXPOSE 8101
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8101"]
