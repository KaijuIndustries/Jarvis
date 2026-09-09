FROM python:3.11-slim

WORKDIR /app

COPY jarvis-wake/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
    && python -c "import openwakeword; openwakeword.utils.download_models()"

COPY jarvis-wake/server.py /app/server.py
COPY models/hey_friday.onnx /app/models/hey_friday.onnx

ENV WAKEWORD_MODEL=/app/models/hey_friday.onnx
ENV WAKEWORD_HOST=0.0.0.0
ENV WAKEWORD_PORT=10400

EXPOSE 10400

CMD ["python", "/app/server.py"]
